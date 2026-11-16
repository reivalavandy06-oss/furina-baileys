import { rm } from 'fs/promises'
import { Buffer } from 'buffer'
import type { AuthStore, KeyPair } from '../../../Types'
import { BufferJSON } from '../../../Utils/generics'
import { initAuthCreds } from '../../../Utils/auth-utils'
import {
	CREDS_KEY,
	createFileAuthStore,
	createMongoAuthStore,
	createRedisAuthStore,
	createSQLiteAuthStore
} from '../../../Utils/auth-store'
import { createNekoDBAuthStore } from '../../../Utils/auth/nekodb-auth'
import { makeFakeMongoCollection, makeFakeNekoDB, makeFakeRedis, makeFakeSqlite } from './mock-stores'

let seq = 0
const tmpFolder = () => `/tmp/furina-conformance-${process.pid}-${++seq}-${Math.random().toString(36).slice(2, 6)}`

const parse = <T>(raw: string | null | undefined): T => JSON.parse(String(raw), BufferJSON.reviver) as T

const cleanup = async (paths: string[]) => {
	for (const path of paths) {
		await rm(path, { recursive: true, force: true }).catch(() => {})
	}
}

interface Adapter {
	label: string
	/** A distinct store instance, all sharing one backing. */
	makeStore: () => Promise<AuthStore>
	/** Wipes the shared backing; runs before every scenario. */
	reset?: () => Promise<void>
}

/** Keeps one backing alive across the whole suite so the "two sessions in the
 * same collection" scenario is a real test. */
const sharedAdapter = <T>(label: string, createBacking: () => T, build: (backing: T) => AuthStore): Adapter => {
	const backing = createBacking()

	return {
		label,
		makeStore: async () => build(backing),
		reset: async () => {
			await build(backing).clear?.()
		}
	}
}

/**
 * Every adapter has to pass the identical suite — that is the point of the
 * `AuthStore` contract.
 */
const runConformanceSuite = ({ label, makeStore, reset }: Adapter) => {
	const credsFixture = () => JSON.stringify(initAuthCreds(), BufferJSON.replacer)
	const preKeyFixture = (bytes: number[]) =>
		JSON.stringify({ public: new Uint8Array(bytes), private: new Uint8Array(bytes) }, BufferJSON.replacer)
	describe(`${label} — AuthStore conformance`, () => {
		beforeEach(async () => {
			await reset?.()
		})

		it('round-trips creds with every Buffer intact', async () => {
			const store = await makeStore()
			// one instance only: initAuthCreds rolls a fresh random noiseKey per call
			const expected = initAuthCreds()

			await store.set(CREDS_KEY, JSON.stringify(expected, BufferJSON.replacer))

			const creds = parse<{ noiseKey: KeyPair; registrationId: number }>(await store.get(CREDS_KEY))

			expect(Buffer.isBuffer(creds.noiseKey.public)).toBe(true)
			expect(Buffer.isBuffer(creds.noiseKey.private)).toBe(true)
			expect(Array.from(creds.noiseKey.public)).toEqual(Array.from(expected.noiseKey.public))
			expect(Array.from(creds.noiseKey.private)).toEqual(Array.from(expected.noiseKey.private))
			expect(creds.registrationId).toBe(expected.registrationId)
		})

		it('round-trips a signal key with its type preserved', async () => {
			const store = await makeStore()

			await store.set('pre-key-1.json', preKeyFixture([1, 2, 3, 4]))

			const keyPair = parse<KeyPair>(await store.get('pre-key-1.json'))

			expect(keyPair.public).toBeInstanceOf(Uint8Array)
			expect(Array.from(keyPair.public)).toEqual([1, 2, 3, 4])
			expect(Array.from(keyPair.private)).toEqual([1, 2, 3, 4])
		})

		it('returns null after a key is removed', async () => {
			const store = await makeStore()

			await store.set('session-to-delete.json', '"bye"')
			expect(await store.get('session-to-delete.json')).toBe('"bye"')

			await store.remove('session-to-delete.json')

			// `AuthStore.get` documents `null` (not `undefined`) for a missing key,
			// and every shipped backend returns null — see Types/Auth.ts.
			expect(await store.get('session-to-delete.json')).toBeNull()
			expect(await store.get('never-existed.json')).toBeNull()
		})

		it('keeps two sessions in the same collection from mixing', async () => {
			const storeA = await makeStore()
			const storeB = await makeStore()

			await storeA.set(CREDS_KEY, JSON.stringify({ marker: 'A' }))
			await storeB.set('session-b.json', JSON.stringify({ marker: 'B' }))

			expect(parse<{ marker: string }>(await storeA.get(CREDS_KEY))).toEqual({ marker: 'A' })
			expect(parse<{ marker: string }>(await storeB.get('session-b.json'))).toEqual({ marker: 'B' })

			// writing through B leaves A's record byte-identical
			await storeB.set('session-c.json', JSON.stringify({ marker: 'C' }))
			expect(parse<{ marker: string }>(await storeA.get(CREDS_KEY))).toEqual({ marker: 'A' })

			// both records are readable through the *other* instance on the same backing
			expect(parse<{ marker: string }>(await storeB.get(CREDS_KEY))).toEqual({ marker: 'A' })
			expect(parse<{ marker: string }>(await storeA.get('session-b.json'))).toEqual({ marker: 'B' })
		})

		it('survives 10 parallel writes without loss or overwrite', async () => {
			const store = await makeStore()
			const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

			await Promise.all(indices.map(index => store.set(`session-${index}.json`, JSON.stringify({ index }))))

			const listed = await store.keys()
			const batch = await store.getMany(indices.map(index => `session-${index}.json`))

			for (const index of indices) {
				expect(listed).toContain(`session-${index}.json`)
				expect(parse<{ index: number }>(batch[`session-${index}.json`])).toEqual({ index })
			}

			// no key ended up holding another key's value
			for (const [key, raw] of Object.entries(batch)) {
				expect(String(key)).toBe(`session-${parse<{ index: number }>(raw).index}.json`)
			}
		})

		it('clear() empties the store', async () => {
			const store = await makeStore()

			await store.set(CREDS_KEY, credsFixture())
			await store.set('pre-key-2.json', preKeyFixture([9]))

			await store.clear?.()

			expect(await store.get(CREDS_KEY)).toBeNull()
			expect(await store.get('pre-key-2.json')).toBeNull()
			expect(await store.keys()).toEqual([])
		})
	})
}

describe('AuthStore adapter conformance', () => {
	// ── file backend (built in, no peer dependency) ──────────────────────
	describe('file backend', () => {
		let folders: string[]

		beforeEach(() => {
			folders = [tmpFolder(), tmpFolder()]
		})
		afterEach(() => cleanup(folders))

		runConformanceSuite({
			label: 'file',
			makeStore: async () => await createFileAuthStore(folders[0]!),
			reset: async () => {
				await (await createFileAuthStore(folders[0]!)).clear?.()
			}
		})

		it('isolates two stores from two different folders', async () => {
			const left = await createFileAuthStore(folders[0]!)
			const right = await createFileAuthStore(folders[1]!)

			await left.set(CREDS_KEY, JSON.stringify({ marker: 'left' }))

			expect(await right.get(CREDS_KEY)).toBeNull()
			expect(parse<{ marker: string }>(await left.get(CREDS_KEY))).toEqual({ marker: 'left' })
		})
	})

	// sqlite — mocked better-sqlite3 handle
	runConformanceSuite(sharedAdapter('sqlite', makeFakeSqlite, backing => createSQLiteAuthStore(backing, 'furina_auth')))

	// redis — mocked client
	runConformanceSuite(sharedAdapter('redis', makeFakeRedis, backing => createRedisAuthStore(backing, 'furina:auth:')))

	// mongodb — mocked collection
	runConformanceSuite(sharedAdapter('mongodb', makeFakeMongoCollection, backing => createMongoAuthStore(backing)))

	// nekodb — mocked @nekodb/client instance
	runConformanceSuite(
		sharedAdapter('nekodb', makeFakeNekoDB, backing => createNekoDBAuthStore(backing, 'baileys_auth'))
	)
})

describe('auth store backend labels', () => {
	it('reports a distinct backend name per adapter', async () => {
		const fileStore = await createFileAuthStore(tmpFolder())

		expect(fileStore.backend).toBe('file')
		expect(createSQLiteAuthStore(makeFakeSqlite(), 'furina_auth').backend).toBe('sqlite')
		expect(createRedisAuthStore(makeFakeRedis(), 'furina:auth:').backend).toBe('redis')
		expect(createMongoAuthStore(makeFakeMongoCollection()).backend).toBe('mongodb')
		expect(createNekoDBAuthStore(makeFakeNekoDB()).backend).toBe('nekodb')

		await cleanup([tmpFolder()])
	})
})
