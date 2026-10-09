import { jest } from '@jest/globals'
import { CRMBroadcastManager } from '../../../../Utils/crm/broadcast/manager'
import { InMemoryStorage } from '../../../../Utils/crm/storage/memory'

// Test ini hanya menguji rate limiter, jadi tidak ada network: sock di-stub
// dan delay dibuat nol.
//
// Date.now() dipalsukan supaya lompatan 60 menit bisa terjadi instan, tapi
// setTimeout dibiarkan nyata supaya sleep(0) di dalam sendToGroups tetap
// resolve tanpa perlu advance timer manual.
const BASE_TIME = new Date('2026-01-01T00:00:00.000Z')
const MINUTE = 60_000
const HOUR = 3_600_000

const group = (n: number): string => `1203630${String(n).padStart(6, '0')}@g.us`

const makeSock = (options: { members?: string[]; failFor?: string[] } = {}) => {
	const members = new Set(options.members ?? [])
	const failFor = new Set(options.failFor ?? [])
	const sent: string[] = []

	return {
		sent,
		async groupFetchAllParticipating() {
			const out: Record<string, unknown> = {}
			for (const jid of members) out[jid] = { id: jid }
			return out
		},
		async groupMetadata() {
			throw new Error('stub: no metadata')
		},
		async sendMessage(jid: string) {
			if (failFor.has(jid)) throw new Error('stub: send failed')
			sent.push(jid)
			return { key: { id: `sent-${jid}` } }
		}
	}
}

const makeManager = (sock: unknown) =>
	new CRMBroadcastManager(sock, new InMemoryStorage(), { registryPath: null })

// Delay nol supaya tidak ada tidur nyata; gaussianDelay(0, 0) selalu 0.
const fast = { minDelayMs: 0, maxDelayMs: 0 }

beforeEach(() => {
	jest.useFakeTimers({ doNotFake: ['setTimeout', 'setInterval', 'setImmediate'] })
	jest.setSystemTime(BASE_TIME)
})

afterEach(() => {
	jest.useRealTimers()
})

describe('sendToGroups rolling hourly limit', () => {
	it('sends and records when below the limit', async () => {
		const sock = makeSock({ members: [group(1), group(2)] })
		const manager = makeManager(sock)

		const result = await manager.sendToGroups([group(1), group(2)], 'halo', {
			...fast,
			maxPerHour: 3
		})

		expect(result.status).toBe('completed')
		expect(result.sentCount).toBe(2)
		expect(sock.sent).toEqual([group(1), group(2)])
	})

	it('accumulates budget across separate calls on the same instance', async () => {
		const jids = [group(1), group(2), group(3), group(4)]
		const sock = makeSock({ members: jids })
		const manager = makeManager(sock)

		// dua panggilan terpisah, masing-masing 2 group, maxPerHour 3.
		// Kalau state-nya lokal per panggilan (bug lama), keduanya lolos.
		const first = await manager.sendToGroups(jids.slice(0, 2), 'halo', {
			...fast,
			maxPerHour: 3
		})
		const second = await manager.sendToGroups(jids.slice(2), 'halo', {
			...fast,
			maxPerHour: 3
		})

		expect(first.sentCount).toBe(2)
		expect(second.sentCount).toBe(1)
		expect(second.status).toBe('throttled')
		expect(sock.sent).toHaveLength(3)
	})

	it('throttles exactly at the maxPerHour + 1 group', async () => {
		const jids = [group(1), group(2), group(3)]
		const sock = makeSock({ members: jids })
		const manager = makeManager(sock)

		const result = await manager.sendToGroups(jids, 'halo', { ...fast, maxPerHour: 2 })

		expect(result.status).toBe('throttled')
		expect(result.sentCount).toBe(2)
		expect(result.totalGroups).toBe(3)
		expect(sock.sent).toHaveLength(2)
	})

	it('does not throttle while still below the limit', async () => {
		const jids = [group(1), group(2), group(3)]
		const sock = makeSock({ members: jids })
		const manager = makeManager(sock)

		const result = await manager.sendToGroups(jids, 'halo', { ...fast, maxPerHour: 5 })

		expect(result.status).toBe('completed')
		expect(result.sentCount).toBe(3)
	})

	it('prunes timestamps older than the rolling window and frees the slot', async () => {
		const first = [group(1), group(2)]
		const second = [group(3), group(4)]
		const sock = makeSock({ members: [...first, ...second] })
		const manager = makeManager(sock)

		await manager.sendToGroups(first, 'halo', { ...fast, maxPerHour: 2 })

		// lompat tepat ke luar window: 60 menit + 1 ms
		jest.setSystemTime(new Date(BASE_TIME.getTime() + HOUR + 1))

		const result = await manager.sendToGroups(second, 'halo', { ...fast, maxPerHour: 2 })

		// slot lama sudah keluar window, jadi 2 group baru tetap bisa dikirim
		expect(result.status).toBe('completed')
		expect(result.sentCount).toBe(2)
	})

	it('treats a timestamp exactly 60 minutes old as expired', async () => {
		const first = [group(1), group(2)]
		const second = [group(3)]
		const sock = makeSock({ members: [...first, ...second] })
		const manager = makeManager(sock)

		await manager.sendToGroups(first, 'halo', { ...fast, maxPerHour: 2 })

		// tepat 60 menit, belum 1 ms lebih: boundary `now - at < HOUR` berarti
		// timestamp ini sudah expired, jadi slot tersedia lagi.
		jest.setSystemTime(new Date(BASE_TIME.getTime() + HOUR))

		const result = await manager.sendToGroups(second, 'halo', { ...fast, maxPerHour: 2 })

		expect(result.status).toBe('completed')
		expect(result.sentCount).toBe(1)
	})

	it('keeps the timestamp store bounded as the window slides', async () => {
		const jids = Array.from({ length: 41 }, (_, i) => group(i + 1))
		const sock = makeSock({ members: jids })
		const manager = makeManager(sock)
		const limit = 4

		// 40 giliran, tiap giliran 1 group, selalu digeser 1 menit ke depan
		for (let i = 1; i <= 40; i++) {
			await manager.sendToGroups([jids[i - 1]!], 'halo', { ...fast, maxPerHour: limit })
			jest.setSystemTime(new Date(BASE_TIME.getTime() + i * MINUTE))
		}

		// budget penuh: store boleh menyimpan 4 slot, bukan menumpuk 40
		const blocked = await manager.sendToGroups([jids[40]!], 'halo', {
			...fast,
			maxPerHour: limit
		})
		expect(blocked.status).toBe('throttled')
		expect(blocked.sentCount).toBe(0)

		// Setelah 61 menit dari giliran terakhir, semua entry lama keluar window
		jest.setSystemTime(new Date(BASE_TIME.getTime() + 40 * MINUTE + HOUR + 1))
		const afterWindow = await manager.sendToGroups([jids[40]!], 'halo', {
			...fast,
			maxPerHour: limit
		})
		expect(afterWindow.status).toBe('completed')
		expect(afterWindow.sentCount).toBe(1)
	})

	it('gives a second manager instance its own budget', async () => {
		const jids = [group(1), group(2)]
		const sockA = makeSock({ members: jids })
		const sockB = makeSock({ members: jids })
		const managerA = makeManager(sockA)
		const managerB = makeManager(sockB)

		await managerA.sendToGroups(jids, 'halo', { ...fast, maxPerHour: 2 })
		const resultB = await managerB.sendToGroups(jids, 'halo', { ...fast, maxPerHour: 2 })

		// manager B belum pakai budget-nya sama sekali
		expect(resultB.status).toBe('completed')
		expect(resultB.sentCount).toBe(2)
		expect(sockA.sent).toHaveLength(2)
		expect(sockB.sent).toHaveLength(2)

		// sementara manager A sudah habis untuk window ini
		const blockedA = await managerA.sendToGroups([group(3)], 'halo', {
			...fast,
			maxPerHour: 2
		})
		expect(blockedA.status).toBe('throttled')
	})

	it('does not consume budget for groups the bot is not a member of', async () => {
		const sock = makeSock({ members: [group(1)] })
		const manager = makeManager(sock)

		const result = await manager.sendToGroups(
			[group(10), group(11), group(1), group(12), group(13)],
			'halo',
			{ ...fast, maxPerHour: 2 }
		)

		// 4 group dilewati karena bot bukan member, jadi tidak bursting budget
		expect(result.sentCount).toBe(1)
		expect(result.status).toBe('completed')
		expect(result.warnings).toHaveLength(4)
	})

	it('does not consume budget for failed sends', async () => {
		const sock = makeSock({ members: [group(1), group(2), group(3)], failFor: [group(1), group(2)] })
		const manager = makeManager(sock)

		const result = await manager.sendToGroups(
			[group(1), group(2), group(3)],
			'halo',
			{ ...fast, maxPerHour: 2 }
		)

		// dua pertama gagal dan melepas slot-nya, jadi group ketiga tetap terkirim
		expect(result.failedCount).toBe(2)
		expect(result.sentCount).toBe(1)
		expect(result.status).toBe('completed')
	})

	it('does not let concurrent calls breach the limit', async () => {
		const jids = [group(1), group(2), group(3), group(4)]
		const sock = makeSock({ members: jids })
		const manager = makeManager(sock)

		// dua panggilan paralel di instance yang sama, maxPerHour 3
		const [a, b] = await Promise.all([
			manager.sendToGroups(jids.slice(0, 2), 'halo', { ...fast, maxPerHour: 3 }),
			manager.sendToGroups(jids.slice(2), 'halo', { ...fast, maxPerHour: 3 })
		])

		const totalSent = a.sentCount + b.sentCount
		expect(totalSent).toBeLessThanOrEqual(3)
		expect(sock.sent.length).toBeLessThanOrEqual(3)
		expect([a.status, b.status]).toContain('throttled')
	})

	it('dry run consumes budget just like a real send', async () => {
		const jids = [group(1), group(2), group(3)]
		const sock = makeSock({ members: jids })
		const manager = makeManager(sock)

		const result = await manager.sendToGroups(jids, 'halo', {
			...fast,
			maxPerHour: 2,
			dryRun: true
		})

		// behavior existing: dry run tetap memakai slot per jam
		expect(result.sentCount).toBe(2)
		expect(result.status).toBe('throttled')
		expect(sock.sent).toHaveLength(0)
	})

	it('preserves partial result when throttled mid-loop', async () => {
		const jids = [group(1), group(2), group(3), group(4), group(5)]
		const sock = makeSock({ members: jids })
		const manager = makeManager(sock)

		const result = await manager.sendToGroups(jids, 'halo', { ...fast, maxPerHour: 2 })

		expect(result.status).toBe('throttled')
		expect(result.sentCount).toBe(2)
		expect(result.failedCount).toBe(0)
		// totalGroups tetap melaporkan input penuh, bukan yang terkirim
		expect(result.totalGroups).toBe(5)
	})
})