import { jest } from '@jest/globals'
import * as fs from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import logger from '../../../Utils/logger'
import type { SignalKeyStoreWithTransaction } from '../../../Types'

let failure: Error | undefined
jest.unstable_mockModule('fs/promises', () => ({
	...fs,
	readFile: (...args: Parameters<typeof fs.readFile>) => {
		if (failure) return Promise.reject(failure)
		return fs.readFile(...args)
	}
}))
const { createFileAuthStore, createSQLiteAuthStore, createMongoAuthStore, makeAuthStateFromStore } =
	await import('../../../Utils/auth-store')
const { useMultiFileAuthState } = await import('../../../Utils/use-multi-file-auth-state')
const { makeLibSignalRepository } = await import('../../../Signal/libsignal')
const { credentials } = await import('./fault-adapters')
const { makeFakeMongoCollection } = await import('./mock-stores')

describe('existing database rows with malformed values', () => {
	it('does not treat a SQLite NULL value as an absent credentials row', async () => {
		const store = createSQLiteAuthStore({ prepare: () => ({ all: () => [{ value: null }], run: () => undefined }) })
		await expect(store.get('creds.json')).rejects.toThrow('malformed')
		await expect(makeAuthStateFromStore(store)).rejects.toThrow('malformed')
	})
	it('does not treat a MongoDB NULL value as a missing credentials document', async () => {
		const collection = {
			...makeFakeMongoCollection(),
			findOne: async () => ({ key: 'creds.json', value: null })
		} as unknown as Parameters<typeof createMongoAuthStore>[0]
		const store = createMongoAuthStore(collection)
		await expect(store.get('creds.json')).rejects.toThrow('malformed')
		await expect(makeAuthStateFromStore(store)).rejects.toThrow('malformed')
	})
})

describe('file read failure is not a missing session', () => {
	let folder: string
	beforeEach(async () => {
		folder = await fs.mkdtemp(join(tmpdir(), 'furina-read-'))
	})
	afterEach(async () => {
		failure = undefined
		await fs.rm(folder, { recursive: true, force: true })
	})
	it('preserves genuine missing and valid existing record behavior', async () => {
		const store = await createFileAuthStore(folder)
		expect(await store.get('missing')).toBeNull()
		expect(await store.getMany(['missing'])).toEqual({})
		await store.set('record', 'valid')
		expect(await store.get('record')).toBe('valid')
		await store.set('creds.json', '{"platform":"synthetic-existing"}')
		expect((await makeAuthStateFromStore(store)).state.creds.platform).toBe('synthetic-existing')
		expect((await useMultiFileAuthState(folder)).state.creds.platform).toBe('synthetic-existing')
	})
	it.each(['EACCES', 'EIO', 'ETIMEDOUT', 'ECONNRESET'])(
		'propagates %s from raw reads and credential initialization',
		async code => {
			const store = await createFileAuthStore(folder)
			const original = Object.assign(new Error('synthetic read failure'), { code })
			failure = original
			await expect(store.get('creds.json')).rejects.toBe(original)
			await expect(store.getMany(['creds.json'])).rejects.toBe(original)
			await expect(makeAuthStateFromStore(store)).rejects.toBe(original)
			await expect(useMultiFileAuthState(folder)).rejects.toBe(original)
		}
	)
	it.each(['', '{invalid', 'null', 'false', '[]'])('does not replace malformed credentials %j', async raw => {
		await fs.writeFile(join(folder, 'creds.json'), raw)
		await expect(makeAuthStateFromStore(await createFileAuthStore(folder))).rejects.toThrow()
		await expect(useMultiFileAuthState(folder)).rejects.toThrow()
		expect(await fs.readFile(join(folder, 'creds.json'), 'utf8')).toBe(raw)
	})
})

describe('Signal session reads', () => {
	const open = (read: SignalKeyStoreWithTransaction['get']) =>
		makeLibSignalRepository(
			{
				creds: credentials('synthetic'),
				keys: { get: read, set: async () => undefined, isInTransaction: () => false, transaction: work => work() }
			},
			logger.child({ level: 'silent' })
		)
	it('returns missing only for an absent session', async () => {
		const repo = open(async () => ({}))
		try {
			expect(await repo.getSessionInfo('123@lid')).toBeNull()
		} finally {
			repo.close?.()
		}
	})
	it.each(['EACCES', 'EIO', 'ETIMEDOUT', 'ECONNRESET'])(
		'propagates %s through session reads and validation',
		async code => {
			const original = Object.assign(new Error('synthetic store failure'), { code })
			const repo = open(async () => {
				throw original
			})
			try {
				await expect(repo.getSessionInfo('123@lid')).rejects.toBe(original)
				await expect(repo.validateSession('123@lid')).rejects.toBe(original)
			} finally {
				repo.close?.()
			}
		}
	)
	it('rejects a malformed serialized session instead of reporting absent', async () => {
		const repo = open(async (_type, ids) => ({ [ids[0]!]: { version: 'invalid' } }) as never)
		try {
			await expect(repo.getSessionInfo('123@lid')).rejects.toThrow()
		} finally {
			repo.close?.()
		}
	})
})
