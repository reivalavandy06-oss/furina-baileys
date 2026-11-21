import { migrateAuthState } from '../../../Utils/auth/migration-manager'
import { sqliteStore, readAll } from './mock-stores'
import { deferred } from '../../TestUtils/storage-faults'
import type { AuthStore } from '../../../Types'

describe('migration rollback conflicts', () => {
	it('uses atomic conditional recovery if a value changes after the read check', async () => {
		const source = await sqliteStore(),
			destination = await sqliteStore()
		await source.set('x', 'copied')
		await destination.set('x', 'old')
		const cause = new Error('synthetic batch failure')
		const target: AuthStore = {
			...destination,
			setMany: async records => {
				await destination.setMany(records)
				throw cause
			},
			compareAndSet: async (key, expected, replacement) => {
				await destination.set(key, 'concurrent-after-check')
				return destination.compareAndSet!(key, expected, replacement)
			}
		}
		await expect(migrateAuthState(source, target)).rejects.toMatchObject({
			cause,
			data: { rollbackConflicts: ['x'], conditionalRecovery: true }
		})
		expect(await destination.get('x')).toBe('concurrent-after-check')
	})
	it.each(['old', null])('preserves a concurrent update when snapshot value is %j', async original => {
		const source = await sqliteStore()
		const destination = await sqliteStore()
		await source.set('touched', 'copy')
		if (original !== null) await destination.set('touched', original)
		await destination.set('unrelated', 'before')
		const cause = new Error('synthetic failed batch')
		const target: AuthStore = {
			...destination,
			setMany: async records => {
				await destination.setMany(records)
				await destination.set('touched', 'concurrent')
				await destination.set('unrelated', 'concurrent-too')
				throw cause
			}
		}
		await expect(migrateAuthState(source, target)).rejects.toMatchObject({
			cause,
			data: { destinationMayBePartial: true, rollbackConflicts: ['touched'] }
		})
		expect(await readAll(destination)).toEqual({ touched: 'concurrent', unrelated: 'concurrent-too' })
		expect(await source.get('touched')).toBe('copy')
	})

	it('does not snapshot the same destination concurrently in two migrations', async () => {
		const first = await sqliteStore()
		const second = await sqliteStore()
		const destination = await sqliteStore()
		await first.set('x', 'one')
		await second.set('x', 'two')
		const gate = deferred()
		const entered = deferred()
		let calls = 0
		const target = {
			...destination,
			getMany: async (keys: string[]) => {
				calls++
				if (calls === 1) {
					entered.release()
					await gate.promise
				}
				return destination.getMany(keys)
			}
		}
		const a = migrateAuthState(first, target)
		await entered.promise
		const b = migrateAuthState(second, target)
		// A controlled turn lets B reach its lock without wall-clock sleeps.
		await Promise.resolve()
		await Promise.resolve()
		await Promise.resolve()
		expect(calls).toBe(1)
		gate.release()
		await Promise.all([a, b])
		expect(await destination.get('x')).toBe('two')
	})
})
