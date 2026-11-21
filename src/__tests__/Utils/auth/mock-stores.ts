import type { AuthStore } from '../../../Types'
import { createMongoAuthStore, createRedisAuthStore, createSQLiteAuthStore } from '../../../Utils/auth-store'
import { createNekoDBAuthStore } from '../../../Utils/auth/nekodb-auth'

/** `better-sqlite3`-shaped stand-in: a real SQL parser is not needed, only the
 * four statements `createSQLiteAuthStore` issues. */
import { BufferJSON } from '../../../Utils/generics'
import { initAuthCreds } from '../../../Utils/auth-utils'
import { CREDS_KEY } from '../../../Utils/auth-store'

/** Matches `SqliteStatement` from Utils/auth-store.ts without exporting it. */
interface FakeStatement {
	all: (...params: unknown[]) => unknown[]
	run: (...params: unknown[]) => unknown
}

export const makeFakeSqlite = () => {
	const rows = new Map<string, string>()

	const statement = (
		all: (...params: unknown[]) => unknown[],
		run: (...params: unknown[]) => unknown
	): FakeStatement => ({ all, run })

	const prepare = (sql: string): FakeStatement => {
		if (sql.startsWith('UPDATE ')) {
			return statement(
				() => [],
				(...params) => {
					const [replacement, key, expected] = params.map(String)
					if (rows.get(key!) !== expected) return { changes: 0 }
					rows.set(key!, replacement!)
					return { changes: 1 }
				}
			)
		}
		if (sql.includes('SELECT value FROM')) {
			return statement(
				(...params: unknown[]) => {
					const value = rows.get(String(params[0]))
					return value === undefined ? [] : [{ value }]
				},
				() => undefined
			)
		}

		if (sql.includes('INSERT OR REPLACE INTO')) {
			return statement(
				() => [],
				(...params: unknown[]) => {
					rows.set(String(params[0]), String(params[1]))
				}
			)
		}

		if (sql.includes('DELETE FROM')) {
			// `DELETE FROM t` (clear) vs `DELETE FROM t WHERE key = ?` (remove)
			const scoped = sql.includes('WHERE key =')

			return statement(
				() => [],
				(...params: unknown[]) => {
					if (scoped) {
						if (sql.includes('AND value = ?') && rows.get(String(params[0])) !== params[1]) return { changes: 0 }
						return { changes: rows.delete(String(params[0])) ? 1 : 0 }
					} else rows.clear()
				}
			)
		}

		if (sql.includes('SELECT key FROM')) {
			return statement(
				() => [...rows.keys()].map(key => ({ key })),
				() => undefined
			)
		}

		throw new Error(`unexpected sql: ${sql}`)
	}

	return { prepare }
}

/** `redis`-shaped stand-in with real key-prefix behaviour. */
export const makeFakeRedis = () => {
	const rows = new Map<string, string>()

	return {
		connect: async () => undefined,
		get: async (key: string) => rows.get(key) ?? null,
		mGet: async (keys: string[]) => keys.map(key => rows.get(key) ?? null),
		set: async (key: string, value: string) => {
			rows.set(key, value)
		},
		del: async (keys: string[]) => {
			let deleted = 0
			for (const key of keys) {
				if (rows.delete(key)) deleted += 1
			}

			return deleted
		},
		keys: async (pattern: string) => [...rows.keys()].filter(key => key.startsWith(pattern.slice(0, -1))),
		quit: async () => undefined
	}
}

/** `mongodb` collection-shaped stand-in. */
export const makeFakeMongoCollection = () => {
	const rows = new Map<string, string>()

	const keyOf = (query: unknown) => (query as { key?: string } | null | undefined)?.key ?? ''

	return {
		findOne: async (query: unknown) => {
			const key = keyOf(query)
			const value = rows.get(key)
			return value === undefined ? null : { key, value }
		},
		find: (query: unknown) => {
			const wanted = (query as { key?: { $in?: string[] } } | null | undefined)?.key?.$in

			return {
				toArray: async () =>
					(wanted ?? [...rows.keys()])
						.filter(key => rows.has(key))
						.map(key => ({ key, value: rows.get(key) as string }))
			}
		},
		replaceOne: async (query: unknown, doc: unknown) => {
			const value = (doc as { value?: string } | null | undefined)?.value
			if (typeof value === 'string') rows.set(keyOf(query), value)

			return { modifiedCount: 1 }
		},
		deleteOne: async (query: unknown) => {
			rows.delete(keyOf(query))
			return { deletedCount: 1 }
		},
		deleteMany: async () => {
			rows.clear()
			return { deletedCount: 1 }
		}
	}
}

/** `@nekodb/client`-shaped stand-in: server-assigned ids, `search` by value. */
export const makeFakeNekoDB = () => {
	const docs = new Map<string, Record<string, unknown>>()
	let counter = 0

	return {
		insert: async (collection: string, data: object) => {
			const id = `doc_${++counter}`
			docs.set(id, { id, ...data })
			return id
		},
		get: async (collection: string, id: string) => {
			const doc = docs.get(id)
			if (!doc) {
				const error = new Error(`Document not found: ${collection}/${id}`)
				error.name = 'NotFoundError'
				throw error
			}

			return { ...doc }
		},
		update: async (collection: string, id: string, data: object) => {
			const doc = docs.get(id)
			if (!doc) throw new Error('not found')
			docs.set(id, { ...doc, ...data })

			return id
		},
		delete: async (collection: string, id: string) => {
			docs.delete(id)

			return id
		},
		search: async (collection: string, query: object) =>
			[...docs.values()]
				.filter(doc => Object.entries(query).every(([field, value]) => doc[field] === value))
				.map(doc => String(doc.id))
	}
}

/** Fresh stores on a clean backing, one per call. */
export const sqliteStore = async (table = 'furina_auth') => {
	const store = createSQLiteAuthStore(makeFakeSqlite(), table)
	await store.clear?.()

	return store
}

export const redisStore = async (prefix = 'furina:auth:') => {
	const store = createRedisAuthStore(makeFakeRedis(), prefix)
	await store.clear?.()

	return store
}

export const mongoStore = async () => {
	const store = createMongoAuthStore(makeFakeMongoCollection())
	await store.clear?.()

	return store
}

export const nekodbStore = async (collectionName = 'baileys_auth') => {
	const store = createNekoDBAuthStore(makeFakeNekoDB(), collectionName)
	await store.clear?.()

	return store
}

/** Wraps a store, failing `getMany` from the nth call — used to force the
 * verification step of a migration to fail so rollback can be observed. */
export const withFailingGetMany = (inner: AuthStore, failFrom: number): AuthStore => {
	let calls = 0

	return {
		...inner,
		// Exercise the common-interface recovery path; native conditional recovery has its own tests.
		compareAndSet: undefined,
		getMany: async keys => {
			calls += 1
			const real = await inner.getMany(keys)

			return calls >= failFrom ? {} : real
		}
	}
}

/** Writes creds plus `count` signal keys, exactly like a paired session would. */
export const seed = async (store: AuthStore, count: number) => {
	// returned so callers compare against the very same creds — initAuthCreds rolls
	// a fresh random noiseKey on every call
	const creds = initAuthCreds()
	await store.set(CREDS_KEY, JSON.stringify(creds, BufferJSON.replacer))

	for (let index = 1; index <= count; index += 1) {
		await store.set(
			`pre-key-${index}.json`,
			JSON.stringify({ public: new Uint8Array([index]), private: new Uint8Array([index]) }, BufferJSON.replacer)
		)
	}

	return creds
}

/** Every record in the store as `key -> raw JSON string`. */
export const readAll = async (store: AuthStore) => await store.getMany(await store.keys())

export interface Marker {
	keep?: boolean
	marker?: string
}

export const parseMarker = (raw: string | null): Marker => JSON.parse(String(raw)) as Marker
