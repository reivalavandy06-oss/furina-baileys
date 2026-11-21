// furina-baileys — auth-store.ts
// Multi-backend auth state.
//
// The file backend is built in (that is what `useMultiFileAuthState` uses).
// SQLite / MongoDB / Redis are OPTIONAL peer dependencies, resolved lazily via
// dynamic import so a normal install never pulls them in.
//
// Every backend speaks the same `AuthStore` record contract, so
// Every helper retains `{ state, saveCreds }`; internally owned DB wrappers also expose `close()`.

import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { proto } from '../../WAProto/index.js'
import type { AuthStateOptions, AuthStore, AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '../Types'
import { initAuthCreds } from './auth-utils'
import { BufferJSON } from './generics'
import { quoteSQLiteIdentifier } from './auth/sqlite-identifier'
import {
	closeAfterFailedInitialization,
	closeOnce,
	manageAuthenticationState,
	type ManagedAuthenticationState
} from './auth/owned-resource'
import { assertCredentialsObject, missingFileOnly, parseAuthRecord, storedString } from './auth/read-validation'

export type { AuthStore, AuthStateOptions }
export type { ManagedAuthenticationState }

/** Record key holding AuthenticationCreds. Shared so backup/migration tooling
 * can identify the creds record without re-deriving the naming scheme. */
export const CREDS_KEY = 'creds.json'

const recordKey = (type: string, id: string) => `${type}-${id}.json`

const decodeRecord = <T>(raw: string, type: string): T => {
	const value = parseAuthRecord(raw)
	if (type === 'app-state-sync-key' && value) {
		return proto.Message.AppStateSyncKeyData.fromObject(value) as unknown as T
	}

	return value as T
}

type LooseModule = Record<string, unknown>

interface SqliteStatement {
	all: (...params: unknown[]) => unknown[]
	run: (...params: unknown[]) => unknown
}

interface SqliteDb {
	prepare: (sql: string) => SqliteStatement
	close?: () => void
}

/**
 * Resolves an optional peer dependency. The specifier is a variable so
 * TypeScript cannot resolve it statically — these packages are absent from a
 * normal install.
 */
const lazyLoad = async (specifier: string): Promise<LooseModule> => {
	try {
		return (await import(/* webpackIgnore: true */ specifier)) as LooseModule
	} catch {
		throw new Error(
			`[furina-auth] optional peer dependency "${specifier}" tidak ditemukan. Install untuk memakai backend ini.`
		)
	}
}

/**
 * Builds an `AuthenticationState` on top of an arbitrary {@link AuthStore}.
 * This is the shared core used by every `useXAuthState` helper.
 */
export const makeAuthStateFromStore = async (
	store: AuthStore
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
	const rawCreds = await store.get(CREDS_KEY)
	if (rawCreds !== null && typeof rawCreds !== 'string') {
		throw new Error('Stored authentication credentials are malformed')
	}
	const parsed = rawCreds === null ? initAuthCreds() : parseAuthRecord(rawCreds)
	assertCredentialsObject(parsed)
	const creds = parsed as AuthenticationCreds

	return {
		state: {
			creds,
			keys: {
				get: async <T extends keyof SignalDataTypeMap>(
					type: T,
					ids: string[]
				): Promise<Record<string, SignalDataTypeMap[T]>> => {
					const wanted = ids.map(id => recordKey(String(type), id))
					const found = await store.getMany(wanted)
					const data: Record<string, SignalDataTypeMap[T]> = {}

					for (const id of ids) {
						const raw = found[recordKey(String(type), id)]
						data[id] = raw !== undefined ? decodeRecord<SignalDataTypeMap[T]>(raw, String(type)) : (null as never)
					}

					return data
				},
				set: async (data: Record<string, unknown>) => {
					for (const category in data) {
						const entries = data[category] as Record<string, unknown>
						for (const id in entries) {
							const value = entries[id]
							const key = recordKey(category, id)
							if (value) {
								await store.set(key, JSON.stringify(value, BufferJSON.replacer))
							} else {
								await store.remove(key)
							}
						}
					}
				}
			}
		},
		saveCreds: async () => {
			await store.set(CREDS_KEY, JSON.stringify(creds, BufferJSON.replacer))
		}
	}
}

// ── file backend (default) ───────────────────────────────────────────────
const safeFileName = (name: string) => name.replace(/\//g, '__').replace(/:/g, '-')

export const createFileAuthStore = async (folder: string): Promise<AuthStore> => {
	const info = await stat(folder).catch(missingFileOnly)
	if (info && !info.isDirectory()) {
		throw new Error(`found something that is not a directory at ${folder}`)
	}
	if (!info) await mkdir(folder, { recursive: true })

	const path = (key: string) => join(folder, safeFileName(key))

	return {
		backend: 'file',
		get: async key => {
			try {
				return await readFile(path(key), { encoding: 'utf-8' })
			} catch (error) {
				return missingFileOnly(error)
			}
		},
		getMany: async keys => {
			const out: Record<string, string> = {}
			for (const key of keys) {
				const value = await readFile(path(key), 'utf-8').catch(missingFileOnly)
				if (value !== null) out[key] = value
			}
			return out
		},
		set: async (key, value) => {
			await writeFile(path(key), value)
		},
		setMany: async entries => {
			for (const [key, value] of Object.entries(entries)) {
				await writeFile(path(key), value)
			}
		},
		remove: async key => {
			try {
				await unlink(path(key))
				return true
			} catch {
				return false
			}
		},
		keys: async () => readdir(folder),
		clear: async () => {
			for (const name of await readdir(folder)) {
				await unlink(join(folder, name)).catch(() => {})
			}
		}
	}
}

// ── optional backends (lazy dynamic imports) ─────────────────────────────
/**
 * Builds an `AuthStore` over an already-open SQLite database. The caller owns the
 * connection (and is responsible for creating the table) — this keeps the store
 * pure enough to unit test against a mock `prepare()`.
 */
export const createSQLiteAuthStore = (db: SqliteDb, table = 'furina_auth'): AuthStore => {
	const identifier = quoteSQLiteIdentifier(table)
	const read = async (key: string): Promise<string | null> => {
		const rows = db.prepare('SELECT value FROM ' + identifier + ' WHERE key = ?').all(key) as {
			value: string
		}[]
		return rows.length ? storedString(rows[0]?.value) : null
	}

	return {
		backend: 'sqlite',
		compareAndSet: async (key, expected, replacement) => {
			const result =
				replacement === null
					? db.prepare('DELETE FROM ' + identifier + ' WHERE key = ? AND value = ?').run(key, expected)
					: db
							.prepare('UPDATE ' + identifier + ' SET value = ? WHERE key = ? AND value = ?')
							.run(replacement, key, expected)
			return (result as { changes?: number } | undefined)?.changes === 1
		},
		get: read,
		getMany: async keys => {
			const out: Record<string, string> = {}
			for (const key of keys) {
				const value = await read(key)
				if (value !== null) out[key] = value
			}
			return out
		},
		set: async (key, value) => {
			db.prepare('INSERT OR REPLACE INTO ' + identifier + ' (key, value) VALUES (?, ?)').run(key, value)
		},
		setMany: async entries => {
			for (const [key, value] of Object.entries(entries)) {
				db.prepare('INSERT OR REPLACE INTO ' + identifier + ' (key, value) VALUES (?, ?)').run(key, value)
			}
		},
		remove: async key => {
			db.prepare('DELETE FROM ' + identifier + ' WHERE key = ?').run(key)
			return true
		},
		keys: async () => (db.prepare('SELECT key FROM ' + identifier).all() as { key: string }[]).map(row => row.key),
		clear: async () => {
			db.prepare('DELETE FROM ' + identifier).run()
		}
	}
}

export const useSQLiteAuthState = async (
	folder: string,
	options: AuthStateOptions = {}
): Promise<ManagedAuthenticationState> => {
	const table = options.table ?? 'furina_auth'
	const identifier = quoteSQLiteIdentifier(table)
	const mod = await lazyLoad('better-sqlite3')
	const Database = mod['default'] as new (path: string) => SqliteDb
	const path = options.path ?? join(folder, 'auth.db')

	const db = new Database(path)
	const close = closeOnce(() => db.close?.())
	return closeAfterFailedInitialization(async () => {
		db.prepare('CREATE TABLE IF NOT EXISTS ' + identifier + ' (key TEXT PRIMARY KEY, value TEXT)').run()
		return manageAuthenticationState(await makeAuthStateFromStore(createSQLiteAuthStore(db, table)), close)
	}, close)
}

/**
 * Builds an `AuthStore` over an already-connected MongoDB collection. `close` is
 * optional — pass the client's disconnect when the store also owns the session.
 */
export const createMongoAuthStore = (collection: MongoCollectionLike, close?: () => Promise<void>): AuthStore => ({
	backend: 'mongodb',
	get: async key => {
		const record = await collection.findOne({ key })
		return record === null ? null : storedString(record.value)
	},
	getMany: async keys => {
		const out: Record<string, string> = {}
		const rows = await collection.find({ key: { $in: keys } }).toArray()
		for (const row of rows) out[row.key] = storedString(row.value)
		return out
	},
	set: async (key, value) => {
		await collection.replaceOne({ key }, { key, value }, { upsert: true })
	},
	setMany: async entries => {
		for (const [key, value] of Object.entries(entries)) {
			await collection.replaceOne({ key }, { key, value }, { upsert: true })
		}
	},
	remove: async key => {
		await collection.deleteOne({ key })
		return true
	},
	keys: async () => (await collection.find({}, { projection: { key: 1 } }).toArray()).map(row => row.key),
	clear: async () => {
		await collection.deleteMany({})
	},
	close: close ? closeOnce(close) : undefined
})

export const useMongoDBAuthState = async (options: AuthStateOptions = {}): Promise<ManagedAuthenticationState> => {
	const mod = await lazyLoad('mongodb')
	const MongoClient = mod['MongoClient'] as new (url: string) => MongoClientLike
	const client = new MongoClient(options.url ?? 'mongodb://127.0.0.1:27017')
	const close = closeOnce(() => client.close())
	return closeAfterFailedInitialization(async () => {
		await client.connect()
		const database = options.database ?? 'furina'
		const collectionName = options.table ?? 'auth'
		const collection = client.db(database).collection(collectionName) as MongoCollectionLike
		return manageAuthenticationState(await makeAuthStateFromStore(createMongoAuthStore(collection)), close)
	}, close)
}

/**
 * Builds an `AuthStore` over an already-connected Redis client. `prefix` isolates
 * one session inside a shared database.
 */
export const createRedisAuthStore = (
	client: RedisClientLike,
	prefix = 'furina:auth:',
	options: { ownership?: 'owned' | 'borrowed' } = {}
): AuthStore => ({
	backend: 'redis',
	get: async key => await client.get(prefix + key),
	getMany: async keys => {
		const values = await client.mGet(keys.map(key => prefix + key))
		const out: Record<string, string> = {}
		keys.forEach((key, index) => {
			const value = values[index]
			if (value !== null && value !== undefined) out[key] = value
		})
		return out
	},
	set: async (key, value) => {
		await client.set(prefix + key, value)
	},
	setMany: async entries => {
		for (const [key, value] of Object.entries(entries)) {
			await client.set(prefix + key, value)
		}
	},
	remove: async key => {
		await client.del([prefix + key])
		return true
	},
	keys: async () => (await client.keys(`${prefix}*`)).map(key => key.slice(prefix.length)),
	clear: async () => {
		await client.del(await client.keys(`${prefix}*`))
	},
	close: closeOnce(async () => {
		if (options.ownership !== 'borrowed') await client.quit()
	})
})

export const useRedisAuthState = async (options: AuthStateOptions = {}): Promise<ManagedAuthenticationState> => {
	const mod = await lazyLoad('redis')
	const createClient = mod['createClient'] as (opts?: { url?: string }) => RedisClientLike
	const prefix = `${options.table ?? 'furina:auth'}:`
	const client = createClient({ url: options.url })
	const close = closeOnce(async () => {
		if (client.isOpen !== false) await client.quit()
	})
	return closeAfterFailedInitialization(async () => {
		await client.connect()
		return manageAuthenticationState(
			await makeAuthStateFromStore(createRedisAuthStore(client, prefix, { ownership: 'borrowed' })),
			close
		)
	}, close)
}

// ── structural types for the optional clients (no runtime dependency) ────
interface AuthRecord {
	key: string
	value: string
}

interface MongoCursorLike {
	toArray: () => Promise<AuthRecord[]>
}

interface MongoCollectionLike {
	findOne: (query: unknown) => Promise<AuthRecord | null>
	find: (query?: unknown, projection?: unknown) => MongoCursorLike
	replaceOne: (query: unknown, doc: unknown, options?: unknown) => Promise<unknown>
	deleteOne: (query: unknown) => Promise<unknown>
	deleteMany: (query?: unknown) => Promise<unknown>
}

interface MongoClientLike {
	connect: () => Promise<void>
	db: (name: string) => { collection: (name: string) => unknown }
	close: () => Promise<void>
}

interface RedisClientLike {
	isOpen?: boolean
	connect: () => Promise<void>
	get: (key: string) => Promise<string | null>
	mGet: (keys: string[]) => Promise<(string | null)[]>
	set: (key: string, value: string) => Promise<unknown>
	del: (keys: string[]) => Promise<number>
	keys: (pattern: string) => Promise<string[]>
	quit: () => Promise<void>
}
