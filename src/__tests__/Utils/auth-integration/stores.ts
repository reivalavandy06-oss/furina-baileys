import { createHash } from 'crypto'
import { mkdir, rm } from 'fs/promises'
import { join } from 'path'
import type { AuthStore } from '../../../Types'
import { createRedisAuthStore, createSQLiteAuthStore, makeAuthStateFromStore } from '../../../Utils/auth-store'
import { createNekoDBAuthStore, type NekoDBLike } from '../../../Utils/auth/nekodb-auth'
import { createBackendChecks, isReady, loadDriver, type BackendName, type ModuleLoader } from './availability'
import { createDisposalRegistry } from './lifecycle'

interface SqliteDatabase {
	prepare: (sql: string) => { all: (...params: unknown[]) => unknown[]; run: (...params: unknown[]) => unknown }
	close: () => void
	open?: boolean
}
interface RedisClientish {
	connect: () => Promise<void>
	quit: () => Promise<void>
	destroy?: () => void
	isOpen?: boolean
	get: (key: string) => Promise<string | null>
	mGet: (keys: string[]) => Promise<(string | null)[]>
	set: (key: string, value: string) => Promise<unknown>
	del: (keys: string[]) => Promise<number>
	keys: (pattern: string) => Promise<string[]>
}
const toNekoDBLike = (client: unknown): NekoDBLike => {
	if (client && typeof client === 'object') {
		const candidate = client as NekoDBLike
		if (
			['insert', 'get', 'update', 'delete', 'search'].every(
				method => typeof Reflect.get(candidate, method) === 'function'
			)
		) {
			return candidate
		}
	}
	throw new Error('NekoDB client does not expose the required auth methods')
}

// Each suite owns its registry; the optional loader is a test seam, never a runtime adapter.
export const createIntegrationStores = (
	checks = createBackendChecks(),
	load: ModuleLoader = loadDriver,
	env: NodeJS.ProcessEnv = process.env
) => {
	const registry = createDisposalRegistry()
	const folders = new Map<string, Promise<void>>()
	const realStore = async (backend: BackendName, namespace: string): Promise<AuthStore> => {
		const check = await checks[backend]()
		if (!isReady(check)) throw new Error(check.reason)
		const suffix = createHash('sha256').update(namespace).digest('hex')
		if (backend === 'sqlite') {
			let folder = folders.get(check.namespace)
			if (!folder) {
				folder = mkdir(check.namespace, { recursive: true }).then(() => {
					registry.track(() => rm(check.namespace, { recursive: true, force: true }))
				})
				folders.set(check.namespace, folder)
			}
			await folder
			const mod = await load('better-sqlite3')
			const Database = mod.default as new (path: string) => SqliteDatabase
			const db = new Database(join(check.namespace, `${suffix}.db`))
			registry.track(() => {
				if (db.open !== false) db.close()
			})
			db.prepare('CREATE TABLE IF NOT EXISTS furina_auth (key TEXT PRIMARY KEY, value TEXT)').run()
			return createSQLiteAuthStore(db)
		}
		if (backend === 'redis') {
			const mod = await load('redis')
			const createClient = mod.createClient as (options: { url?: string }) => RedisClientish
			const client = createClient({ url: env.FURINA_TEST_REDIS_URL })
			registry.track(async () => {
				if (client.isOpen !== false) await client.quit()
			})
			await client.connect()
			const prefix = `${check.namespace}${suffix}:`
			registry.track(async () => {
				const keys = (await client.keys(`${prefix}*`)).filter(key => key.startsWith(prefix))
				if (keys.length) await client.del(keys)
			})
			return createRedisAuthStore(client, prefix)
		}
		const mod = await load('@nekodb/client')
		const NekoDB = (mod.NekoDB ?? mod.default) as new (options: unknown) => unknown
		const client = new NekoDB({
			host: env.FURINA_TEST_NEKODB_HOST,
			username: env.FURINA_TEST_NEKODB_USERNAME,
			password: env.FURINA_TEST_NEKODB_PASSWORD
		})
		registry.track(async () => {
			const owned = client as { close?: () => void | Promise<void> }
			await owned.close?.()
		})
		const store = createNekoDBAuthStore(toNekoDBLike(client), `${check.namespace}-${suffix}`)
		registry.track(async () => {
			await store.clear?.()
		})
		return store
	}
	const realAuthState = async (backend: BackendName, namespace: string) =>
		makeAuthStateFromStore(await realStore(backend, namespace))
	return { realStore, realAuthState, disposeAll: registry.disposeAll }
}

const stores = createIntegrationStores()
export const realStore = stores.realStore
export const realAuthState = stores.realAuthState
export const disposeAll = stores.disposeAll
