import { gzipSync } from 'zlib'
import { Buffer } from 'buffer'
import type { AuthStore, KeyPair } from '../../../Types'
import { BufferJSON } from '../../../Utils/generics'
import { CREDS_KEY } from '../../../Utils/auth-store'
import { BACKUP_VERSION, exportAuthState, importAuthState, peekAuthBackup } from '../../../Utils/auth/backup-manager'
import { nekodbStore, parseMarker, readAll, seed, sqliteStore } from './mock-stores'

const gzipFake = (text: string) => gzipSync(Buffer.from(text, 'utf8'), { level: 1 })

describe.each(['sqlite', 'nekodb'])('backup & restore on %s', label => {
	const makeStore = (): Promise<AuthStore> => (label === 'sqlite' ? sqliteStore() : nekodbStore())

	it('round-trips a full session back into the same backend', async () => {
		const store = await makeStore()
		await seed(store, 3)

		const before = await readAll(store)
		const backup = await exportAuthState(store)

		expect(Buffer.isBuffer(backup)).toBe(true)
		expect(backup.subarray(0, 2).toString('hex')).toBe('1f8b') // gzip magic

		await store.clear?.()
		expect(await store.get(CREDS_KEY)).toBeNull()

		const info = await importAuthState(store, backup)

		expect(info.backend).toBe(label)
		expect(info.hasCreds).toBe(true)
		expect(info.recordCount).toBe(4)

		expect(await readAll(store)).toEqual(before)
	})

	it('keeps Buffers intact across export + import', async () => {
		const store = await makeStore()
		const expected = await seed(store, 2)

		const backup = await exportAuthState(store)
		await store.clear?.()
		await importAuthState(store, backup)

		const creds = JSON.parse(String(await store.get(CREDS_KEY)), BufferJSON.reviver) as {
			noiseKey: KeyPair
			registrationId: number
		}
		const keyPair = JSON.parse(String(await store.get('pre-key-2.json')), BufferJSON.reviver) as KeyPair

		expect(Buffer.isBuffer(creds.noiseKey.public)).toBe(true)
		expect(Array.from(creds.noiseKey.public)).toEqual(Array.from(expected.noiseKey.public))
		expect(keyPair.public).toBeInstanceOf(Uint8Array)
		expect(Array.from(keyPair.public)).toEqual([2])
	})

	it('leaves records absent from the backup untouched', async () => {
		const store = await makeStore()
		await seed(store, 1)
		await store.set('session-foreign.json', JSON.stringify({ keep: true }))

		const backup = await exportAuthState(store, { exclude: key => key === 'session-foreign.json' })
		await importAuthState(store, backup)

		expect(parseMarker(await store.get('session-foreign.json'))).toEqual({ keep: true })
	})

	it('backs up an empty store without inventing creds', async () => {
		const store = await makeStore()
		const backup = await exportAuthState(store)

		const info = peekAuthBackup(backup)

		expect(info.hasCreds).toBe(false)
		expect(info.recordCount).toBe(0)

		expect(await store.get(CREDS_KEY)).toBeNull()
		await importAuthState(store, backup)
		expect(await store.get(CREDS_KEY)).toBeNull()
	})
})

describe('backup envelope', () => {
	it('keeps creds in their own field and reports a summary', async () => {
		const store = await nekodbStore()
		await seed(store, 3)

		const info = peekAuthBackup(await exportAuthState(store))

		expect(info.backend).toBe('nekodb')
		expect(info.hasCreds).toBe(true)
		expect(info.recordCount).toBe(3) // creds excluded from the key map
		expect(info.timestamp).toBeGreaterThan(0)
	})

	it('honours a custom gzip level', async () => {
		const store = await sqliteStore()
		await seed(store, 5)

		const nine = await exportAuthState(store, { level: 9 })
		const one = await exportAuthState(store, { level: 1 })

		expect(nine.byteLength).toBeLessThanOrEqual(one.byteLength)
		await expect(importAuthState(store, nine)).resolves.toEqual(expect.objectContaining({ recordCount: 6 }))
	})
})

describe('corrupt backups', () => {
	it('rejects payloads that are not gzip', async () => {
		await expect(importAuthState(await sqliteStore(), Buffer.from('not gzip at all'))).rejects.toThrow(/Backup rusak/)
	})

	it('rejects gzip that does not hold JSON', async () => {
		await expect(importAuthState(await sqliteStore(), gzipFake('}{ not json'))).rejects.toThrow(/Backup rusak/)
	})

	it('rejects a non-object envelope', async () => {
		await expect(importAuthState(await sqliteStore(), gzipFake('"just a string"'))).rejects.toThrow(/struktur/)
	})

	it('rejects an unsupported version', async () => {
		const payload = gzipFake(JSON.stringify({ version: 99, timestamp: 0, backend: 'x', data: { keys: {} } }))

		await expect(importAuthState(await sqliteStore(), payload)).rejects.toThrow(/tidak kompatibel.*99/)
	})

	it('rejects a missing keys map', async () => {
		const payload = gzipFake(
			JSON.stringify({ version: BACKUP_VERSION, timestamp: 0, backend: 'x', data: { creds: '{}' } })
		)

		await expect(importAuthState(await sqliteStore(), payload)).rejects.toThrow(/data\.keys/)
	})

	it('rejects a non-string record value', async () => {
		const payload = gzipFake(
			JSON.stringify({ version: BACKUP_VERSION, timestamp: 0, backend: 'x', data: { keys: { 'a.json': 7 } } })
		)

		await expect(importAuthState(await sqliteStore(), payload)).rejects.toThrow(/bukan string JSON/)
	})

	it('rejects a store with no setMany', async () => {
		// deliberately violates the AuthStore contract to prove the guard fires
		const store = {
			backend: 'stub',
			get: async () => null,
			getMany: async () => ({}),
			set: async () => undefined,
			remove: async () => true,
			keys: async () => []
		} as unknown as AuthStore

		const payload = gzipFake(
			JSON.stringify({ version: BACKUP_VERSION, timestamp: 0, backend: 'x', data: { keys: {} } })
		)

		await expect(importAuthState(store, payload)).rejects.toThrow(/setMany/)
	})
})
