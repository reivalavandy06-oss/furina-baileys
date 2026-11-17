import { jest } from '@jest/globals'
import { StorageFaults } from '../../TestUtils/storage-faults'

describe('test-only storage fault controls', () => {
	let faults: StorageFaults
	beforeEach(() => {
		faults = new StorageFaults()
	})
	afterEach(() => {
		faults.dispose()
		jest.useRealTimers()
	})

	it.each(['before', 'after'] as const)('distinguishes synchronous rejection %s commit', phase => {
		let persisted = false
		const error = faults.fail('write', phase)
		expect(() =>
			faults.sync('write', () => {
				persisted = true
			})
		).toThrow(error)
		expect(persisted).toBe(phase === 'after')
		expect(faults.trace.map(point => point.phase)).toEqual(phase === 'before' ? ['before'] : ['before', 'after'])
	})

	it('fails exactly the requested occurrence, then allows recovery', async () => {
		const error = faults.fail('read', 'before', 2)
		await expect(faults.async('read', async () => 1)).resolves.toBe(1)
		await expect(faults.async('read', async () => 2)).rejects.toBe(error)
		await expect(faults.async('read', async () => 3)).resolves.toBe(3)
		expect(faults.trace).toHaveLength(5)
	})

	it('holds an async operation until explicitly released and records only operation metadata', async () => {
		const gate = faults.hold('write')
		let executed = false
		const pending = faults.async('write', async () => {
			executed = true
		})
		const observed = Promise.allSettled([pending])
		try {
			await gate.entered
			expect(executed).toBe(false)
			expect(faults.trace).toEqual([{ operation: 'write', phase: 'before' }])
			gate.release()
			await pending
			expect(executed).toBe(true)
			expect(faults.trace.at(-1)).toEqual({ operation: 'write', phase: 'after' })
		} finally {
			faults.dispose()
			await observed
		}
	})

	it('simulates a timed-out driver deterministically with no live connection or real sleep', async () => {
		jest.useFakeTimers()
		const error = Object.assign(new Error('synthetic deadline reached'), { code: 'ETIMEDOUT' })
		const pending = faults.async(
			'read',
			() =>
				new Promise<never>((_resolve, reject) => {
					setTimeout(() => reject(error), 100)
				})
		)
		const outcome = Promise.allSettled([pending])
		try {
			await jest.advanceTimersByTimeAsync(100)
			expect((await outcome)[0]).toEqual({ status: 'rejected', reason: error })
			expect(jest.getTimerCount()).toBe(0)
			await expect(faults.async('read', async () => 'reconnected')).resolves.toBe('reconnected')
		} finally {
			await jest.runAllTimersAsync()
			await outcome
		}
	})
})
