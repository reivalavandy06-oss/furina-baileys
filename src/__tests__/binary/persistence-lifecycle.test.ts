import { jest } from '@jest/globals'
import { EventEmitter } from 'events'
import { deferred } from '../TestUtils/storage-faults'
import type { SignalKeyStore } from '../../Types'

jest.unstable_mockModule('../../Socket/Client', () => ({
	WebSocketClient: class extends EventEmitter {
		isOpen = true
		isClosed = false
		isClosing = false
		connect() {}
		async close() {
			this.isOpen = false
			this.isClosed = true
			this.emit('close')
		}
		send(_data: unknown, callback?: (error?: Error) => void) {
			callback?.()
			return true
		}
	}
}))
const { makeSocket } = await import('../../Socket/socket')
const { DEFAULT_CONNECTION_CONFIG } = await import('../../Defaults')
const { credentials } = await import('../Utils/auth/fault-adapters')
const { default: logger } = await import('../../Utils/logger')

const open = (keys: SignalKeyStore) => {
	const creds = credentials('lifecycle-synthetic')
	creds.nextPreKeyId = 1
	creds.firstUnuploadedPreKeyId = 1
	const silent = logger.child({})
	silent.level = 'silent'
	return makeSocket({
		...DEFAULT_CONNECTION_CONFIG,
		auth: { creds, keys },
		logger: silent,
		transactionOpts: { maxCommitRetries: 1, delayBetweenTriesMs: 0 }
	})
}

describe('Socket persistence boundaries without a real transport', () => {
	afterEach(() => {
		jest.restoreAllMocks()
		jest.useRealTimers()
	})
	it('clears the upload deadline when a storage failure settles before the timeout', async () => {
		jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
		const original = new Error('synthetic prekey commit failure')
		const sock = open({
			get: async () => ({}),
			set: async () => {
				throw original
			}
		})
		const scheduled = jest.spyOn(global, 'setTimeout')
		const cleared = jest.spyOn(global, 'clearTimeout')
		try {
			await expect(sock.uploadPreKeys(1)).rejects.toBe(original)
			const index = scheduled.mock.calls.findIndex(([, delay]) => delay === 30_000)
			const deadline: unknown = scheduled.mock.results[index]?.value
			expect(deadline).toBeDefined()
			expect(cleared).toHaveBeenCalledWith(deadline)
		} finally {
			await sock.end(undefined)
		}
	})

	it('retains single-flight protection while a timed-out storage task is still running', async () => {
		jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
		const gate = deferred(),
			entered = deferred()
		let writes = 0
		const sock = open({
			get: async () => ({}),
			set: async () => {
				writes++
				entered.release()
				await gate.promise
				throw new Error('synthetic late failure')
			}
		})
		const first = Promise.allSettled([sock.uploadPreKeys(1)])
		await entered.promise
		await jest.advanceTimersByTimeAsync(30_000)
		expect((await first)[0]?.status).toBe('rejected')
		const second = Promise.allSettled([sock.uploadPreKeys(1)])
		gate.release()
		await second
		await Promise.resolve()
		await Promise.resolve()
		expect(writes).toBe(1)
		await sock.end(undefined)
	})

	it('does not claim that end awaits application saveCreds listeners', async () => {
		const gate = deferred(),
			entered = deferred()
		let saved = false
		const sock = open({ get: async () => ({}), set: async () => undefined })
		const saves: Promise<void>[] = []
		sock.ev.on('creds.update', () => {
			const save = (async () => {
				entered.release()
				await gate.promise
				saved = true
			})()
			saves.push(save)
		})
		sock.ev.emit('creds.update', { nextPreKeyId: 2 })
		await entered.promise
		await sock.end(undefined)
		expect(saved).toBe(false)
		gate.release()
		await Promise.all(saves)
		expect(saved).toBe(true)
	})
})
