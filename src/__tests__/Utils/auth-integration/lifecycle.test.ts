import { deferred } from '../../TestUtils/storage-faults'
import { createDisposalRegistry } from './lifecycle'

describe('integration resource disposal', () => {
	it.each([1, 2])('preserves %i failures and still attempts every disposer', async failures => {
		const registry = createDisposalRegistry()
		const calls: number[] = []
		const errors = Array.from({ length: failures }, (_, index) => new Error(`synthetic close ${index}`))
		for (let index = 0; index < 3; index++) {
			registry.track(() => {
				calls.push(index)
				if (index < failures) throw errors[index]
			})
		}
		const first = registry.disposeAll()
		await expect(first).rejects.toMatchObject({ errors: [...errors].reverse() })
		expect(calls).toEqual([2, 1, 0])
		expect(registry.disposeAll()).toBe(first)
		await expect(registry.disposeAll()).rejects.toMatchObject({ errors: [...errors].reverse() })
		expect(calls).toHaveLength(3)
	})

	it('shares completion for concurrent and repeated calls', async () => {
		const registry = createDisposalRegistry()
		const entered = deferred()
		const release = deferred()
		let calls = 0
		registry.track(async () => {
			calls++
			entered.release()
			await release.promise
		})
		const first = registry.disposeAll()
		await entered.promise
		const second = registry.disposeAll()
		expect(second).toBe(first)
		release.release()
		await Promise.all([first, second, registry.disposeAll()])
		expect(calls).toBe(1)
	})
})
