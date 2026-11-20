import type { AuthStore } from '../../../Types'
import { exportAuthState, importAuthState } from '../../../Utils/auth/backup-manager'
import { migrateAuthState } from '../../../Utils/auth/migration-manager'
import { readAll, sqliteStore } from './mock-stores'

describe.each(['migration', 'restore'] as const)('%s compensating recovery', operation => {
	const setup = async () => {
		const source = await sqliteStore()
		const values = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`key-${index}`, `value-${index}`]))
		await source.setMany({ 'creds.json': '{"marker":"new"}', ...values })
		const target = await sqliteStore()
		const previous = { 'creds.json': '{"marker":"old"}', 'key-0': 'old', 'sentinel': 'untouched' }
		await target.setMany(previous)
		const backup = await exportAuthState(source)
		const run = (store: AuthStore) =>
			operation === 'migration' ? migrateAuthState(source, store) : importAuthState(store, backup)
		return { source, target, previous, run }
	}

	it.each([0, 40, 41])('restores existing data after %i acknowledged writes and a failure', async completed => {
		const { source, target, previous, run } = await setup()
		const original = new Error('synthetic batch failure')
		const failing: AuthStore = {
			...target,
			setMany: async entries => {
				for (const [key, value] of Object.entries(entries).slice(0, completed)) await target.set(key, value)
				throw original
			}
		}
		await expect(run(failing)).rejects.toMatchObject({ cause: original })
		expect(await readAll(target)).toEqual(previous)
		expect(Object.keys(await readAll(source))).toHaveLength(101)
		await run(target)
		expect(await target.get('key-99')).toBe('value-99')
		expect(await target.get('sentinel')).toBe('untouched')
	})

	it('recovers a verification read exception', async () => {
		const { target, previous, run } = await setup()
		let calls = 0
		const original = new Error('synthetic verification failure')
		const failing = {
			...target,
			getMany: async (keys: string[]) => {
				if (++calls === 2) throw original
				return target.getMany(keys)
			}
		}
		await expect(run(failing)).rejects.toMatchObject({ cause: original })
		expect(await readAll(target)).toEqual(previous)
	})

	it('does not trust a silently incomplete write', async () => {
		const { target, previous, run } = await setup()
		await expect(run({ ...target, setMany: async () => undefined })).rejects.toMatchObject({
			data: { phase: 'verify', destinationMayBePartial: false }
		})
		expect(await readAll(target)).toEqual(previous)
	})

	it('preserves the primary cause and all rollback failures while attempting remaining keys', async () => {
		const { target, run } = await setup()
		const original = new Error('synthetic primary')
		const first = new Error('synthetic restore failure')
		const second = new Error('synthetic delete failure')
		const attempted: string[] = []
		const failing: AuthStore = {
			...target,
			setMany: async entries => {
				await target.setMany(entries)
				throw original
			},
			set: async (key, value) => {
				if (key === 'key-0') throw first
				await target.set(key, value)
			},
			remove: async key => {
				attempted.push(key)
				if (key === 'key-1') throw second
				return target.remove(key)
			}
		}
		const error: unknown = await run(failing).catch((err: unknown) => err)
		expect(error).toMatchObject({
			cause: original,
			data: { rollbackErrors: [first, second], destinationMayBePartial: true }
		})
		expect(attempted).toContain('key-99')
		expect(await target.get('sentinel')).toBe('untouched')
	})
})

describe('migration snapshot and observers', () => {
	it('rejects a missing enumerated source record before touching the target', async () => {
		const source = await sqliteStore()
		const target = await sqliteStore()
		await target.set('sentinel', 'old')
		await expect(migrateAuthState({ ...source, keys: async () => ['missing'] }, target)).rejects.toMatchObject({
			output: { statusCode: 400 }
		})
		expect(await readAll(target)).toEqual({ sentinel: 'old' })
	})

	it('recovers despite an observer throwing on verify and rollback', async () => {
		const source = await sqliteStore()
		const target = await sqliteStore()
		await source.set('x', 'new')
		await target.set('x', 'old')
		const original = new Error('synthetic observer failure')
		await expect(
			migrateAuthState(source, target, {
				onProgress: phase => {
					if (phase === 'verify' || phase === 'rollback') throw original
				}
			})
		).rejects.toMatchObject({ cause: original, data: { progressErrors: [original], destinationMayBePartial: false } })
		expect(await target.get('x')).toBe('old')
	})
})
