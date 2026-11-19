// Guard for REAL backend integration tests.
//
// These tests exercise the production adapters against real drivers. They are
// opt-in and must never run as part of the default unit suite: they need
// infrastructure, they are slower, and a missing backend must be reported as
// "not run", never as "passed".
//
// Safety rules enforced here:
//   - configuration comes from explicit environment variables only; `.env` is
//     never read, and values are never printed
//   - Redis requires an explicit loopback or explicitly-isolated endpoint, and
//     is only ever cleaned by deleting keys this run created — never FLUSHDB
//   - SQLite uses a unique temporary directory that is removed afterwards
//   - NekoDB requires explicit test-host credentials and a unique namespace
//
// Both availability questions are tracked separately, because they fail
// independently: `driver` is the real package being resolvable, `isolated` is
// whether the test endpoint is safe to write to.

import { mkdtempSync, rmSync } from 'fs'
import { createNekoDBAuthStore, type NekoDBLike } from '../../../Utils/auth/nekodb-auth'
import { tmpdir } from 'os'
import { join } from 'path'

export type BackendName = 'nekodb' | 'sqlite' | 'redis'

export interface Readiness {
	available: true
	/** Loopback or explicitly isolated endpoint, validated before any cleanup. */
	isolation: 'loopback' | 'isolated'
	/** Unique per-run namespace: a SQLite folder or a Redis key prefix. */
	namespace: string
	/** Removes only resources this run created. Never FLUSHDB / FLUSHALL. */
	cleanup: () => void | Promise<void>
}

export interface Blocked {
	available: false
	driver: boolean
	isolation: 'unknown'
	/** Human-readable blocker. Never contains credentials or endpoint secrets. */
	reason: string
}

export type BackendCheck = Readiness | Blocked

/** Resolves the real optional peer dependency the way the adapter does. */
const probeDriver = async (specifier: string): Promise<boolean> => {
	try {
		await import(/* webpackIgnore: true */ specifier)
		return true
	} catch {
		return false
	}
}

/** A failed resolution is the common case here, and it is expensive to repeat;
 * memoise so every direction probe reuses one answer per driver. */
const probed = new Map<string, boolean>()

const hasDriver = async (specifier: string): Promise<boolean> => {
	const cached = probed.get(specifier)
	if (cached !== undefined) return cached

	const found = await probeDriver(specifier)
	probed.set(specifier, found)
	return found
}

const loopbackHost = (value: string): boolean => {
	try {
		const hostname = new URL(value).hostname
		return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1'
	} catch {
		return false
	}
}

/** One temporary directory per process: SQLite is embedded, so each reopened
 * logical database must live in the same folder. */
let sqliteFolder: string | null = null

export const checkSqlite = async (): Promise<BackendCheck> => {
	const driver = await hasDriver('better-sqlite3')

	if (!driver) {
		return { available: false, driver, isolation: 'unknown', reason: 'better-sqlite3 not installed' }
	}

	const requested = process.env.FURINA_TEST_SQLITE_DIR
	if (sqliteFolder === null) sqliteFolder = requested ?? mkdtempSync(join(tmpdir(), 'furina-auth-it-'))

	return {
		available: true,
		// Embedded database in a private temporary file: no server, no URL.
		isolation: 'loopback',
		namespace: sqliteFolder,
		cleanup: () => {
			// Only resources this run created: the temporary directory is never
			// shared, and an explicitly requested directory is left untouched.
			if (!requested) rmSync(sqliteFolder!, { recursive: true, force: true })
		}
	}
}

export const checkRedis = async (): Promise<BackendCheck> => {
	const driver = await hasDriver('redis')
	const url = process.env.FURINA_TEST_REDIS_URL

	if (!url) {
		return { available: false, driver, isolation: 'unknown', reason: 'FURINA_TEST_REDIS_URL not set' }
	}

	const requestedRemote = Boolean(process.env.FURINA_TEST_ALLOW_REMOTE_REDIS)

	if (!requestedRemote && !loopbackHost(url)) {
		return {
			available: false,
			driver,
			isolation: 'unknown',
			reason: 'Redis endpoint is not loopback; set FURINA_TEST_ALLOW_REMOTE_REDIS only for an isolated instance'
		}
	}

	const namespace = `${process.env.FURINA_TEST_REDIS_PREFIX ?? 'furina-test'}:${Date.now()}-${process.pid}:`

	return {
		available: true,
		isolation: requestedRemote ? 'isolated' : 'loopback',
		namespace,
		cleanup: async () => {
			// Deletes only keys this run created — never FLUSHDB / FLUSHALL, so a
			// shared instance keeps every foreign key intact. The specifier is a
			// variable because the driver is an optional peer dependency.
			const specifier = 'redis'
			const mod = (await import(/* webpackIgnore: true */ specifier)) as {
				createClient: (options: { url: string }) => RedisCleanupClient
			}

			const client = mod.createClient({ url })
			await client.connect()
			try {
				const owned = await client.keys(`${namespace}*`)
				if (owned.length > 0) await client.del(owned)
			} finally {
				await client.quit()
			}
		}
	}
}

interface RedisCleanupClient {
	connect: () => Promise<void>
	quit: () => Promise<void>
	keys: (pattern: string) => Promise<string[]>
	del: (keys: string[]) => Promise<number>
}

export const checkNekoDB = async (): Promise<BackendCheck> => {
	const driver = await hasDriver('@nekodb/client')
	const required = ['FURINA_TEST_NEKODB_HOST', 'FURINA_TEST_NEKODB_USERNAME', 'FURINA_TEST_NEKODB_PASSWORD']
	const missing = required.filter(name => !process.env[name])

	if (missing.length > 0) {
		return {
			available: false,
			driver,
			isolation: 'unknown',
			reason: `credentials not configured: ${missing.join(', ')}`
		}
	}

	if (!process.env.FURINA_TEST_NEKODB_TEST_INSTANCE) {
		return {
			available: false,
			driver,
			isolation: 'unknown',
			reason: 'FURINA_TEST_NEKODB_TEST_INSTANCE not set — endpoint isolation not asserted'
		}
	}

	const collection = process.env.FURINA_TEST_NEKODB_NAMESPACE ?? `furina-it-${Date.now()}-${process.pid}`

	return {
		available: true,
		isolation: 'isolated',
		namespace: collection,
		cleanup: async () => {
			// `clear()` on the production store deletes exactly the documents this
			// run wrote, identified by the owner mark it stamps itself — foreign
			// collections and foreign documents inside this collection survive.
			const specifier = '@nekodb/client'
			const mod = (await import(/* webpackIgnore: true */ specifier)) as {
				NekoDB: new (config: { host: string; username: string; password: string }) => NekoDBLike
			}

			const client = new mod.NekoDB({
				host: process.env.FURINA_TEST_NEKODB_HOST!,
				username: process.env.FURINA_TEST_NEKODB_USERNAME!,
				password: process.env.FURINA_TEST_NEKODB_PASSWORD!
			})

			try {
				await createNekoDBAuthStore(client, collection).clear?.()
			} finally {
				// The user owns the connection; the real client closes itself only
				// when it exposes `close()`.
				await closeNekoDBClient(client)
			}
		}
	}
}

/** Structural view of the cleanup connection: the production interface plus the
 * optional `close()` `@nekodb/client` instances expose. */
interface NekoDBCleanupClient extends NekoDBLike {
	close?: () => Promise<unknown>
}

const closeNekoDBClient = async (client: NekoDBCleanupClient): Promise<void> => {
	if (typeof client.close === 'function') await client.close()
}

export const CHECKS: Record<BackendName, () => Promise<BackendCheck>> = {
	nekodb: checkNekoDB,
	sqlite: checkSqlite,
	redis: checkRedis
}

export const isReady = (check: BackendCheck): check is Readiness => check.available === true
