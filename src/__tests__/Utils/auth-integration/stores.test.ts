import { access } from 'fs/promises'
import { createBackendChecks, type ModuleLoader } from './availability'
import { createIntegrationStores } from './stores'
import { makeFakeNekoDB, makeFakeRedis } from '../auth/mock-stores'

describe('integration builders without real backends', () => {
	it('uses the same Redis namespace for reopen and cleanup; preserves foreign keys', async () => {
		const client = makeFakeRedis()
		const deleted: string[] = []
		let closed = 0
		const load: ModuleLoader = async () => ({
			createClient: () => ({
				...client,
				del: async (keys: string[]) => {
					deleted.push(...keys)
					return client.del(keys)
				},
				quit: async () => {
					closed++
				}
			})
		})
		const env = { FURINA_TEST_REDIS_URL: 'redis://127.0.0.1:1' }
		const checks = createBackendChecks(env, load)
		const stores = createIntegrationStores(checks, load, env)
		await client.set('foreign:key', 'keep')
		const first = await stores.realStore('redis', 'migration-source')
		await first.set('x', 'one')
		const second = await stores.realStore('redis', 'migration-source')
		expect(await second.get('x')).toBe('one')
		const other = await stores.realStore('redis', 'migration-target')
		expect(await other.get('x')).toBeNull()
		await other.set('y', 'two')
		await stores.disposeAll()
		expect(await client.get('foreign:key')).toBe('keep')
		expect(deleted).toHaveLength(2)
		expect(closed).toBe(3)
	})

	it('registers Redis cleanup before a failed connection', async () => {
		let closed = 0
		const load: ModuleLoader = async () => ({
			createClient: () => ({
				...makeFakeRedis(),
				connect: async () => {
					throw new Error('synthetic endpoint unavailable')
				},
				quit: async () => {
					closed++
				}
			})
		})
		const env = { FURINA_TEST_REDIS_URL: 'redis://127.0.0.1:1' }
		const stores = createIntegrationStores(createBackendChecks(env, load), load, env)
		await expect(stores.realStore('redis', 'setup-failure')).rejects.toThrow('synthetic endpoint unavailable')
		await stores.disposeAll()
		expect(closed).toBe(1)
	})

	it('closes SQLite after schema setup fails and removes only its temporary child', async () => {
		let closed = 0
		const load: ModuleLoader = async () => ({
			default: class {
				prepare() {
					throw new Error('synthetic schema failure')
				}
				close() {
					closed++
				}
			}
		})
		const checks = createBackendChecks({}, load)
		const ready = await checks.sqlite()
		expect(ready.available).toBe(true)
		if (!ready.available) throw new Error('unexpected blocker')
		await expect(access(ready.namespace)).rejects.toThrow()
		const stores = createIntegrationStores(checks, load)
		await expect(stores.realStore('sqlite', '../malformed/name')).rejects.toThrow('synthetic schema failure')
		await stores.disposeAll()
		expect(closed).toBe(1)
		await expect(access(ready.namespace)).rejects.toThrow()
	})

	it('preserves the NekoDB close receiver even when validation fails', async () => {
		let closed = 0
		class InvalidClient {
			close() {
				expect(this).toBeInstanceOf(InvalidClient)
				closed++
			}
		}
		const load: ModuleLoader = async () => ({ NekoDB: InvalidClient })
		const env = {
			FURINA_TEST_NEKODB_HOST: 'test.invalid',
			FURINA_TEST_NEKODB_USERNAME: 'synthetic',
			FURINA_TEST_NEKODB_PASSWORD: 'synthetic',
			FURINA_TEST_NEKODB_TEST_INSTANCE: '1'
		}
		const stores = createIntegrationStores(createBackendChecks(env, load), load, env)
		await expect(stores.realStore('nekodb', 'init')).rejects.toThrow('required auth methods')
		await stores.disposeAll()
		expect(closed).toBe(1)
	})

	it('uses dedicated NekoDB collections for reopen, session isolation, and cleanup', async () => {
		const collections = new Map<string, ReturnType<typeof makeFakeNekoDB>>()
		const db = (name: string) => {
			let value = collections.get(name)
			if (!value) {
				value = makeFakeNekoDB()
				collections.set(name, value)
			}
			return value
		}
		let closed = 0
		class Client {
			insert(collection: string, value: object) {
				return db(collection).insert(collection, value)
			}
			get(collection: string, id: string) {
				return db(collection).get(collection, id)
			}
			update(collection: string, id: string, value: object) {
				return db(collection).update(collection, id, value)
			}
			delete(collection: string, id: string) {
				return db(collection).delete(collection, id)
			}
			search(collection: string, query: object) {
				return db(collection).search(collection, query)
			}
			close() {
				expect(this).toBeInstanceOf(Client)
				closed++
			}
		}
		const load: ModuleLoader = async () => ({ NekoDB: Client })
		const env = {
			FURINA_TEST_NEKODB_HOST: 'test.invalid',
			FURINA_TEST_NEKODB_USERNAME: 'synthetic',
			FURINA_TEST_NEKODB_PASSWORD: 'synthetic',
			FURINA_TEST_NEKODB_TEST_INSTANCE: '1'
		}
		const checks = createBackendChecks(env, load)
		const ready = await checks.nekodb()
		if (!ready.available) throw new Error('unexpected blocker')
		const stores = createIntegrationStores(checks, load, env)
		await db('foreign').insert('foreign', { k: 'keep', value: 'foreign', ________furina: true })
		const first = await stores.realStore('nekodb', 'same-session')
		await first.set('x', 'one')
		expect(await (await stores.realStore('nekodb', 'same-session')).get('x')).toBe('one')
		expect(await (await stores.realStore('nekodb', 'other-session')).get('x')).toBeNull()
		await stores.disposeAll()
		expect(closed).toBe(3)
		for (const [name, client] of collections) {
			if (name === 'foreign') expect(await client.search(name, {})).toHaveLength(1)
			else {
				expect(name.startsWith(ready.namespace)).toBe(true)
				expect(await client.search(name, {})).toEqual([])
			}
		}
	})
})
