import { isDeepStrictEqual } from 'util'
import type { AuthStore, AuthenticationCreds } from '../../../Types'
import { CREDS_KEY, createRedisAuthStore, createSQLiteAuthStore } from '../../../Utils/auth-store'
import { createNekoDBAuthStore } from '../../../Utils/auth/nekodb-auth'
import { BufferJSON } from '../../../Utils/generics'
import { StorageFaults } from '../../TestUtils/storage-faults'
import { makeFakeNekoDB, makeFakeRedis, makeFakeSqlite } from './mock-stores'

export const backends = ['nekodb', 'sqlite', 'redis'] as const
export type Backend = (typeof backends)[number]
export const encode = (value: unknown): string => JSON.stringify(value, BufferJSON.replacer)
export const decode = <T>(raw: string | null): T => JSON.parse(String(raw), BufferJSON.reviver) as T

// Deliberately synthetic, deterministic material. No key generation or external auth files.
export const credentials = (session: string): AuthenticationCreds => {
	const marker = [...Buffer.from(session)].reduce((value, byte) => (value + byte) % 256, 0)
	const pair = () => ({ public: Buffer.alloc(32, marker), private: Buffer.alloc(32, marker ^ 255) })
	return {
		noiseKey: pair(),
		pairingEphemeralKeyPair: pair(),
		signedIdentityKey: pair(),
		signedPreKey: { keyPair: pair(), signature: Buffer.alloc(64, 31), keyId: 1 },
		registrationId: 7,
		advSecretKey: Buffer.alloc(32, 41).toString('base64'),
		platform: session,
		firstUnuploadedPreKeyId: 1,
		nextPreKeyId: 2,
		processedHistoryMessages: [],
		accountSyncCounter: 0,
		accountSettings: { unarchiveChats: false },
		registered: true,
		pairingCode: undefined,
		lastPropHash: undefined,
		routingInfo: Buffer.from([0, 128, 255]),
		additionalData: { session, nested: { binary: Buffer.from([255, 0, marker]), absent: null } }
	}
}

export const sessionRecords = (session = 'test-a') => ({
	[CREDS_KEY]: encode(credentials(session)),
	'pre-key-1.json': encode({ public: new Uint8Array([0, 128, 255]), private: Buffer.from([3, 2, 1]) }),
	'session-peer.json': encode(Buffer.from(`synthetic-session-${session}`))
})

export const snapshot = async (store: AuthStore) => store.getMany(await store.keys())

/** A failing assertion must not dump serialized synthetic credentials into Jest logs. */
export const expectRecords = (actual: Record<string, string>, expected: Record<string, string>) => {
	expect(isDeepStrictEqual(actual, expected)).toBe(true)
}

/** Calls actual production adapters. Only the SQLite/Redis/NekoDB drivers are fake. */
export const adapterHarness = (backend: Backend) => {
	const faults = new StorageFaults()
	const sqlite = new Map<string, ReturnType<typeof makeFakeSqlite>>()
	const neko = new Map<string, ReturnType<typeof makeFakeNekoDB>>()
	const redis = makeFakeRedis()
	const sqliteDriver = (table: string) => {
		let driver = sqlite.get(table)
		if (!driver) {
			driver = makeFakeSqlite()
			sqlite.set(table, driver)
		}
		return driver
	}
	const nekoDriver = (collection: string) => {
		let driver = neko.get(collection)
		if (!driver) {
			driver = makeFakeNekoDB()
			neko.set(collection, driver)
		}
		return driver
	}

	const open = (session = 'test-a'): AuthStore => {
		if (backend === 'sqlite') {
			return createSQLiteAuthStore(
				{
					prepare(sql) {
						const table = /(?:FROM|INTO|UPDATE)\s+"((?:[^"]|"")+)"/.exec(sql)?.[1]?.replace(/""/g, '"')
						if (!table) throw new Error('Unsupported synthetic SQL')
						const stmt = sqliteDriver(table).prepare(sql)
						const operation =
							sql.startsWith('INSERT') || sql.startsWith('UPDATE')
								? 'write'
								: sql.startsWith('DELETE')
									? 'delete'
									: 'read'
						return {
							all: (...args) => faults.sync(operation, () => stmt.all(...args)),
							run: (...args) => faults.sync(operation, () => stmt.run(...args))
						}
					}
				},
				session
			)
		}
		if (backend === 'redis') {
			return createRedisAuthStore(
				{
					...redis,
					get: key => faults.async('read', () => redis.get(key)),
					mGet: keys => faults.async('read', () => redis.mGet(keys)),
					keys: pattern => faults.async('read', () => redis.keys(pattern)),
					set: (key, value) => faults.async('write', () => redis.set(key, value)),
					del: keys => faults.async('delete', () => redis.del(keys))
				},
				`${session}:`
			)
		}
		// Route using the collection received from production, not the test session.
		// This catches accidental namespace loss despite the older fake's limitations.
		return createNekoDBAuthStore(
			{
				get: (collection, id) => faults.async('read', () => nekoDriver(collection).get(collection, id)),
				search: (collection, query) => faults.async('read', () => nekoDriver(collection).search(collection, query)),
				insert: (collection, data) => faults.async('write', () => nekoDriver(collection).insert(collection, data)),
				update: (collection, id, data) =>
					faults.async('write', () => nekoDriver(collection).update(collection, id, data)),
				delete: (collection, id) => faults.async('delete', () => nekoDriver(collection).delete(collection, id))
			},
			session
		)
	}
	return { open, faults }
}
