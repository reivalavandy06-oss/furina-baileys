import { jest } from '@jest/globals'
import { createDisposalRegistry } from './lifecycle'
import { deferred } from '../../TestUtils/storage-faults'
import { createIntegrationStores } from './stores'
import { createBackendChecks, type ModuleLoader } from './availability'

describe('disposal deadlines and admission', () => {
	afterEach(() => jest.useRealTimers())
	it('reports a hang, continues independent cleanup, and blocks dependents without cancelling', async () => {
		jest.useFakeTimers()
		const registry = createDisposalRegistry({ timeoutMs: 100 })
		const gate = deferred(),
			entered = deferred()
		const calls: string[] = []
		registry.track('dependent', () => {
			calls.push('dependent')
		})
		registry.track('independent', () => {
			calls.push('independent')
		})
		registry.track('hanging', async () => {
			entered.release()
			await gate.promise
			calls.push('late-close')
		})
		registry.addDependency('dependent', 'hanging', true)
		const first = registry.disposeAll()
		const outcome = Promise.allSettled([first])
		await entered.promise
		expect(registry.disposeAll()).toBe(first)
		await jest.advanceTimersByTimeAsync(100)
		expect((await outcome)[0]?.status).toBe('rejected')
		expect(calls).toEqual(['independent'])
		expect(registry.getResults()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ label: 'hanging', status: 'timed-out' }),
				expect.objectContaining({ label: 'dependent', status: 'blocked' })
			])
		)
		gate.release()
		await registry.getResults().find(item => item.label === 'hanging')?.completion
		expect(calls).toEqual(['independent', 'late-close'])
		expect(registry.getResults().find(item => item.label === 'hanging')?.eventualStatus).toBe('succeeded')
		expect(() => registry.track('late', () => undefined)).toThrow('cleanup')
	})
	it('does not allocate a client after teardown starts during driver loading', async () => {
		const gate = deferred(),
			entered = deferred()
		let allocated = 0,
			loads = 0
		const loader: ModuleLoader = async () => {
			if (++loads === 2) {
				entered.release()
				await gate.promise
			}
			return {
				createClient: () => {
					allocated++
					throw new Error('must not allocate')
				}
			}
		}
		const env = { FURINA_TEST_REDIS_URL: 'redis://127.0.0.1:1' }
		const stores = createIntegrationStores(createBackendChecks(env, loader), loader, env)
		const pending = stores.realStore('redis', 'late')
		const outcome = Promise.allSettled([pending])
		await entered.promise
		await stores.disposeAll()
		gate.release()
		expect((await outcome)[0]).toMatchObject({
			status: 'rejected',
			reason: { message: expect.stringContaining('cleanup') }
		})
		expect(allocated).toBe(0)
	})
})
