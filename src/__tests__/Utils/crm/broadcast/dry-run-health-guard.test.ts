import { jest } from '@jest/globals'
import { EventEmitter } from 'node:events'
import { CRMBroadcastManager } from '../../../../Utils/crm/broadcast/manager'
import { InMemoryStorage } from '../../../../Utils/crm/storage/memory'
import type { CRMCustomer } from '../../../../Utils/crm/types'

// M-B4: reportContent() tidak boleh dipanggil untuk dry run. Kalau iya, satu
// simulasi saja sudah bisa melewati batas identical-message guard
// (default 4 pesan identik per jam) dan menjatuhkan campaign yang sebenarnya
// belum jalan.

const group = (n: number): string => `1203630${String(n).padStart(6, '0')}@g.us`
const customer = (n: number): string => `628${String(n).padStart(9, '0')}@s.whatsapp.net`

// Identik-message guard: 4 pesan identik memicu +25 risk.
const MAX_IDENTICAL = 4

const makeGroupSock = (options: { members?: string[] } = {}) => {
	const members = new Set(options.members ?? [])
	const sent: string[] = []
	const sock = {
		sent,
		ev: new EventEmitter(),
		async groupFetchAllParticipating() {
			const out: Record<string, unknown> = {}
			for (const jid of members) out[jid] = { id: jid }
			return out
		},
		async groupMetadata() {
			throw new Error('stub: no metadata')
		},
		async sendMessage(jid: string) {
			sent.push(jid)
			return { key: { id: `sent-${jid}` } }
		}
	}
	return sock
}

const makeStorage = async (jids: string[]): Promise<InMemoryStorage> => {
	const storage = new InMemoryStorage()
	for (const jid of jids) {
		await storage.saveCustomer({
			jid,
			lid: null,
			pn: null,
			pushname: null,
			status: 'active',
			tags: [],
			metadata: {},
			firstSeen: Date.now(),
			lastSeen: Date.now(),
			messageCount: 1,
			createdAt: Date.now(),
			updatedAt: Date.now()
		} as CRMCustomer)
	}
	return storage
}

const makeManager = (sock: unknown, storage: InMemoryStorage) =>
	new CRMBroadcastManager(sock, storage, {
		minDelayMs: 0,
		maxDelayMs: 0,
		newChatPenaltyMs: 0,
		registryPath: null,
		quarantinePath: null,
		maxPerMinute: 10,
		maxRetries: 0
	})

const fast = { minDelayMs: 0, maxDelayMs: 0 }

const drive = async <T>(factory: () => Promise<T>): Promise<T> => {
	const pending = factory()
	let settled = false
	const tracked = pending.then(
		v => {
			settled = true
			return v
		},
		e => {
			settled = true
			throw e
		}
	)
	for (let i = 0; i < 60 && !settled; i++) {
		await jest.advanceTimersByTimeAsync(1_000)
	}
	return tracked
}

const riskScore = (manager: CRMBroadcastManager): number => manager.getHealthReport().score

beforeEach(() => {
	jest.useFakeTimers()
	jest.setSystemTime(new Date('2026-07-01T00:00:00.000Z'))
})

afterEach(() => {
	jest.useRealTimers()
})

describe('M-B4: dry run tidak memakai budget identical-message guard', () => {
	it('dry run group berulang tidak menaikkan risk score', async () => {
		const members = Array.from({ length: 10 }, (_, i) => group(i + 1))
		const sock = makeGroupSock({ members })
		const manager = makeManager(sock, await makeStorage([]))

		// sepuluh simulasi dengan konten identik: jauh di atas batas guard
		for (let i = 0; i < 10; i++) {
			await drive(() =>
				manager.sendToGroups([members[i]!], 'konten identik', {
					...fast,
					maxPerHour: 20,
					dryRun: true
				})
			)
		}

		expect(riskScore(manager)).toBe(0)
		expect(manager.getHealthReport().recentEvents).toHaveLength(0)
	})

	it('dry run group tetap berjalan dan tidak mengirim pesan', async () => {
		const sock = makeGroupSock({ members: [group(1), group(2)] })
		const manager = makeManager(sock, await makeStorage([]))

		const result = await drive(() =>
			manager.sendToGroups([group(1), group(2)], 'halo', {
				...fast,
				maxPerHour: 5,
				dryRun: true
			})
		)

		expect(result.status).toBe('completed')
		expect(result.sentCount).toBe(2)
		expect(result.totalGroups).toBe(2)
		expect(sock.sent).toHaveLength(0)
	})

	it('dry run personal berulang juga tidak menaikkan risk score', async () => {
		const storage = await makeStorage([customer(1)])
		const manager = makeManager(makeGroupSock(), storage)

		for (let i = 0; i < 10; i++) {
			await drive(() => manager.send({}, 'konten identik', { dryRun: true }))
		}

		expect(riskScore(manager)).toBe(0)
		expect(manager.getHealthReport().recentEvents).toHaveLength(0)
	})

	it('dry run personal tetap berjalan dan tidak mengirim pesan', async () => {
		const storage = await makeStorage([customer(1)])
		const sock = makeGroupSock()
		const manager = makeManager(sock, storage)

		const result = await drive(() => manager.send({}, 'halo', { dryRun: true }))

		expect(result.sentCount).toBe(1)
		expect(result.totalRecipients).toBe(1)
		expect(sock.sent).toHaveLength(0)
	})
})

describe('alur normal tetap memakai guard', () => {
	it('pengiriman nyata group tetap memanggil reportContent dan menaikkan risk', async () => {
		const members = Array.from({ length: MAX_IDENTICAL }, (_, i) => group(i + 1))
		const sock = makeGroupSock({ members })
		const manager = makeManager(sock, await makeStorage([]))

		for (let i = 0; i < MAX_IDENTICAL; i++) {
			await drive(() =>
				manager.sendToGroups([members[i]!], 'konten identik', { ...fast, maxPerHour: 20 })
			)
		}

		// guard ke-trigger pada pesan identik ke-4
		expect(riskScore(manager)).toBeGreaterThan(0)
		expect(sock.sent).toHaveLength(MAX_IDENTICAL)
	})

	it('campuran dry run lalu kirim nyata hanya menghitung kiriman nyata', async () => {
		const members = [group(1), group(2), group(3), group(4)]
		const sock = makeGroupSock({ members })
		const manager = makeManager(sock, await makeStorage([]))

		// tiga simulasi dulu
		for (let i = 0; i < MAX_IDENTICAL - 1; i++) {
			await drive(() =>
				manager.sendToGroups([members[i]!], 'konten identik', {
					...fast,
					maxPerHour: 20,
					dryRun: true
				})
			)
		}
		expect(riskScore(manager)).toBe(0)

		// baru satu pengiriman nyata: ini yang pertama dihitung
		await drive(() =>
			manager.sendToGroups([members[3]!], 'konten identik', { ...fast, maxPerHour: 20 })
		)

		expect(sock.sent).toEqual([members[3]])
		expect(riskScore(manager)).toBe(0)
	})

	it('dry run tidak memicu pause, jadi campaign berikutnya tetap jalan', async () => {
		const members = Array.from({ length: 10 }, (_, i) => group(i + 1))
		const sock = makeGroupSock({ members })
		const manager = makeManager(sock, await makeStorage([]))

		for (let i = 0; i < 8; i++) {
			await drive(() =>
				manager.sendToGroups([members[i]!], 'konten identik', {
					...fast,
					maxPerHour: 20,
					dryRun: true
				})
			)
		}

		// campaign nyata berikutnya tidak boleh ter-pause oleh simulasi
		const result = await drive(() =>
			manager.sendToGroups([members[8]!], 'konten identik', { ...fast, maxPerHour: 20 })
		)

		expect(result.status).toBe('completed')
		expect(sock.sent).toEqual([members[8]])
	})
})