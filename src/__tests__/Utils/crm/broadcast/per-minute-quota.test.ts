import { jest } from '@jest/globals'
import { CRMBroadcastManager } from '../../../../Utils/crm/broadcast/manager'
import { InMemoryStorage } from '../../../../Utils/crm/storage/memory'
import type { CRMCustomer } from '../../../../Utils/crm/types'

// Limiter per menit hanya dipakai oleh send() personal, jadi test ini fokus ke
// sana.
//
// Timer sepenuhnya palsu dan tidak ada sleep nyata sama sekali. even sleep(0)
// di dalam send() dijadwalkan lewat setTimeout, jadi setiap rantai timer harus
// dijalankan manual lewat jest.advanceTimersByTimeAsync(). Driver di bawah
// memulai promise, lalu menjalankan seluruh timer yang tersisa dalam satu
// advance besar; advanceTimersByTimeAsync menyiram microtask di sela setiap
// timer, sehingga loop claimMinuteSlot() bisa menjadwalkan iterasi berikutnya
// sampai jendela bergeser dan klaim berhasil.

const BASE = new Date('2026-02-01T00:00:00.000Z')
const MINUTE = 60_000

// Majukan jam ke offset tertentu (ms sejak BASE) sebelum menjalankan rantai.
const setClock = (offsetMs: number): void => {
	jest.setSystemTime(new Date(BASE.getTime() + offsetMs))
}

// Jalankan factory, lalu majukan jam dalam langkah kecil hanya sebanyak yang
// dibutuhkan sampai promise selesai. Tidak boleh melompat jauh: filter
// startedAt milik tracker membandingkan timestamp, jadi jam yang meloncat
//Rn massively bisa membuat record lama ikut terhitung.
const drive = async <T>(factory: () => Promise<T>): Promise<T> => {
	const pending = factory()
	let settled = false
	const tracked = pending.then(
		value => {
			settled = true
			return value
		},
		error => {
			settled = true
			throw error
		}
	)

	// 1 detik per langkah; claimMinuteSlot() yang perlu menunggu paling lama
	// satu jendela (60 detik), jadi 200 langkah lebih dari cukup.
	for (let step = 0; step < 200 && !settled; step++) {
		await jest.advanceTimersByTimeAsync(1_000)
	}

	return tracked
}

// Jalankan factory pada offset jam tertentu.
const driveAt = async <T>(offsetMs: number, factory: () => Promise<T>): Promise<T> => {
	setClock(offsetMs)
	return drive(factory)
}

// Konten unik per kiriman. Kalau semua memakai teks yang sama, identical-message
// guard di CRMHealthMonitor aktif setelah 4 pesan dan campaign jadi ter-pause —
// itu perilaku lain yang tidak sedang diuji di sini.
const msgFor = (jid: string): string => `halo ${jid}`

const customer = (n: number): string => `628${String(n).padStart(9, '0')}@s.whatsapp.net`

const boom = (code: number, jid: string): Error => {
	const err = new Error(`stub error ${code} for ${jid}`) as Error & {
		output: { statusCode: number }
	}
	err.output = { statusCode: code }
	return err
}

interface SockOptions {
	fail?: Record<string, number>
	hold?: Set<string>
}

const makeSock = (options: SockOptions = {}) => {
	const sent: string[] = []
	let releaseHold: (() => void) | undefined

	return {
		sent,
		releaseHeld(): void {
			releaseHold?.()
		},
		async sendMessage(jid: string) {
			if (options.hold?.has(jid)) {
				await new Promise<void>(resolve => {
					releaseHold = resolve
				})
			}
			const code = options.fail?.[jid]
			if (code !== undefined) throw boom(code, jid)
			sent.push(jid)
			return { key: { id: `sent-${jid}` } }
		}
	}
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
			// messageCount > 0 supaya newChatPenaltyMs tidak menimpa delay 0
			messageCount: 1,
			createdAt: Date.now(),
			updatedAt: Date.now()
		})
	}
	return storage
}

interface ManagerOptions {
	maxPerMinute?: number
	maxRetries?: number
	quarantinePath?: string | null
}

const makeManager = (
	sock: unknown,
	storage: InMemoryStorage,
	options: ManagerOptions = {}
): CRMBroadcastManager =>
	new CRMBroadcastManager(sock, storage, {
		minDelayMs: 0,
		maxDelayMs: 0,
		newChatPenaltyMs: 0,
		registryPath: null,
		quarantinePath: options.quarantinePath ?? null,
		maxPerMinute: options.maxPerMinute ?? 10,
		maxRetries: options.maxRetries ?? 0
	})

// Segment yang hanya menyertakan satu customer, supaya tiap pemanggilan
// send() punya penerima tunggal dan mudah diprediksi.
const only = (jid: string) => ({ customFilter: (c: CRMCustomer) => c.jid === jid })

beforeEach(() => {
	jest.useFakeTimers()
	jest.setSystemTime(BASE)
})

afterEach(() => {
	jest.useRealTimers()
})

describe('send() per-minute quota accounting', () => {
	it('sends while below the limit and consumes a slot per successful send', async () => {
		const storage = await makeStorage([customer(1), customer(2)])
		const sock = makeSock()
		const manager = makeManager(sock, storage, { maxPerMinute: 3 })

		const result = await drive(() => manager.send({}, msgFor('bulk')))

		expect(result.status).toBe('completed')
		expect(result.sentCount).toBe(2)
		expect(sock.sent).toEqual([customer(1), customer(2)])
	})

	it('accumulates budget across separate calls on the same instance', async () => {
		const storage = await makeStorage([customer(1), customer(2), customer(3)])
		const sock = makeSock()
		const manager = makeManager(sock, storage, { maxPerMinute: 2 })

		// dua pemanggilan terpisah mengisi budget sampai penuh
		await drive(() => manager.send(only(customer(1)), msgFor(customer(1))))
		await drive(() => manager.send(only(customer(2)), msgFor(customer(2))))
		expect(sock.sent).toEqual([customer(1), customer(2)])

		// panggilan ketiga pada offset yang sama akan ditahan karena budget
		// penuh; jalankan jam melewati jendela agar slot lama terprune dan
		// panggilan ketiga boleh lewat
		const result = await driveAt(MINUTE + 1, () =>
			manager.send(only(customer(3)), msgFor(customer(3)))
		)

		expect(result.sentCount).toBe(1)
		expect(sock.sent).toEqual([customer(1), customer(2), customer(3)])
	})

	it('does not skip or abort when the limit is reached mid-campaign', async () => {
		const storage = await makeStorage([customer(1), customer(2), customer(3)])
		const sock = makeSock()
		// Batas 2 tapi ada 3 penerima. Limiter menahan (bukan melewati),
		// jadi seluruh penerima tetap diproses.
		const manager = makeManager(sock, storage, { maxPerMinute: 2 })

		const result = await driveAt(MINUTE + 1, () => manager.send({}, msgFor('bulk')))

		expect(result.status).toBe('completed')
		expect(result.sentCount).toBe(3)
		expect(sock.sent).toEqual([customer(1), customer(2), customer(3)])
	})

	it('prunes timestamps older than the rolling 60 second window', async () => {
		const storage = await makeStorage([customer(1), customer(2)])
		const sock = makeSock()
		const manager = makeManager(sock, storage, { maxPerMinute: 1 })

		await drive(() => manager.send(only(customer(1)), msgFor(customer(1))))
		expect(sock.sent).toHaveLength(1)

		// 60 detik + 1 ms: slot pertama keluar dari rolling window
		const result = await driveAt(MINUTE + 1, () =>
			manager.send(only(customer(2)), msgFor(customer(2)))
		)

		expect(result.sentCount).toBe(1)
		expect(sock.sent).toEqual([customer(1), customer(2)])
	})

	it('treats a timestamp exactly 60 seconds old as expired', async () => {
		const storage = await makeStorage([customer(1), customer(2)])
		const sock = makeSock()
		const manager = makeManager(sock, storage, { maxPerMinute: 1 })

		await drive(() => manager.send(only(customer(1)), msgFor(customer(1))))

		// tepat 60 detik. Operator existing adalah now - t < 60_000, jadi
		// timestamp tepat di batas dianggap expired dan slot langsung bebas.
		const result = await driveAt(MINUTE, () =>
			manager.send(only(customer(2)), msgFor(customer(2)))
		)

		expect(result.sentCount).toBe(1)
		expect(sock.sent).toEqual([customer(1), customer(2)])
	})

	it('keeps the timestamp store bounded across many sends', async () => {
		const jids = Array.from({ length: 8 }, (_, i) => customer(i + 1))
		const storage = await makeStorage(jids)
		const sock = makeSock()
		const manager = makeManager(sock, storage, { maxPerMinute: 2 })

		// enam kiriman, masing-masing digeser lebih dari satu menit sehingga
		// slot sebelumnya selalu terprune dan tidak ada yang perlu menunggu
		for (let i = 0; i < 6; i++) {
			await driveAt((i + 1) * (MINUTE + 1), () =>
				manager.send(only(jids[i]!), msgFor(jids[i]!))
			)
		}
		expect(sock.sent).toHaveLength(6)

		// Kalau store tidak terprune, enam timestamp lama masih menggantung dan
		// dua kiriman berikut akan tertahan. Keduanya harus langsung lolos.
		// Yang diperiksa adalah sock.sent, bukan sentCount: saat dua send()
		// berjalan paralen keduanya berbagi tracker, jadi sentCount saling
		// menghitung record dan tidak bisa dipakai sebagai bukti.
		await driveAt(7 * (MINUTE + 1), async () => {
			const a = manager.send(only(jids[6]!), msgFor(jids[6]!))
			const b = manager.send(only(jids[7]!), msgFor(jids[7]!))
			await Promise.all([a, b])
		})

		expect(sock.sent).toEqual(jids)
	})

	it('gives each manager instance its own per-minute budget', async () => {
		const jids = [customer(1), customer(2)]
		const storageA = await makeStorage(jids)
		const storageB = await makeStorage(jids)
		const sockA = makeSock()
		const sockB = makeSock()
		const managerA = makeManager(sockA, storageA, { maxPerMinute: 1 })
		const managerB = makeManager(sockB, storageB, { maxPerMinute: 1 })

		await drive(() => managerA.send(only(customer(1)), msgFor(customer(1))))

		// manager B tidak mewarisi budget manager A: slotnya sendiri masih kosong
		const resultB = await drive(() => managerB.send(only(customer(2)), msgFor(customer(2))))

		expect(sockA.sent).toEqual([customer(1)])
		expect(sockB.sent).toEqual([customer(2)])
		expect(resultB.sentCount).toBe(1)
	})

	it('does not consume a slot for a quarantined customer', async () => {
		const storage = await makeStorage([customer(1), customer(2)])
		const sock = makeSock({ fail: { [customer(1)]: 403 } })
		const manager = makeManager(sock, storage, { maxPerMinute: 1 })

		// percobaan pertama kena 403: dikarantina dan slot-nya dilepas
		const first = await drive(() => manager.send(only(customer(1)), msgFor(customer(1))))
		expect(first.quarantined).toEqual([customer(1)])

		// customer berikutnya harus tetap bisa jalan di window yang sama
		const second = await drive(() => manager.send(only(customer(2)), msgFor(customer(2))))

		expect(second.sentCount).toBe(1)
		expect(sock.sent).toEqual([customer(2)])
	})

	it('releases the slot when a send fails after a real attempt', async () => {
		const storage = await makeStorage([customer(1), customer(2)])
		// 500 bukan 403: attempt benar-benar terjadi lalu gagal, jadi menurut
		// behavior existing tetap tidak mengklaim budget per menit.
		const sock = makeSock({ fail: { [customer(1)]: 500 } })
		const manager = makeManager(sock, storage, { maxPerMinute: 1, maxRetries: 0 })

		const first = await drive(() => manager.send(only(customer(1)), msgFor(customer(1))))
		expect(first.sentCount).toBe(0)
		expect(first.failedCount).toBe(1)

		const second = await drive(() => manager.send(only(customer(2)), msgFor(customer(2))))

		expect(second.sentCount).toBe(1)
		expect(sock.sent).toEqual([customer(2)])
	})

	it('does not consume a slot for a dry run', async () => {
		const storage = await makeStorage([customer(1), customer(2)])
		const sock = makeSock()
		const manager = makeManager(sock, storage, { maxPerMinute: 1 })

		const dry = await drive(() =>
			manager.send(only(customer(1)), msgFor(customer(1)), { dryRun: true })
		)
		expect(dry.sentCount).toBe(1)
		expect(sock.sent).toHaveLength(0)

		// slot dry run dikembalikan, jadi kiriman nyata langsung lolos
		const real1 = await drive(() => manager.send(only(customer(2)), msgFor(customer(2))))

		expect(real1.sentCount).toBe(1)
		expect(sock.sent).toEqual([customer(2)])
	})

	it('does not let two parallel sends breach maxPerMinute', async () => {
		const storage = await makeStorage([customer(1), customer(2)])
		// send pertama ditahan di dalam sendMessage sehingga masih in-flight
		const sock = makeSock({ hold: new Set([customer(1)]) })
		const manager = makeManager(sock, storage, { maxPerMinute: 1 })

		const first = manager.send(only(customer(1)), msgFor(customer(1)))
		// jalankan sampai send pertama benar-benar berhenti di sendMessage
		await jest.advanceTimersByTimeAsync(0)
		expect(sock.sent).toHaveLength(0)

		// geser clock hampir keluar jendela lalu jalankan send kedua. Kalau slot
		// dipegang sejak klaim (bukan direkam setelah selesai), send kedua
		// akan ditahan sampai jendela bergeser.
		setClock(MINUTE - 500)
		const second = manager.send(only(customer(2)), msgFor(customer(2)))
		await jest.advanceTimersByTimeAsync(0)
		expect(sock.sent).toHaveLength(0)

// lepas blokir dan buka jendela agar slot pertama gugur, lalu biarkan
		// send kedua menyelesaikan klaimnya
		sock.releaseHeld()
		setClock(MINUTE + 1)
		await jest.advanceTimersByTimeAsync(MINUTE)
		await Promise.all([first, second])

		// tepat dua pesan terkirim: tidak ada attempt kedua yang menembus
		// batas sebelum slot pertama benar-benar dilepas
		expect(sock.sent).toEqual([customer(1), customer(2)])
	})
})