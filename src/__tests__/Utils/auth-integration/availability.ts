import { randomUUID } from 'crypto'
import { tmpdir } from 'os'
import { join } from 'path'

export type BackendName = 'nekodb' | 'sqlite' | 'redis'
export interface Readiness {
	available: true
	isolation: 'loopback' | 'isolated'
	namespace: string
	cleanup: () => void | Promise<void>
}
export interface Blocked {
	available: false
	driver: boolean
	isolation: 'unknown'
	reason: string
}
export type BackendCheck = Readiness | Blocked
export type ModuleLoader = (specifier: string) => Promise<Record<string, unknown>>
export const loadDriver: ModuleLoader = async specifier => import(/* webpackIgnore: true */ specifier)
const noResources = () => undefined

// Readiness has no filesystem or connection side effects. Builders own resources.
export const createBackendChecks = (env: NodeJS.ProcessEnv = process.env, load: ModuleLoader = loadDriver) => {
	const run = randomUUID()
	const drivers = new Map<string, Promise<boolean>>()
	const hasDriver = (name: string) => {
		let result = drivers.get(name)
		if (!result) {
			result = load(name).then(
				() => true,
				() => false
			)
			drivers.set(name, result)
		}
		return result
	}
	const blocked = (driver: boolean, reason: string): Blocked => ({
		available: false,
		driver,
		isolation: 'unknown',
		reason
	})
	const ready = (namespace: string, isolation: Readiness['isolation']): Readiness => ({
		available: true,
		namespace,
		isolation,
		cleanup: noResources
	})
	const sqlite = async (): Promise<BackendCheck> => {
		if (!(await hasDriver('better-sqlite3'))) return blocked(false, 'better-sqlite3 not installed')
		return ready(join(env.FURINA_TEST_SQLITE_DIR ?? tmpdir(), `furina-auth-it-${run}`), 'loopback')
	}
	const redis = async (): Promise<BackendCheck> => {
		const driver = await hasDriver('redis')
		if (!driver) return blocked(false, 'redis not installed')
		if (!env.FURINA_TEST_REDIS_URL) return blocked(driver, 'FURINA_TEST_REDIS_URL not set')
		let endpoint: URL
		try {
			endpoint = new URL(env.FURINA_TEST_REDIS_URL)
		} catch {
			return blocked(driver, 'Invalid Redis test endpoint')
		}
		if (!['redis:', 'rediss:'].includes(endpoint.protocol)) return blocked(driver, 'Invalid Redis test protocol')
		const local = ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(endpoint.hostname)
		const remote = env.FURINA_TEST_ALLOW_REMOTE_REDIS === '1' || env.FURINA_TEST_ALLOW_REMOTE_REDIS === 'true'
		if (!local && !remote) return blocked(driver, 'Redis endpoint requires an explicit isolated-instance opt-in')
		const prefix = env.FURINA_TEST_REDIS_PREFIX ?? 'furina-test'
		if (!prefix || /[\x00-\x1f*?\[\]\\]/.test(prefix))
			return blocked(driver, 'Redis test prefix contains pattern characters')
		return ready(`${prefix}:${run}:`, local ? 'loopback' : 'isolated')
	}
	const nekodb = async (): Promise<BackendCheck> => {
		const driver = await hasDriver('@nekodb/client')
		if (!driver) return blocked(false, '@nekodb/client not installed')
		const required = ['FURINA_TEST_NEKODB_HOST', 'FURINA_TEST_NEKODB_USERNAME', 'FURINA_TEST_NEKODB_PASSWORD']
		const missing = required.filter(name => !env[name])
		if (missing.length) return blocked(driver, `credentials not configured: ${missing.join(', ')}`)
		if (!['1', 'true'].includes(env.FURINA_TEST_NEKODB_TEST_INSTANCE ?? '')) {
			return blocked(driver, 'FURINA_TEST_NEKODB_TEST_INSTANCE must explicitly assert an isolated instance')
		}
		const prefix = env.FURINA_TEST_NEKODB_NAMESPACE ?? 'furina-it'
		if (!/^[\w-]+$/.test(prefix)) return blocked(driver, 'Invalid NekoDB test namespace prefix')
		return ready(`${prefix}-${run}`, 'isolated')
	}
	return { sqlite, redis, nekodb }
}

export const CHECKS = createBackendChecks()
export const checkSqlite = CHECKS.sqlite
export const checkRedis = CHECKS.redis
export const checkNekoDB = CHECKS.nekodb
export const isReady = (check: BackendCheck): check is Readiness => check.available
