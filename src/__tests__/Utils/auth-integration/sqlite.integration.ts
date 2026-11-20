// REAL backend integration: SQLite.
//
// Exercises the production SQLite adapter against the real `better-sqlite3`
// driver. Two production surfaces are covered separately:
//
//   - raw store + `makeAuthStateFromStore()` → `{ state, saveCreds }`, for auth
//   - `createSQLiteAuthStore()` → a raw `AuthStore`, for backup / migration
//
// Both build on a unique temporary database directory.

import { BufferJSON } from '../../../Utils/generics'
import { CREDS_KEY } from '../../../Utils/auth-store'
import { initAuthCreds } from '../../../Utils/auth-utils'
import { integrationSuite } from './suite'

await integrationSuite('auth state conformance', 'sqlite', (_ready, { realAuthState, realStore }) => {
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

		await storeInstance.remove('pre-key-1.json')
		expect(await storeInstance.get('pre-key-1.json')).toBeNull()
	})

	it('keeps concurrent writes in different sessions isolated at record level', async () => {
		const a = await realStore('sqlite', unique('records-a'))
		const b = await realStore('sqlite', unique('records-b'))

		await Promise.all([a.setMany({ x: '1', y: '2' }), b.setMany({ x: '3', y: '4' })])

		expect(await a.getMany(['x', 'y'])).toEqual({ x: '1', y: '2' })
		expect(await b.getMany(['x', 'y'])).toEqual({ x: '3', y: '4' })
	})
})
