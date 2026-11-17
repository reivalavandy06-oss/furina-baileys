import { CREDS_KEY, makeAuthStateFromStore } from '../../../Utils/auth-store'
import { adapterHarness, backends, credentials, decode, encode, sessionRecords } from './fault-adapters'

describe.each(backends)('%s adapter with fault-injected driver', backend => {
	let harness: ReturnType<typeof adapterHarness>
	beforeEach(() => {
		harness = adapterHarness(backend)
	})
	afterEach(() => {
		harness.faults.dispose()
	})

	it('rejects unavailable credentials reads, then restores the same session after reconnect', async () => {
		const store = harness.open()
		await store.setMany(sessionRecords())
		const error = harness.faults.disconnect()
		await expect(makeAuthStateFromStore(store)).rejects.toBe(error)
		harness.faults.reconnect()
		const { state } = await makeAuthStateFromStore(harness.open())
		expect(state.creds.platform).toBe('test-a')
		expect(Buffer.from(state.creds.noiseKey.private).equals(credentials('test-a').noiseKey.private)).toBe(true)
	})

	it('surfaces a one-shot read error without replacing saved credentials', async () => {
		const store = harness.open()
		await store.set(CREDS_KEY, encode(credentials('retained')))
		const error = harness.faults.fail('read')
		await expect(makeAuthStateFromStore(store)).rejects.toBe(error)
		expect((await makeAuthStateFromStore(store)).state.creds.platform).toBe('retained')
	})

	it.each(['{invalid', 'undefined'])(
		'rejects malformed serialized creds (%s) and recovers after replacement',
		async raw => {
			const store = harness.open()
			await store.set(CREDS_KEY, raw)
			await expect(makeAuthStateFromStore(store)).rejects.toBeInstanceOf(SyntaxError)
			await store.set(CREDS_KEY, encode(credentials('repaired')))
			expect((await makeAuthStateFromStore(store)).state.creds.platform).toBe('repaired')
		}
	)

	it.each(['before', 'after'] as const)(
		'surfaces write rejection %s persistence and verifies actual storage',
		async phase => {
			const store = harness.open()
			await store.set('record', encode({ version: 1 }))
			const error = harness.faults.fail('write', phase)
			await expect(store.set('record', encode({ version: 2 }))).rejects.toBe(error)
			expect(decode(await harness.open().get('record'))).toEqual({ version: phase === 'before' ? 1 : 2 })
			await store.set('record', encode({ version: 3 }))
			expect(decode(await harness.open().get('record'))).toEqual({ version: 3 })
		}
	)

	it('surfaces saveCreds persistence failure and permits a successful retry', async () => {
		const store = harness.open()
		await store.set(CREDS_KEY, encode(credentials('original')))
		const { state, saveCreds } = await makeAuthStateFromStore(store)
		state.creds.platform = 'changed'
		const error = harness.faults.fail('write')
		await expect(saveCreds()).rejects.toBe(error)
		expect((await makeAuthStateFromStore(harness.open())).state.creds.platform).toBe('original')
		await saveCreds()
		expect((await makeAuthStateFromStore(harness.open())).state.creds.platform).toBe('changed')
	})

	it('rejects unserializable credentials before touching storage', async () => {
		const store = harness.open()
		await store.set(CREDS_KEY, encode(credentials('original')))
		const { state, saveCreds } = await makeAuthStateFromStore(store)
		const circular: { self?: unknown } = {}
		circular.self = circular
		state.creds.additionalData = circular
		const writes = harness.faults.trace.filter(point => point.operation === 'write').length
		await expect(saveCreds()).rejects.toBeInstanceOf(TypeError)
		expect(harness.faults.trace.filter(point => point.operation === 'write')).toHaveLength(writes)
		delete state.creds.additionalData
		await saveCreds()
		expect((await makeAuthStateFromStore(harness.open())).state.creds.platform).toBe('original')
	})

	it.each(['before', 'after'] as const)(
		'surfaces delete rejection %s persistence, including ambiguous completion',
		async phase => {
			const store = harness.open()
			await store.set('record', encode({ retained: true }))
			const error = harness.faults.fail('delete', phase)
			await expect(store.remove('record')).rejects.toBe(error)
			// A fresh adapter avoids asserting that NekoDB's cached opaque ID survives external deletion.
			const reopened = harness.open()
			expect(await reopened.get('record')).toBe(phase === 'before' ? encode({ retained: true }) : null)
			await reopened.set('record', encode({ recovered: true }))
			await reopened.remove('record')
			expect(await harness.open().get('record')).toBeNull()
		}
	)

	it('recovers a failed deletion after reconnect', async () => {
		const store = harness.open()
		await store.set('record', encode({ alive: true }))
		const error = harness.faults.disconnect()
		await expect(store.remove('record')).rejects.toBe(error)
		harness.faults.reconnect()
		expect(await store.get('record')).not.toBeNull()
		await store.remove('record')
		expect(await harness.open().get('record')).toBeNull()
	})

	it('preserves nested binary data and null fields after a failed write and retry', async () => {
		const store = harness.open()
		const value = { nested: { bytes: new Uint8Array([0, 128, 255]), buffer: Buffer.from([7, 0]), nil: null } }
		const error = harness.faults.fail('write')
		await expect(store.set('record', encode(value))).rejects.toBe(error)
		await store.set('record', encode(value))
		const recovered = decode<typeof value>(await harness.open().get('record'))
		expect(Buffer.isBuffer(recovered.nested.bytes)).toBe(true)
		expect(Array.from(recovered.nested.bytes)).toEqual([0, 128, 255])
		expect(recovered.nested.buffer.equals(value.nested.buffer)).toBe(true)
		expect(recovered.nested.nil).toBeNull()
	})

	it('propagates null-as-deletion failures through the Signal key store', async () => {
		const store = harness.open()
		await store.setMany(sessionRecords())
		const { state } = await makeAuthStateFromStore(store)
		const error = harness.faults.fail('delete')
		await expect(state.keys.set({ 'pre-key': { '1': null } })).rejects.toBe(error)
		expect(await store.get('pre-key-1.json')).not.toBeNull()
		await state.keys.set({ 'pre-key': { '1': null } })
		expect(await harness.open().get('pre-key-1.json')).toBeNull()
	})

	it('keeps independent session namespaces intact during simultaneous failure and recovery', async () => {
		const a = harness.open('a')
		const b = harness.open('b')
		await Promise.all([a.setMany(sessionRecords('a')), b.setMany(sessionRecords('b'))])
		const error = harness.faults.fail('write')
		const outcomes = await Promise.allSettled([
			a.set('session-peer.json', encode({ owner: 'a' })),
			b.set('session-peer.json', encode({ owner: 'b' }))
		])
		expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1)
		expect(outcomes.some(result => result.status === 'rejected' && result.reason === error)).toBe(true)
		await Promise.all([
			a.set('session-peer.json', encode({ owner: 'a' })),
			b.set('session-peer.json', encode({ owner: 'b' }))
		])
		expect(decode(await harness.open('a').get('session-peer.json'))).toEqual({ owner: 'a' })
		expect(decode(await harness.open('b').get('session-peer.json'))).toEqual({ owner: 'b' })
		expect((await makeAuthStateFromStore(a)).state.creds.platform).toBe('a')
		expect((await makeAuthStateFromStore(b)).state.creds.platform).toBe('b')
	})

	it('settles concurrent same-key writes after a one-shot failure without assuming a winning order', async () => {
		const store = harness.open()
		await store.set('record', encode({ generation: 0 }))
		harness.faults.fail('write')
		const results = await Promise.allSettled([
			store.set('record', encode({ generation: 1 })),
			store.set('record', encode({ generation: 2 }))
		])
		expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
		const actual = decode<{ generation: number }>(await harness.open().get('record'))
		expect([1, 2]).toContain(actual.generation)
		await store.set('record', encode({ generation: 3 }))
		expect(decode(await harness.open().get('record'))).toEqual({ generation: 3 })
	})

	it('surfaces a driver timeout without claiming that a driver timeout policy was implemented', async () => {
		const store = harness.open()
		const error = harness.faults.fail(
			'read',
			'before',
			1,
			Object.assign(new Error('synthetic timeout'), { code: 'ETIMEDOUT' })
		)
		await expect(store.get('missing')).rejects.toBe(error)
		expect(await store.get('missing')).toBeNull()
	})
})

describe.each(['nekodb', 'redis'] as const)('%s controlled async interruption', backend => {
	it('surfaces connection loss while deletion is held and succeeds after recovery', async () => {
		const harness = adapterHarness(backend)
		const store = harness.open()
		await store.set('record', encode({ alive: true }))
		const gate = harness.faults.hold('delete')
		const pending = Promise.allSettled([store.remove('record')])
		try {
			await gate.entered
			const error = harness.faults.disconnect()
			gate.release()
			expect((await pending)[0]).toEqual({ status: 'rejected', reason: error })
			harness.faults.reconnect()
			expect(await store.get('record')).not.toBeNull()
			await store.remove('record')
			expect(await harness.open().get('record')).toBeNull()
		} finally {
			harness.faults.dispose()
			await pending
		}
	})

	it('reads committed data while a write is pending and rejects a disconnect before persistence', async () => {
		const harness = adapterHarness(backend)
		const store = harness.open()
		await store.set('record', encode({ revision: 0 }))
		const gate = harness.faults.hold('write')
		const pending = store.set('record', encode({ revision: 1 }))
		const settled = Promise.allSettled([pending])
		try {
			await gate.entered
			expect(decode(await store.get('record'))).toEqual({ revision: 0 })
			const error = harness.faults.disconnect()
			gate.release()
			expect((await settled)[0]).toEqual({ status: 'rejected', reason: error })
			harness.faults.reconnect()
			expect(decode(await harness.open().get('record'))).toEqual({ revision: 0 })
			await store.set('record', encode({ revision: 2 }))
			expect(decode(await store.get('record'))).toEqual({ revision: 2 })
		} finally {
			harness.faults.dispose()
			await settled
		}
	})

	it('does not equate a disconnect after persistence with an absent write', async () => {
		const harness = adapterHarness(backend)
		const store = harness.open()
		await store.set('record', encode({ revision: 0 }))
		const gate = harness.faults.hold('write', 'after')
		const pending = Promise.allSettled([store.set('record', encode({ revision: 1 }))])
		try {
			await gate.entered
			const error = harness.faults.disconnect()
			gate.release()
			expect((await pending)[0]).toEqual({ status: 'rejected', reason: error })
			harness.faults.reconnect()
			expect(decode(await harness.open().get('record'))).toEqual({ revision: 1 })
		} finally {
			harness.faults.dispose()
			await pending
		}
	})
})
