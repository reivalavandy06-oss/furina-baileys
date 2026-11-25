// REAL backend integration: SQLite.
//
// Exercises the production SQLite adapter against the real `better-sqlite3`
// driver. Two production surfaces are covered separately:
//
//   - raw store + `makeAuthStateFromStore()` → `{ state, saveCreds }`, for auth
//   - `createSQLiteAuthStore()` → a raw `AuthStore`, for backup / migration
//
// Both build on a unique temporary database directory.

import { mkdir } from 'fs/promises'
import { join } from 'path'
import { BufferJSON } from '../../../Utils/generics'
import { CREDS_KEY, closeAuthState, createSQLiteAuthStore, useSQLiteAuthState } from '../../../Utils/auth-store'
import { initAuthCreds } from '../../../Utils/auth-utils'
import { loadDriver } from './availability'
import { integrationSuite } from './suite'

interface NativeSqliteDatabase {
	prepare: (sql: string) => { all: (...params: unknown[]) => unknown[]; run: (...params: unknown[]) => unknown }
	close: () => void
	open?: boolean
}

await integrationSuite('auth state conformance', 'sqlite', (ready, { realAuthState, realStore }) => {
	const unique = (name: string) => `${name}-${Date.now()}`
	const open = (name: string) => realAuthState('sqlite', unique(name))
	const store = (name: string) => realStore('sqlite', unique(name))

	/** Synthetic, deterministic material only. */
	const creds = (marker: string) => {
		const value = initAuthCreds() as unknown as { platform: string; advSecretKey: string }
		value.platform = marker
		value.advSecretKey = Buffer.alloc(4, marker.length).toString('base64')
		return value
	}

	it('starts an unregistered synthetic session on the real driver', async () => {
		const { state, saveCreds } = await open('synthetic-a')

		expect(state.creds.registered).toBe(false)
		expect(await state.keys.get('pre-key', ['missing'])).toEqual({ missing: null })

		await saveCreds()
	})

	it('restores credentials and Signal keys after reopening the same database', async () => {
		const name = unique('restore')
		const first = await realAuthState('sqlite', name)
		await first.saveCreds()
		await first.state.keys.set({
			'pre-key': { '5': { public: new Uint8Array([9, 9, 9]), private: new Uint8Array([8, 8, 8]) } }
		})
		const persistedCreds = JSON.stringify(first.state.creds, BufferJSON.replacer)

		// A second adapter proves the data is on disk, not just in-process.
		const second = await realAuthState('sqlite', name)
		expect(JSON.stringify(second.state.creds, BufferJSON.replacer)).toBe(persistedCreds)
		expect(Array.from((await second.state.keys.get('pre-key', ['5']))['5']!.public)).toEqual([9, 9, 9])
	})

	it('keeps concurrent writes in different databases isolated', async () => {
		const a = await realAuthState('sqlite', unique('iso-a'))
		const b = await realAuthState('sqlite', unique('iso-b'))

		await Promise.all([
			a.state.keys.set({ 'pre-key': { '1': { public: new Uint8Array([1]), private: new Uint8Array([1]) } } }),
			b.state.keys.set({ 'pre-key': { '1': { public: new Uint8Array([2]), private: new Uint8Array([2]) } } })
		])

		expect(Array.from((await a.state.keys.get('pre-key', ['1']))['1']!.public)).toEqual([1])
		expect(Array.from((await b.state.keys.get('pre-key', ['1']))['1']!.public)).toEqual([2])
	})

	it('backs up a real store and restores it into another database', async () => {
		const { exportAuthState, importAuthState } = await import('../../../Utils/auth/backup-manager')
		const source = await store('backup-src')
		await source.set(CREDS_KEY, JSON.stringify(creds('backup'), BufferJSON.replacer))
		await source.set('pre-key-7.json', JSON.stringify({ public: new Uint8Array([7]) }, BufferJSON.replacer))

		const backup = await exportAuthState(source)
		const target = await store('backup-dst')
		const info = await importAuthState(target, backup)

		expect(info.hasCreds).toBe(true)
		expect(await target.get('pre-key-7.json')).toBe(
			JSON.stringify({ public: new Uint8Array([7]) }, BufferJSON.replacer)
		)
	})

	it('backs up a persisted session and restores it after clearing the source', async () => {
		const { exportAuthState, importAuthState } = await import('../../../Utils/auth/backup-manager')
		const name = unique('roundtrip')
		const source = await realStore('sqlite', name)
		await source.set(CREDS_KEY, JSON.stringify(creds('roundtrip'), BufferJSON.replacer))

		const backup = await exportAuthState(source)

		const target = await realStore('sqlite', name)
		await target.clear?.()

		const info = await importAuthState(target, backup)
		expect(info.hasCreds).toBe(true)
	})

	it('exposes the documented record-key naming for pre-keys and sessions', async () => {
		const storeInstance = await store('layout')
		await storeInstance.set('pre-key-1.json', JSON.stringify({ public: new Uint8Array([1]) }, BufferJSON.replacer))
		await storeInstance.set('session-628@s.whatsapp.net.json', JSON.stringify({ id: 1 }, BufferJSON.replacer))

		expect((await storeInstance.keys()).sort()).toEqual(['pre-key-1.json', 'session-628@s.whatsapp.net.json'])

		await expect(storeInstance.remove('pre-key-1.json')).resolves.toBe(true)
		expect(await storeInstance.get('pre-key-1.json')).toBeNull()
		await expect(storeInstance.remove('pre-key-1.json')).resolves.toBe(false)
	})

	it('removes only one session and leaves another session intact', async () => {
		const a = await store(unique('remove-iso-a'))
		const b = await store(unique('remove-iso-b'))

		await a.setMany({ shared: 'a', onlyA: 'a' })
		await b.setMany({ shared: 'b', onlyB: 'b' })

		await expect(a.remove('shared')).resolves.toBe(true)
		expect(await a.get('shared')).toBeNull()
		expect(await b.get('shared')).toBe('b')

		await a.clear?.()
		expect(await a.keys()).toEqual([])
		expect(await b.getMany(['shared', 'onlyB'])).toEqual({ shared: 'b', onlyB: 'b' })
	})

	it('handles empty batches and repeated keys on the real driver', async () => {
		const storeInstance = await store('batch')

		await expect(storeInstance.getMany([])).resolves.toEqual({})
		await expect(storeInstance.setMany({})).resolves.toBeUndefined()

		await storeInstance.setMany({ a: '1', b: '2' })
		await storeInstance.setMany({ a: '3' })
		expect(await storeInstance.getMany(['a', 'b', 'missing'])).toEqual({ a: '3', b: '2' })
	})

	it('allows exactly one concurrent remove of the same record', async () => {
		const storeInstance = await store('remove-concurrent')
		await storeInstance.set('record', 'value')

		const results = await Promise.all([storeInstance.remove('record'), storeInstance.remove('record')])

		expect(results.sort()).toEqual([false, true])
		expect(await storeInstance.get('record')).toBeNull()
	})

	it('keeps concurrent writes in different sessions isolated at record level', async () => {
		const a = await realStore('sqlite', unique('records-a'))
		const b = await realStore('sqlite', unique('records-b'))

		await Promise.all([a.setMany({ x: '1', y: '2' }), b.setMany({ x: '3', y: '4' })])

		expect(await a.getMany(['x', 'y'])).toEqual({ x: '1', y: '2' })
		expect(await b.getMany(['x', 'y'])).toEqual({ x: '3', y: '4' })
	})

	it('performs conditional writes and deletes on the real SQLite driver', async () => {
		const storeInstance = await store('cas')
		const compareAndSet = storeInstance.compareAndSet
		expect(compareAndSet).toBeDefined()
		if (!compareAndSet) throw new Error('SQLite compareAndSet was not exposed')

		await storeInstance.set('recovery', 'old')
		await expect(compareAndSet('recovery', 'old', 'new')).resolves.toBe(true)
		await expect(compareAndSet('recovery', 'old', 'newer')).resolves.toBe(false)
		expect(await storeInstance.get('recovery')).toBe('new')

		await expect(compareAndSet('missing', 'old', 'new')).resolves.toBe(false)
		await expect(compareAndSet('recovery', 'new', null)).resolves.toBe(true)
		expect(await storeInstance.get('recovery')).toBeNull()
	})

	it('allows exactly one concurrent conditional write on a shared database', async () => {
		const name = unique('cas-concurrent')
		const a = await realStore('sqlite', name)
		const b = await realStore('sqlite', name)
		const compareA = a.compareAndSet
		const compareB = b.compareAndSet
		if (!compareA || !compareB) throw new Error('SQLite compareAndSet was not exposed')

		await a.set('recovery', 'old')
		const results = await Promise.all([compareA('recovery', 'old', 'a'), compareB('recovery', 'old', 'b')])

		expect(results.sort()).toEqual([false, true])
		expect(['a', 'b']).toContain(await a.get('recovery'))
	})

	it('uses the connection-local changes() fallback when run() hides metadata', async () => {
		await mkdir(ready.namespace, { recursive: true })
		const mod = await loadDriver('better-sqlite3')
		const Database = mod.default as new (path: string) => NativeSqliteDatabase
		const native = new Database(join(ready.namespace, `fallback-${Date.now()}.db`))

		try {
			native.prepare('CREATE TABLE IF NOT EXISTS furina_auth (key TEXT PRIMARY KEY, value TEXT)').run()
			const wrapped = {
				prepare: (sql: string) => {
					const statement = native.prepare(sql)
					return {
						all: (...params: unknown[]) => statement.all(...params),
						run: (...params: unknown[]) => {
							statement.run(...params)
						}
					}
				}
			}
			const storeInstance = createSQLiteAuthStore(wrapped)
			const compareAndSet = storeInstance.compareAndSet
			expect(compareAndSet).toBeDefined()
			if (!compareAndSet) throw new Error('SQLite compareAndSet fallback was not exposed')

			await storeInstance.set('recovery', 'old')
			await expect(compareAndSet('recovery', 'old', 'new')).resolves.toBe(true)
			await expect(compareAndSet('recovery', 'old', 'newer')).resolves.toBe(false)
			expect(await storeInstance.get('recovery')).toBe('new')
		} finally {
			native.close()
		}
	})

	it('closes an owned SQLite wrapper and rejects writes afterwards', async () => {
		const folder = join(ready.namespace, `owned-${Date.now()}`)
		await mkdir(folder, { recursive: true })
		const auth = await useSQLiteAuthState(folder)
		await auth.saveCreds()

		await closeAuthState(auth)
		await expect(auth.saveCreds()).rejects.toThrow('closing')
		await expect(closeAuthState(auth)).resolves.toBeUndefined()
	})
})
