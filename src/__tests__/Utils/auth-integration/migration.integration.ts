// REAL backend integration: cross-backend migration.
//
// Phase 13.2 critical investigation: does `migrateAuthState()` behave as
// assumed when the destination is a REAL backend? Only directions where BOTH
// backends are actually available are exercised; the rest are reported as NOT RUN
// rather than silently passed.
//
// The two fault-injection cases below are NOT fake-driver substitutions: they
// wrap a real backend store, failing it at a controlled point so production
// migration logic is exercised. Fake-driver behaviour was previously
// demonstrated under mocks; nothing here claims real-backend atomicity has been
// verified.

import { BufferJSON } from '../../../Utils/generics'
import { CREDS_KEY } from '../../../Utils/auth-store'
import { migrateAuthState } from '../../../Utils/auth/migration-manager'
import { CHECKS, type BackendCheck, type BackendName } from './availability'
import { blockedMarker } from './suite'
import { realStore } from './stores'
import type { AuthStore } from '../../../Types'

/** Narrows the availability union before any `.reason` access. */
const blocker = (check: BackendCheck): string | null => (check.available ? null : check.reason)

const records = (marker: string) => ({
	[CREDS_KEY]: JSON.stringify({ marker, noise: Buffer.from([1, 2, 3]) }, BufferJSON.replacer),
	'pre-key-1.json': JSON.stringify({ public: new Uint8Array([marker.length]) }, BufferJSON.replacer),
	[`session-${marker}.json`]: JSON.stringify({ nested: Buffer.from([4, 5, 6]) }, BufferJSON.replacer)
})

const snapshot = async (store: AuthStore) => store.getMany(await store.keys())
const unique = (name: string) => `it-${name}-${Date.now()}-${process.pid}`

const DIRECTIONS: [BackendName, BackendName][] = [
	['nekodb', 'sqlite'],
	['nekodb', 'redis'],
	['sqlite', 'nekodb'],
	['sqlite', 'redis'],
	['redis', 'nekodb'],
	['redis', 'sqlite']
]

// Jest forbids returning a promise from `describe`, so every direction is probed
// at module scope and the suites below are declared synchronously from the
// results. A direction with no ready backend is skipped, never passed.
const resolved = await Promise.all(
	DIRECTIONS.map(async ([from, to]) => {
		const [source, target] = await Promise.all([CHECKS[from](), CHECKS[to]()])
		return { from, to, blocked: blocker(source) ?? blocker(target) }
	})
)

const available = resolved.filter(direction => !direction.blocked)
const notRun = resolved.filter(direction => Boolean(direction.blocked))

describe.each(resolved)('migration $from → $to', ({ from, to, blocked }) => {
	if (blocked) {
		blockedMarker(`migration ${from} → ${to}: ${blocked}`)
		return
	}

	it('moves the whole session and leaves the source intact', async () => {
		const source = await realStore(from, unique(`src-${from}-${to}`))
		await source.setMany(records(from))

		const target = await realStore(to, unique(`dst-${from}-${to}`))
		const result = await migrateAuthState(source, target)

		expect(result.migrated).toBe(3)
		expect(await snapshot(source)).toEqual(records(from))
		expect(await snapshot(target)).toEqual(records(from))
	})

	it('preserves destination records the backup did not contain', async () => {
		const source = await realStore(from, unique(`keep-src-${from}-${to}`))
		await source.setMany(records(from))

		const target = await realStore(to, unique(`keep-dst-${from}-${to}`))
		await target.set(`session-foreign-${to}.json`, JSON.stringify({ keep: true }))

		await migrateAuthState(source, target)

		expect(await target.get(`session-foreign-${to}.json`)).toBe(JSON.stringify({ keep: true }))
	})

	it('overwrites matching destination records', async () => {
		const source = await realStore(from, unique(`over-src-${from}-${to}`))
		await source.setMany(records(from))

		const target = await realStore(to, unique(`over-dst-${from}-${to}`))
		await target.set(`session-${from}.json`, JSON.stringify({ stale: true }))

		await migrateAuthState(source, target)

		expect(await target.get(`session-${from}.json`)).toBe(records(from)[`session-${from}.json`])
	})

	it('keeps concurrent independent sessions isolated', async () => {
		const sourceA = await realStore(from, unique(`isoA-src-${from}-${to}`))
		const sourceB = await realStore(from, unique(`isoB-src-${from}-${to}`))
		await sourceA.setMany(records('a'))
		await sourceB.setMany(records('b'))

		await Promise.all([
			migrateAuthState(sourceA, await realStore(to, unique(`isoA-dst-${from}-${to}`))),
			migrateAuthState(sourceB, await realStore(to, unique(`isoB-dst-${from}-${to}`)))
		])

		expect(await snapshot(sourceA)).toEqual(records('a'))
		expect(await snapshot(sourceB)).toEqual(records('b'))
	})

	it('rejects migrating a store onto itself', async () => {
		const store = await realStore(from, unique(`self-${from}-${to}`))
		const error = await migrateAuthState(store, store).catch(e => e)
		expect((error as { output?: { statusCode?: number } }).output?.statusCode).toBe(400)
	})

	it('reports a verification mismatch without destroying the source', async () => {
		const source = await realStore(from, unique(`mism-src-${from}-${to}`))
		await source.setMany(records(from))

		const target = await realStore(to, unique(`mism-dst-${from}-${to}`))
		const originalKeys = await source.keys()

		// A destination that claims to hold nothing makes verification fail.
		const lying: AuthStore = {
			...target,
			getMany: async () => ({})
		}
		const error = await migrateAuthState(source, lying).catch(e => e)

		expect((error as { output?: { statusCode?: number } }).output?.statusCode).toBe(500)
		// Source is never the thing that gets rewritten.
		expect(await snapshot(source)).toEqual(records(from))
		expect(originalKeys.length).toBe(3)
	})
})

describe('migration destination-batch failure investigation (real backends where available)', () => {
	// `it.each` throws on an empty table; when nothing is available the direction
	// markers below are the only content of this suite.
	if (available.length > 0) {
		it.each(available.map(({ from, to }) => ({ from, to })))(
			'documents the destination-batch failure outcome for $from → $to',
			async ({ from, to }) => {
				// `migrateAuthState` issues exactly ONE `setMany` for the whole
				// session, so this probes the batch boundary rather than a mid-batch
				// failure. Per-record partiality is a property of each backend's own
				// `setMany` loop (SQLite, Redis, and NekoDB all loop internally) and
				// cannot be injected through the `AuthStore` seam.
				const src = await realStore(from, unique(`partial-src-${from}-${to}`))
				await src.setMany(records(from))

				const dst = await realStore(to, unique(`partial-dst-${from}-${to}`))
				const failing: AuthStore = {
					...dst,
					setMany: async () => {
						throw new Error('synthetic destination batch write failure')
					}
				}

				const error = await migrateAuthState(src, failing).catch(e => e)
				expect((error as Error).message).toContain('synthetic destination batch write failure')

				// Record, do not assert away: whether a real backend leaves a partial
				// session behind can only be observed against the backend itself, so
				// only the source side is pinned — it must stay complete either way.
				expect(await snapshot(src)).toEqual(records(from))
				expect(await snapshot(dst)).toEqual({})
			}
		)
	}

	for (const { from, to, blocked } of notRun) {
		blockedMarker(`partial-write outcome for ${from} → ${to}: ${blocked}`)
	}
})
