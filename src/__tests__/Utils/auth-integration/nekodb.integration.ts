// REAL backend integration: NekoDB.
//
// Exercises the production NekoDB adapter against a real `@nekodb/client`
// instance. Nothing here connects to a production instance: the endpoint must be
// opted in via FURINA_TEST_NEKODB_TEST_INSTANCE, and every collection lives in a
// per-run namespace.

import { BufferJSON } from '../../../Utils/generics'
import { integrationSuite } from './suite'
import { realAuthState, realStore } from './stores'

await integrationSuite('auth state conformance', 'nekodb', _ready => {
	const unique = (name: string) => `it-${name}-${Date.now()}`
	const open = (name: string) => realAuthState('nekodb', unique(name))
	const store = (name: string) => realStore('nekodb', unique(name))

	it('starts an unregistered synthetic session on the real client', async () => {
		const { state, saveCreds } = await open('synthetic')

		expect(state.creds.registered).toBe(false)
		expect(await state.keys.get('pre-key', ['missing'])).toEqual({ missing: null })

		await saveCreds()
	})

	it('restores credentials and Signal keys after reopening', async () => {
		const name = unique('restore')
		const first = await realAuthState('nekodb', name)
		await first.saveCreds()
		await first.state.keys.set({
			'pre-key': { '5': { public: new Uint8Array([9, 9, 9]), private: new Uint8Array([8, 8, 8]) } }
		})
		const persistedCreds = JSON.stringify(first.state.creds, BufferJSON.replacer)

		// A fresh adapter proves the data is server-side, and that opaque-id
		// resolution really goes through `search` rather than local state.
		const second = await realAuthState('nekodb', name)
		expect(JSON.stringify(second.state.creds, BufferJSON.replacer)).toBe(persistedCreds)
		expect(Array.from((await second.state.keys.get('pre-key', ['5']))['5']!.public)).toEqual([9, 9, 9])
	})

	it('keeps concurrent writes in different collections isolated', async () => {
		const a = await realAuthState('nekodb', unique('iso-a'))
		const b = await realAuthState('nekodb', unique('iso-b'))

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
		await source.set('creds.json', JSON.stringify({ marker: 'nekodb' }, BufferJSON.replacer))
		await source.set('pre-key-7.json', JSON.stringify({ public: new Uint8Array([7]) }, BufferJSON.replacer))

		const backup = await exportAuthState(source)

		const target = await store('backup-dst')
		const info = await importAuthState(target, backup)

		expect(info.hasCreds).toBe(true)
		const restored = await target.get('pre-key-7.json')
		expect(restored).not.toBeNull()
		expect(Array.from(JSON.parse(restored!).public)).toEqual([7])
	})

	it('backs up a persisted session and restores it after clearing the source', async () => {
		const { exportAuthState, importAuthState } = await import('../../../Utils/auth/backup-manager')
		const name = unique('roundtrip')
		const source = await realStore('nekodb', name)
		await source.set('creds.json', JSON.stringify({ marker: 'nekodb' }, BufferJSON.replacer))

		const backup = await exportAuthState(source)

		const target = await realStore('nekodb', name)
		await target.clear?.()

		const info = await importAuthState(target, backup)
		expect(info.hasCreds).toBe(true)
	})
})
