// REAL backend integration: MongoDB.
//
// Exercises the production MongoDB adapter against a real `mongodb` client.
// Every logical session gets its own collection inside a per-run database, and
// cleanup only deletes documents from collections this harness created.

import { BufferJSON } from '../../../Utils/generics'
import { CREDS_KEY } from '../../../Utils/auth-store'
import { integrationSuite } from './suite'

await integrationSuite('auth state conformance', 'mongodb', (_ready, { realAuthState, realStore }) => {
	const unique = (name: string) => `it-${name}-${Date.now()}`
	const open = (name: string) => realAuthState('mongodb', unique(name))
	const store = (name: string) => realStore('mongodb', unique(name))

	it('starts an unregistered synthetic session on the real client', async () => {
		const { state, saveCreds } = await open('synthetic')

		expect(state.creds.registered).toBe(false)
		expect(await state.keys.get('pre-key', ['missing'])).toEqual({ missing: null })

		await saveCreds()
	})

	it('restores credentials and Signal keys from a fresh adapter instance', async () => {
		const name = unique('restore')
		const first = await realAuthState('mongodb', name)
		await first.saveCreds()
		await first.state.keys.set({
			'pre-key': { '5': { public: new Uint8Array([9, 9, 9]), private: new Uint8Array([8, 8, 8]) } }
		})
		const persistedCreds = JSON.stringify(first.state.creds, BufferJSON.replacer)

		// A new adapter proves the data is server-side, not in-process.
		const second = await realAuthState('mongodb', name)
		expect(JSON.stringify(second.state.creds, BufferJSON.replacer)).toBe(persistedCreds)
		expect(Array.from((await second.state.keys.get('pre-key', ['5']))['5']!.public)).toEqual([9, 9, 9])
	})

	it('keeps concurrent writes in different collections isolated', async () => {
		const a = await realAuthState('mongodb', unique('iso-a'))
		const b = await realAuthState('mongodb', unique('iso-b'))

		await Promise.all([
			a.state.keys.set({ 'pre-key': { '1': { public: new Uint8Array([1]), private: new Uint8Array([1]) } } }),
			b.state.keys.set({ 'pre-key': { '1': { public: new Uint8Array([2]), private: new Uint8Array([2]) } } })
		])

		expect(Array.from((await a.state.keys.get('pre-key', ['1']))['1']!.public)).toEqual([1])
		expect(Array.from((await b.state.keys.get('pre-key', ['1']))['1']!.public)).toEqual([2])
	})

	it('backs up a real store and restores it into another collection', async () => {
		const { exportAuthState, importAuthState } = await import('../../../Utils/auth/backup-manager')
		const source = await store('backup-src')
		await source.set(CREDS_KEY, JSON.stringify({ marker: 'mongodb' }, BufferJSON.replacer))
		await source.set('pre-key-7.json', JSON.stringify({ public: new Uint8Array([7]) }, BufferJSON.replacer))

		const backup = await exportAuthState(source)

		const target = await store('backup-dst')
		const info = await importAuthState(target, backup)

		expect(info.hasCreds).toBe(true)
		const restored = await target.get('pre-key-7.json')
		expect(restored).not.toBeNull()
		expect(Array.from(JSON.parse(restored!, BufferJSON.reviver).public)).toEqual([7])
	})

	it('backs up a persisted session and restores it after clearing the source', async () => {
		const { exportAuthState, importAuthState } = await import('../../../Utils/auth/backup-manager')
		const name = unique('roundtrip')
		const source = await realStore('mongodb', name)
		await source.set(CREDS_KEY, JSON.stringify({ marker: 'mongodb' }, BufferJSON.replacer))

		const backup = await exportAuthState(source)

		const target = await realStore('mongodb', name)
		await target.clear?.()

		const info = await importAuthState(target, backup)
		expect(info.hasCreds).toBe(true)
	})

	it('exposes the documented record-key naming for pre-keys and sessions', async () => {
		const layout = await store('layout')
		await layout.set('pre-key-1.json', JSON.stringify({ public: new Uint8Array([1]) }, BufferJSON.replacer))
		await layout.set('session-628@s.whatsapp.net.json', JSON.stringify({ id: 1 }, BufferJSON.replacer))

		expect((await layout.keys()).sort()).toEqual(['pre-key-1.json', 'session-628@s.whatsapp.net.json'])

		await layout.remove('pre-key-1.json')
		expect(await layout.get('pre-key-1.json')).toBeNull()
	})

	it('does not advertise compareAndSet without a conditional-write primitive', async () => {
		const layout = await store('capabilities')
		expect(layout.compareAndSet).toBeUndefined()
	})
})
