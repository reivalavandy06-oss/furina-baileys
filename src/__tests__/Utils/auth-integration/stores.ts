// Real-driver builders for the integration suites.
//
// Two distinct production surfaces exist and must not be confused:
//
//   - `useXAuthState()` → `{ state, saveCreds }` (AuthenticationState-based,
//     what `makeWASocket({ auth })` consumes)
//   - `createXAuthStore()` → a raw `AuthStore` (what backup/migration consume)
//
// Both are built here from the REAL optional driver, resolved through a variable
// specifier so TypeScript never requires a package that may be absent. The ready
// check always runs BEFORE the driver is loaded, so a blocked backend never even
// attempts an import.

import type { AuthStore, AuthStateOptions } from '../../../Types'
import type { makeAuthStateFromStore } from '../../../Utils/auth-store'
import { createRedisAuthStore, createSQLiteAuthStore } from '../../../Utils/auth-store'
import { createNekoDBAuthStore, type NekoDBLike } from '../../../Utils/auth/nekodb-auth'
import { CHECKS, isReady, type BackendName, type Readiness } from './availability'
import { join } from 'path'

/** Structural view of `better-sqlite3`'s `Database` — the production adapter
 * requires a `prepare()` that returns both `all()` and `run()`. */
export interface SqliteDatabase {
	prepare: (sql: string) => { all: (...params: unknown[]) => unknown[]; run: (...params: unknown[]) => unknown }
	close: () => void
}

/** Structural view of a `redis` v4/v5 client. `mGet` is the camelCase command
 * name node-redis v4+ exposes; `get` is required by the production adapter. */
export interface RedisClientish {
	connect: () => Promise<void>
	quit: () => Promise<void>
	get: (key: string) => Promise<string | null>
	mGet: (keys: string[]) => Promise<(string | null)[]>
	set: (key: string, value: string) => Promise<unknown>
	del: (keys: string[]) => Promise<number>
	keys: (pattern: string) => Promise<string[]>
}

/** Resolves the real optional peer dependency the way the adapter does. */
const loadReal = async (specifier: string): Promise<Record<string, unknown>> => {
	try {
		return (await import(/* webpackIgnore: true */ specifier)) as Record<string, unknown>
	} catch {
		throw new Error(`real driver "${specifier}" is not installed`)
	}
}

/** Rejects before any driver load, so a blocked backend never imports one. */
const sqliteReady = async (): Promise<Readiness> => {
	const check = await CHECKS.sqlite()
	if (!isReady(check)) throw new Error(check.reason)
	return check
}

/**
 * Production interpolates the table name straight into SQL
 * (`auth-store.ts`), so it must be a bare SQLite identifier. Test namespaces carry
 * hyphens and dots, which SQLite reads as operators — sanitise once and use the
 * same transformation everywhere a namespace becomes an identifier.
 */
const sqliteIdent = (namespace: string): string => namespace.replace(/[^A-Za-z0-9_]/g, '_').replace(/^([0-9])/, 't_$1')

const sqliteOptions = (folder: string, namespace: string): AuthStateOptions => ({
	table: sqliteIdent(namespace),
	path: join(folder, `${namespace}.db`)
})

const redisClient = async (): Promise<RedisClientish> => {
	const mod = await loadReal('redis')
	const createClient = mod['createClient'] as (options: { url: string }) => RedisClientish
	const client = createClient({ url: process.env.FURINA_TEST_REDIS_URL ?? '' })
	await client.connect()
	return client
}

/** Redis key prefixes must begin with the run namespace, so cleanup that deletes
 * only this run's namespace also covers these stores. */
const redisTable = (ready: Readiness, namespace: string) =>
	`${ready.namespace}${namespace.replace(/[^a-zA-Z0-9_.-]/g, '_')}`

/** The five methods `NekoDBLike` declares. Mirrors the duck-type the production
 * adapter already performs, so a non-conforming client fails here with a precise
 * message instead of deeper in the adapter. */
const NEKODB_METHODS = ['insert', 'get', 'update', 'delete', 'search'] as const

/**
 * `@nekodb/client` is an optional peer dependency, so it cannot be resolved at
 * compile time and the constructed instance has no static type. This is not a
 * blind assertion: the candidate is checked at runtime for exactly the methods
 * the production `NekoDBLike` interface requires, and rejected otherwise.
 */
const toNekoDBLike = (client: unknown): NekoDBLike => {
	if (client && typeof client === 'object') {
		const candidate = client as NekoDBLike
		if (NEKODB_METHODS.every(method => typeof candidate[method] === 'function')) {
			return candidate
		}
	}

	throw new Error('constructed @nekodb/client instance does not expose the NekoDBLike methods')
}

/** Builds a real `@nekodb/client` instance from the isolated test config. */
const nekoInstance = async (): Promise<unknown> => {
	const mod = await loadReal('@nekodb/client')
	const NekoDB = mod['NekoDB'] as new (config: unknown) => unknown
	return new NekoDB(nekoConfig())
}

/** The client exposes `close()` only when the build shipped it. */
const closeNeko = (client: unknown): Promise<void> | void => {
	const close = (client as { close?: () => Promise<void> | void }).close
	return typeof close === 'function' ? close() : undefined
}

const nekoConfig = () => ({
	host: process.env.FURINA_TEST_NEKODB_HOST!,
	username: process.env.FURINA_TEST_NEKODB_USERNAME!,
	password: process.env.FURINA_TEST_NEKODB_PASSWORD!
})

/** Anything created here is registered so the suite can dispose of it. */
const handles: { dispose: () => Promise<void> | void }[] = []

const track = (dispose: () => Promise<void> | void) => {
	handles.push({ dispose })
}

/** Teardown must not cascade: one failing close still disposes the rest. */
export const disposeAll = async (): Promise<void> => {
	while (handles.length > 0) {
		const handle = handles.pop()
		try {
			await handle?.dispose()
		} catch {
			// Reported by the backend itself; a failed close is not a failed suite.
		}
	}
}

/** A real `AuthStore` for an available backend, in its own namespace. */
export const realStore = async (backend: BackendName, namespace: string): Promise<AuthStore> => {
	if (backend === 'sqlite') {
		const ready = await sqliteReady()
		const mod = await loadReal('better-sqlite3')
		const Database = mod['default'] as new (path: string) => SqliteDatabase
		const db = new Database(sqliteOptions(ready.namespace, namespace).path!)
		db.prepare(`CREATE TABLE IF NOT EXISTS ${sqliteIdent(namespace)} (key TEXT PRIMARY KEY, value TEXT)`).run()
		track(() => db.close())

		return createSQLiteAuthStore(db, namespace)
	}

	if (backend === 'redis') {
		const check = await CHECKS.redis()
		if (!isReady(check)) throw new Error(check.reason)

		const client = await redisClient()
		const store = createRedisAuthStore(client, `${redisTable(check, namespace)}:`)
		track(store.close ?? (() => client.quit()))

		return store
	}

	const check = await CHECKS.nekodb()
	if (!isReady(check)) throw new Error(check.reason)

	const client = await nekoInstance()
	const store = createNekoDBAuthStore(toNekoDBLike(client), namespace)
	track(() => closeNeko(client))

	return store
}

/** The `{ state, saveCreds }` surface, also from the real driver. */
export const realAuthState = async (
	backend: BackendName,
	namespace: string
): ReturnType<typeof makeAuthStateFromStore> => {
	if (backend === 'sqlite') {
		const ready = await sqliteReady()
		const { useSQLiteAuthState } = await import('../../../Utils/auth-store')
		return useSQLiteAuthState(ready.namespace, sqliteOptions(ready.namespace, namespace))
	}

	if (backend === 'redis') {
		const check = await CHECKS.redis()
		if (!isReady(check)) throw new Error(check.reason)

		const { makeAuthStateFromStore } = await import('../../../Utils/auth-store')
		// Built from the same public composition `useRedisAuthState` uses, so the
		// connection lands in the handle registry instead of leaking (the public
		// helper does not return its connection to the caller).
		const client = await redisClient()
		const store = createRedisAuthStore(client, `${redisTable(check, namespace)}:`)
		track(store.close ?? (() => client.quit()))

		return makeAuthStateFromStore(store)
	}

	const check = await CHECKS.nekodb()
	if (!isReady(check)) throw new Error(check.reason)

	const { useNekoDBAuth } = await import('../../../Utils/auth/nekodb-auth')
	const client = await nekoInstance()
	track(() => closeNeko(client))

	return useNekoDBAuth(toNekoDBLike(client), namespace)
}
