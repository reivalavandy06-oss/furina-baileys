import { gzipSync } from 'zlib'
import { makeAuthStateFromStore } from '../../../Utils/auth-store'
import { createNekoDBAuthStore } from '../../../Utils/auth/nekodb-auth'
import { importAuthState } from '../../../Utils/auth/backup-manager'
import { makeCacheableSignalKeyStore } from '../../../Utils/auth-utils'
import { LRUCacheStore } from '../../../Utils/cache-store'
import { makeFakeNekoDB } from './mock-stores'
import { adapterHarness, credentials, encode, snapshot } from './fault-adapters'

// These assertions express required failure semantics. If they fail against HEAD,
// preserve the reproducer and request production-fix authorization; do not mark
// them skipped/test.failing or change the assertions to accept the defect.
describe('auth recovery regression reproducers', () => {
	it('rejects a malformed stored NekoDB creds document instead of initializing a session', async () => {
		const db = makeFakeNekoDB()
		await db.insert('session', { k: 'creds.json', value: 17 })
		const store = createNekoDBAuthStore(db, 'session')
		const rejected = await makeAuthStateFromStore(store).then(
			() => false,
			() => true
		)
		// Boolean assertion deliberately avoids printing returned credential/key data.
		expect(rejected).toBe(true)
	})

	it.each(['before', 'after'] as const)('invalidates Signal key cache after a rejected %s write', async phase => {
		const harness = adapterHarness('nekodb')
		const store = harness.open()
		await store.set('creds.json', encode(credentials('cache-regression')))
		await store.set('session-peer.json', encode(Buffer.from([1])))
		const auth = await makeAuthStateFromStore(store)
		// An explicitly bounded non-TTL cache isolates persistence ordering and
		// creates no eviction timers that could outlive this test.
		const cache = new LRUCacheStore({ max: 4 })
		const cached = makeCacheableSignalKeyStore(auth.state.keys, undefined, cache)
		try {
			await cached.get('session', ['peer'])
			const error = harness.faults.fail('write', phase)
			await expect(cached.set({ session: { peer: Buffer.from([2]) } })).rejects.toBe(error)
			const persisted = (await makeAuthStateFromStore(harness.open())).state.keys
			const disk = await persisted.get('session', ['peer'])
			const memory = await cached.get('session', ['peer'])
			expect(Buffer.from(memory.peer ?? []).equals(Buffer.from(disk.peer ?? Buffer.alloc(0)))).toBe(true)
		} finally {
			cache.flushAll()
			harness.faults.dispose()
		}
	})

	it('rejects an array keys map before mutating a restore destination', async () => {
		const harness = adapterHarness('sqlite')
		const target = harness.open()
		const buffer = gzipSync(encode({ version: 1, timestamp: 0, backend: 'sqlite', data: { keys: ['{}'] } }))
		try {
			const rejected = await importAuthState(target, buffer).then(
				() => false,
				() => true
			)
			const untouched = Object.keys(await snapshot(target)).length === 0
			expect({ rejected, untouched }).toEqual({ rejected: true, untouched: true })
		} finally {
			harness.faults.dispose()
		}
	})

	it('recovers a same-instance read after deletion committed but its acknowledgement was lost', async () => {
		const harness = adapterHarness('nekodb')
		const store = harness.open()
		try {
			await store.set('session-peer.json', encode(Buffer.from([1])))
			const error = harness.faults.fail('delete', 'after')
			await expect(store.remove('session-peer.json')).rejects.toBe(error)
			expect(await harness.open().get('session-peer.json')).toBeNull()
			// Recovery invalidates the stale opaque ID and re-resolves the record.
			await expect(store.get('session-peer.json')).resolves.toBeNull()
		} finally {
			harness.faults.dispose()
		}
	})
})
