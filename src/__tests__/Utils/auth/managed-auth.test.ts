import { jest } from '@jest/globals'
import { deferred } from '../../TestUtils/storage-faults'
import { makeFakeRedis, makeFakeSqlite, makeFakeMongoCollection } from './mock-stores'

let quitCount = 0
let failure: Error | undefined
let closeFailure: Error | undefined
let writeGate: ReturnType<typeof deferred> | undefined
let writeEntered: ReturnType<typeof deferred> | undefined
const client = {
	...makeFakeRedis(),
	connect: async () => {
		if (failure) throw failure
	},
	get: async () => null,
	set: async () => {
		writeEntered?.release()
		await writeGate?.promise
	},
	quit: async () => {
		quitCount++
		if (closeFailure) throw closeFailure
	}
}
jest.unstable_mockModule('redis', () => ({ createClient: () => client }), { virtual: true })
jest.unstable_mockModule(
	'better-sqlite3',
	() => ({
		default: class {
			private readonly db = makeFakeSqlite()
			prepare(sql: string) {
				return sql.startsWith('CREATE') ? { all: () => [], run: () => undefined } : this.db.prepare(sql)
			}
			close() {
				quitCount++
			}
		}
	}),
	{ virtual: true }
)
jest.unstable_mockModule(
	'mongodb',
	() => ({
		MongoClient: class {
			async connect() {}
			db() {
				return { collection: () => makeFakeMongoCollection() }
			}
			async close() {
				quitCount++
			}
		}
	}),
	{ virtual: true }
)
const {
	useRedisAuthState,
	useSQLiteAuthState,
	useMongoDBAuthState,
	createRedisAuthStore,
	closeAuthState,
	makeAuthStateFromStore
} = await import('../../../Utils/auth-store')

type LegacyKeys = keyof Awaited<ReturnType<typeof useRedisAuthState>>
const legacyKeys: LegacyKeys[] = ['state', 'saveCreds']
const noCloseKey: 'close' extends LegacyKeys ? never : true = true
void legacyKeys
void noCloseKey

describe('library-owned auth lifecycle', () => {
	beforeEach(() => {
		quitCount = 0
		failure = undefined
		closeFailure = undefined
		writeGate = undefined
		writeEntered = undefined
	})
	it('preserves the historical object shape and closes an internally created client exactly once', async () => {
		const auth = await useRedisAuthState()
		expect(Object.keys(auth).sort()).toEqual(['saveCreds', 'state'])
		expect(auth.state).toBeDefined()
		expect(typeof auth.saveCreds).toBe('function')
		await Promise.all([closeAuthState(auth), closeAuthState(auth)])
		await closeAuthState(auth)
		expect(quitCount).toBe(1)
		await expect(auth.saveCreds()).rejects.toThrow('closing')
	})
	it.each(['sqlite', 'mongodb'] as const)('closes a successful owned %s wrapper exactly once', async backend => {
		const auth = backend === 'sqlite' ? await useSQLiteAuthState('synthetic') : await useMongoDBAuthState()
		const first = closeAuthState(auth)
		expect(closeAuthState(auth)).toBe(first)
		await first
		expect(quitCount).toBe(1)
	})
	it('rejects lifecycle access for a borrowed wrapper without closing its store', async () => {
		const store = {
			backend: 'memory',
			get: async () => null,
			getMany: async () => ({}),
			set: async () => undefined,
			setMany: async () => undefined,
			remove: async () => true,
			keys: async () => []
		}
		const borrowed = await makeAuthStateFromStore(store)
		await expect(closeAuthState(borrowed)).rejects.toThrow('does not own a closable resource')
	})
	it('preserves close errors and never retries a failed close concurrently', async () => {
		const auth = await useRedisAuthState()
		const original = new Error('synthetic close failure')
		closeFailure = original
		const first = closeAuthState(auth)
		expect(closeAuthState(auth)).toBe(first)
		await expect(first).rejects.toMatchObject({ cause: original, errors: [original] })
		expect(quitCount).toBe(1)
	})
	it('waits for an admitted save before close and shares concurrent completion', async () => {
		const auth = await useRedisAuthState()
		writeGate = deferred()
		writeEntered = deferred()
		const save = auth.saveCreds()
		await writeEntered.promise
		const a = closeAuthState(auth),
			b = closeAuthState(auth)
		expect(a).toBe(b)
		expect(quitCount).toBe(0)
		writeGate.release()
		await Promise.all([save, a, b])
		expect(quitCount).toBe(1)
	})
	it('cleans up owned initialization failure without hiding the cause', async () => {
		const original = new Error('synthetic connect failure')
		failure = original
		await expect(useRedisAuthState()).rejects.toBe(original)
		expect(quitCount).toBe(1)
	})
	it('retains raw Redis legacy ownership and supports explicitly borrowed clients', async () => {
		const borrowed = createRedisAuthStore(client, 'synthetic:', { ownership: 'borrowed' })
		await borrowed.close?.()
		expect(quitCount).toBe(0)
		const legacy = createRedisAuthStore(client)
		await Promise.all([legacy.close?.(), legacy.close?.()])
		expect(quitCount).toBe(1)
	})
})
