import { gzipSync } from 'zlib'
import { CREDS_KEY, makeAuthStateFromStore } from '../../../Utils/auth-store'
import { exportAuthState, importAuthState, peekAuthBackup } from '../../../Utils/auth/backup-manager'
import { adapterHarness, backends, encode, expectRecords, sessionRecords, snapshot } from './fault-adapters'

describe.each(backends)('%s backup/restore with injected storage failures', backend => {
	let harness: ReturnType<typeof adapterHarness>
	beforeEach(() => {
		harness = adapterHarness(backend)
	})
	afterEach(() => {
		harness.faults.dispose()
	})

	it.each([1, 2])('rejects backup when source read operation %i fails', async nth => {
		const store = harness.open()
		await store.setMany(sessionRecords())
		const error = harness.faults.fail('read', 'before', nth)
		await expect(exportAuthState(store)).rejects.toBe(error)
		expectRecords(await snapshot(store), sessionRecords())
		const recovered = await exportAuthState(store)
		expect(peekAuthBackup(recovered).hasCreds).toBe(true)
	})

	it('rejects backup if serialization of the envelope fails; does not modify the source', async () => {
		const store = harness.open()
		await store.setMany(sessionRecords())
		// Fault in a returned storage value: the adapter contract is strings, so this
		// intentionally malformed result tests the serialization boundary only.
		const malformed = {
			...store,
			getMany: async () =>
				({
					record: {
						toJSON() {
							throw new Error('synthetic encoding failure')
						}
					}
				}) as unknown as Record<string, string>
		}
		await expect(exportAuthState(malformed)).rejects.toThrow('synthetic encoding failure')
		expectRecords(await snapshot(store), sessionRecords())
	})

	it.each(['gzip', 'json', 'version', 'record'] as const)(
		'validates invalid %s before any destination mutation',
		async kind => {
			const target = harness.open('target')
			await target.set('sentinel', encode({ preserve: true }))
			const envelope = {
				version: kind === 'version' ? 9 : 1,
				timestamp: 0,
				backend,
				data: { creds: '{}', keys: { bad: kind === 'record' ? 17 : '{}' } }
			}
			const buffer = kind === 'gzip' ? Buffer.from('not-gzip') : gzipSync(kind === 'json' ? '{' : encode(envelope))
			const writes = harness.faults.trace.filter(point => point.operation === 'write').length
			await expect(importAuthState(target, buffer)).rejects.toMatchObject({ output: { statusCode: 400 } })
			expect(harness.faults.trace.filter(point => point.operation === 'write')).toHaveLength(writes)
			expect(await snapshot(target)).toEqual({ sentinel: encode({ preserve: true }) })
		}
	)

	it('rejects restore to unavailable storage and recovers after reconnect', async () => {
		const source = harness.open('source')
		await source.setMany(sessionRecords())
		const backup = await exportAuthState(source)
		const target = harness.open('target')
		const error = harness.faults.disconnect()
		await expect(importAuthState(target, backup)).rejects.toBe(error)
		harness.faults.reconnect()
		expect(await target.keys()).toEqual([])
		await importAuthState(target, backup)
		expectRecords(await snapshot(harness.open('target')), sessionRecords())
	})

	it.each(['before', 'after'] as const)(
		'reports partial restore when the second write fails %s persistence',
		async phase => {
			const source = harness.open('source')
			await source.setMany(sessionRecords())
			const backup = await exportAuthState(source)
			const target = harness.open('target')
			const error = harness.faults.fail('write', phase, 2)
			await expect(importAuthState(target, backup)).rejects.toBe(error)
			const reopened = harness.open('target')
			expect((await reopened.get(CREDS_KEY)) === sessionRecords()[CREDS_KEY]).toBe(true)
			expect(await reopened.get('pre-key-1.json')).toBe(phase === 'after' ? sessionRecords()['pre-key-1.json'] : null)
			expect(await reopened.get('session-peer.json')).toBeNull()
			// Restore documents overwrite semantics, not atomicity. A retry converges.
			await importAuthState(reopened, backup)
			expectRecords(await snapshot(harness.open('target')), sessionRecords())
		}
	)

	it('exposes invalid serialized record content when the restored session is opened', async () => {
		const target = harness.open('target')
		const invalid = gzipSync(encode({ version: 1, timestamp: 0, backend, data: { creds: '{invalid', keys: {} } }))
		// The envelope validator accepts raw strings; it does not validate the embedded auth JSON.
		await importAuthState(target, invalid)
		await expect(makeAuthStateFromStore(target)).rejects.toBeInstanceOf(SyntaxError)
	})

	it('characterizes permissive metadata defaults rather than claiming strict metadata validation', async () => {
		const target = harness.open('target')
		const buffer = gzipSync(encode({ version: 1, timestamp: 'invalid', backend: 17, data: { keys: {} } }))
		const info = await importAuthState(target, buffer)
		expect(info.timestamp).toBe(0)
		expect(info.backend).toBe('unknown')
		expect(await target.keys()).toEqual([])
	})
})

describe('controlled backup interruption and concurrent writes', () => {
	it('rejects an interrupted backup read and releases all pending operations', async () => {
		const harness = adapterHarness('redis')
		const store = harness.open()
		await store.setMany(sessionRecords())
		const gate = harness.faults.hold('read')
		const pending = Promise.allSettled([exportAuthState(store)])
		try {
			await gate.entered
			const error = harness.faults.disconnect()
			gate.release()
			expect((await pending)[0]).toEqual({ status: 'rejected', reason: error })
			harness.faults.reconnect()
			expect(peekAuthBackup(await exportAuthState(store)).hasCreds).toBe(true)
		} finally {
			harness.faults.dispose()
			await pending
		}
	})

	it('characterizes enumeration-before-read as non-snapshot backup under concurrent additions', async () => {
		const harness = adapterHarness('redis')
		const source = harness.open('source')
		await source.setMany(sessionRecords())
		const gate = harness.faults.hold('read', 'after')
		const pending = exportAuthState(source)
		const observed = Promise.allSettled([pending])
		try {
			await gate.entered
			await source.set('late-key.json', encode({ late: true }))
			gate.release()
			const backup = await pending
			const target = harness.open('target')
			await importAuthState(target, backup)
			expect(await target.get('late-key.json')).toBeNull()
			expect(await source.get('late-key.json')).not.toBeNull()
		} finally {
			harness.faults.dispose()
			await observed
		}
	})
})
