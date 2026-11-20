import { closeAfterFailedInitialization } from '../../../Utils/auth/owned-resource'
import { makeAuthStateFromStore } from '../../../Utils/auth-store'
import { sqliteStore } from './mock-stores'

describe('owned auth initialization', () => {
	it('closes an owned client when reading existing credentials fails', async () => {
		const store = await sqliteStore()
		const original = new Error('synthetic read failure')
		let closed = 0
		await expect(
			closeAfterFailedInitialization(
				() =>
					makeAuthStateFromStore({
						...store,
						get: async () => {
							throw original
						}
					}),
				() => {
					closed++
				}
			)
		).rejects.toBe(original)
		expect(closed).toBe(1)
	})

	it('preserves initialization and close failures without logging either', async () => {
		const original = new Error('synthetic setup failure')
		const cleanup = new Error('synthetic close failure')
		await expect(
			closeAfterFailedInitialization(
				async () => {
					throw original
				},
				async () => {
					throw cleanup
				}
			)
		).rejects.toMatchObject({ cause: original, errors: [original, cleanup] })
	})

	it('leaves the owned connection available on successful initialization', async () => {
		const store = await sqliteStore()
		let closed = false
		const state = await closeAfterFailedInitialization(
			() => makeAuthStateFromStore(store),
			() => {
				closed = true
			}
		)
		await state.saveCreds()
		expect(closed).toBe(false)
	})
})
