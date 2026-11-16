import { migrateAuthState } from '../../../Utils/auth/migration-manager'
import { nekodbStore, parseMarker, readAll, seed, sqliteStore, withFailingGetMany } from './mock-stores'

const boomOf = async (promise: Promise<unknown>) =>
	(await promise.catch(error => error)) as { output?: { statusCode?: number }; message?: string }

const directions = [
	{ label: 'sqlite → nekodb', from: sqliteStore, to: nekodbStore },
	{ label: 'nekodb → sqlite', from: nekodbStore, to: sqliteStore }
]

describe.each(directions)('$label migration', ({ from, to }) => {
	it('moves every record and leaves the source intact', async () => {
		const source = await from()
		await seed(source, 3)

		const expected = await readAll(source)
		const target = await to()
		const result = await migrateAuthState(source, target)

		expect(result.backend).toBe(source.backend)
		expect(result.hasCreds).toBe(true)
		expect(result.migrated).toBe(4)

		expect(await readAll(target)).toEqual(expected)
		expect(await readAll(source)).toEqual(expected)
	})

	it('reports each phase through onProgress', async () => {
		const steps: string[] = []

		await migrateAuthState(await from(), await to(), { onProgress: step => steps.push(step) })

		expect(steps).toEqual(['read', 'write', 'verify', 'done'])
	})

	it('keeps records that only exist in the target', async () => {
		const source = await from()
		await seed(source, 1)

		const target = await to()
		await target.set('session-foreign.json', JSON.stringify({ keep: true }))

		await migrateAuthState(source, target)

		expect(parseMarker(await target.get('session-foreign.json'))).toEqual({ keep: true })
	})

	it('overwrites matching records in the target', async () => {
		const source = await from()
		await source.set('creds.json', JSON.stringify({ marker: 'source' }))

		const target = await to()
		await target.set('creds.json', JSON.stringify({ marker: 'stale' }))

		await migrateAuthState(source, target)

		expect(parseMarker(await target.get('creds.json'))).toEqual({ marker: 'source' })
	})

	it('skips verification when verify is false', async () => {
		const source = await nekodbStore()
		await source.set('creds.json', 'X')

		// failFrom 1 would break verification instantly if verification ran at all
		const target = withFailingGetMany(await sqliteStore(), 1)
		const steps: string[] = []

		const result = await migrateAuthState(source, target, {
			verify: false,
			onProgress: step => steps.push(step)
		})

		expect(result.migrated).toBe(1)
		expect(steps).toEqual(['read', 'write', 'done'])
		expect(await target.get('creds.json')).toBe('X')
	})
})

describe('migration failures', () => {
	it('refuses to migrate a store onto itself', async () => {
		const store = await sqliteStore()
		const error = await boomOf(migrateAuthState(store, store))

		expect(error.output?.statusCode).toBe(400)
		expect(error.message).toMatch(/store yang sama/)
	})

	it('rolls back and restores the prior target content when verification fails', async () => {
		const source = await nekodbStore()
		await source.set('creds.json', 'NEW-CREDS')
		await source.set('pre-key-1.json', 'NEW-KEY')

		const target = await sqliteStore()
		await target.set('creds.json', 'OLD-CREDS')
		await target.set('pre-key-1.json', 'OLD-KEY')

		// the snapshot is read before verification, so call 2 is what fails
		const flaky = withFailingGetMany(target, 2)
		const error = await boomOf(migrateAuthState(source, flaky))

		expect(error.output?.statusCode).toBe(500)
		expect(error.message).toMatch(/Migrasi gagal/)
		expect(error.message).toMatch(/Perubahan sudah dibatalkan/)

		expect(await target.get('creds.json')).toBe('OLD-CREDS')
		expect(await target.get('pre-key-1.json')).toBe('OLD-KEY')
	})

	it('reports a partial write when rollback is disabled', async () => {
		const source = await nekodbStore()
		await source.set('creds.json', 'NEW')

		const target = withFailingGetMany(await sqliteStore(), 2)
		const error = await boomOf(migrateAuthState(source, target, { rollback: false }))

		expect(error.output?.statusCode).toBe(500)
		expect(error.message).toMatch(/Target mungkin berisi sebagian data/)

		// the value written before verification is still there
		expect(await target.get('creds.json')).toBe('NEW')
	})

	it('surfaces a rollback that itself failed', async () => {
		const source = await nekodbStore()
		await source.set('creds.json', 'NEW')

		const target = withFailingGetMany(await sqliteStore(), 2)
		// a store whose remove() fails, so the rollback path itself errors
		target.remove = async () => {
			throw new Error('disk gone')
		}

		const error = await boomOf(migrateAuthState(source, target))

		expect(error.output?.statusCode).toBe(500)
		expect(error.message).toMatch(/Rollback gagal/)
	})
})
