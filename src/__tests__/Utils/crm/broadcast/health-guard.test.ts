import { jest } from '@jest/globals'
import { CRMHealthMonitor } from '../../../../Utils/crm/broadcast/health'

// C-10c: latch per contentWindow. Tanpa latch, setiap pesan identik yang
// melewati ambang menambah risk lagi, jadi risk terakumulasi jauh melampaui
// yang dimaksud guard.
//
// Pruning events[]: array event harus tetap bounded supaya tidak tumbuh
// tanpa batas pada bot yang uptime-nya panjang.

const MAX_IDENTICAL = 4
const RISK_PER_GUARD = 25
const WINDOW_MS = 60 * 60 * 1000

let health: CRMHealthMonitor

const eventsOf = (m: CRMHealthMonitor): unknown[] =>
	(m as unknown as { events: unknown[] }).events

const windowOf = (m: CRMHealthMonitor): { latched: boolean }[] =>
	(m as unknown as { contentWindow: { latched: boolean }[] }).contentWindow

const fresh = (options?: { maxIdentical?: number; identicalWindowMinutes?: number }) =>
	new CRMHealthMonitor({ maxIdentical: MAX_IDENTICAL, ...options })

beforeEach(() => {
	jest.useFakeTimers()
	jest.setSystemTime(new Date('2026-08-01T00:00:00.000Z'))
	health = fresh()
})

afterEach(() => {
	jest.useRealTimers()
})

describe('C-10c: latch per contentWindow', () => {
	it('guard menyala pada pesan identik ke-4', () => {
		for (let i = 1; i < MAX_IDENTICAL; i++) {
			expect(health.reportContent('halo')).toBe(false)
		}

		expect(health.reportContent('halo')).toBe(true)
		expect(health.getScore()).toBe(RISK_PER_GUARD)
	})

	it('tidak menambah risk lagi untuk window yang sama', () => {
		for (let i = 0; i < MAX_IDENTICAL; i++) {
			health.reportContent('halo')
		}
		const afterTrigger = health.getScore()
		expect(afterTrigger).toBe(RISK_PER_GUARD)

		// sepuluh pesan identik berikutnya untuk window yang sama
		for (let i = 0; i < 10; i++) {
			expect(health.reportContent('halo')).toBe(true)
		}

		// risk tidak boleh naik lagi
		expect(health.getScore()).toBe(afterTrigger)
	})

	it('latch menempel ke entry window itu, bukan global', () => {
		for (let i = 0; i < MAX_IDENTICAL; i++) {
			health.reportContent('halo')
		}
		for (let i = 0; i < 10; i++) {
			health.reportContent('halo')
		}

		const entries = windowOf(health)
		expect(entries).toHaveLength(1)
		expect(entries[0]?.latched).toBe(true)
	})

	it('window konten berbeda punya latch sendiri', () => {
		for (let i = 0; i < MAX_IDENTICAL; i++) {
			health.reportContent('halo')
		}
		const afterFirst = health.getScore()
		expect(afterFirst).toBe(RISK_PER_GUARD)

		// konten lain harus bisa memicu guard-nya sendiri
		for (let i = 0; i < MAX_IDENTICAL; i++) {
			health.reportContent('halo dunia')
		}

		expect(health.getScore()).toBe(afterFirst + RISK_PER_GUARD)
		const entries = windowOf(health)
		expect(entries).toHaveLength(2)
		expect(entries.every(e => e.latched)).toBe(true)
	})

	it('guard aktif lagi untuk window baru setelah jendela lama kedaluwarsa', () => {
		for (let i = 0; i < MAX_IDENTICAL; i++) {
			health.reportContent('halo')
		}
		const afterFirst = health.getScore()
		expect(afterFirst).toBe(RISK_PER_GUARD)

		// jendela bergeser: entry lama ter-filter beserta latch-nya
		jest.setSystemTime(new Date(Date.now() + WINDOW_MS + 1))

		for (let i = 0; i < MAX_IDENTICAL; i++) {
			health.reportContent('halo')
		}

		// latch tidak membuat guard mati permanen
		expect(health.getScore()).toBe(afterFirst + RISK_PER_GUARD)
		expect(windowOf(health)).toHaveLength(1)
		expect(windowOf(health)[0]?.latched).toBe(true)
	})

	it('pengiriman berhasil menurunkan risk seperti sebelumnya', () => {
		for (let i = 0; i < MAX_IDENTICAL; i++) {
			health.reportContent('halo')
		}
		expect(health.getScore()).toBe(RISK_PER_GUARD)

		health.reportDeliverySuccess()

		expect(health.getScore()).toBe(RISK_PER_GUARD - 1)
	})
})

describe('pruning events[]', () => {
	it('array event tetap bounded setelah banyak penambahan', () => {
		for (let i = 0; i < 500; i++) {
			health.reportDeliveryFailure()
		}

		expect(eventsOf(health).length).toBeLessThanOrEqual(200)
	})

	it('entri terlama dibuang dan yang terbaru bertahan (FIFO)', () => {
		for (let i = 0; i < 300; i++) {
			health.addRisk(1, `event-${i}`)
		}

		const events = eventsOf(health) as { reason: string }[]
		expect(events).toHaveLength(200)
		// 300 event dengan 200 disimpan berarti 100 terlama dibuang
		expect(events[0]?.reason).toBe('event-100')
		expect(events[199]?.reason).toBe('event-299')
	})

	it('event 401 juga ikut ter-bound', () => {
		health.addRisk(1, 'sebelum-401')

		health.reportDisconnect(401)

		const events = eventsOf(health) as { reason: string }[]
		expect(events.some(e => e.reason.includes('disconnect 401'))).toBe(true)
		expect(events.length).toBeLessThanOrEqual(200)
	})

	it('getReport tetap hanya menampilkan 10 terakhir', () => {
		for (let i = 0; i < 250; i++) {
			health.addRisk(1, `event-${i}`)
		}

		const report = health.getReport()
		expect(report.recentEvents).toHaveLength(10)
		expect(report.recentEvents[9]?.reason).toBe('event-249')
	})
})

describe('dispose() membersihkan state', () => {
	it('membersihkan events dan window identik beserta latch', () => {
		for (let i = 0; i < MAX_IDENTICAL; i++) {
			health.reportContent('halo')
		}
		for (let i = 0; i < 300; i++) {
			health.addRisk(1, `event-${i}`)
		}

		health.dispose()

		expect(eventsOf(health)).toHaveLength(0)
		expect(windowOf(health)).toHaveLength(0)
		expect(health.getScore()).toBe(0)
		expect(health.isPermanentStop()).toBe(false)
		expect(health.shouldPause()).toBe(false)
	})

	it('dispose() aman dipanggil dua kali', () => {
		health.reportContent('halo')

		health.dispose()

		expect(() => health.dispose()).not.toThrow()
		expect(eventsOf(health)).toHaveLength(0)
	})

	it('monitor bisa dipakai lagi setelah dispose', () => {
		health.reportContent('halo')
		health.dispose()

		// latch lama sudah hilang, jadi guard bisa memicu lagi
		for (let i = 0; i < MAX_IDENTICAL; i++) {
			health.reportContent('halo')
		}

		expect(health.getScore()).toBe(RISK_PER_GUARD)
		expect(windowOf(health)[0]?.latched).toBe(true)
	})
})

describe('perilaku lain tidak berubah', () => {
	it('disconnect 401 tetap permanent stop', () => {
		health.reportDisconnect(401)

		expect(health.isPermanentStop()).toBe(true)
		expect(health.shouldPause()).toBe(true)
		expect(health.getScore()).toBe(100)
		expect(health.resume()).toBe(false)
	})

	it('disconnect temporary menambah risk 15 dan bisa di-resume', () => {
		health.reportDisconnect(503)

		expect(health.getScore()).toBe(15)
		health.addRisk(60, 'naik untuk pause')
		expect(health.shouldPause()).toBe(true)
		expect(health.resume()).toBe(true)
		expect(health.shouldPause()).toBe(false)
	})

	it('risk dibatasi 100 dan tidak turun di bawah nol', () => {
		health.addRisk(500, 'banyak')
		expect(health.getScore()).toBe(100)

		health.reduceRisk(1000)
		expect(health.getScore()).toBe(0)
	})

	it('ambang maxIdentical khusus tetap dihormati', () => {
		const custom = fresh({ maxIdentical: 2 })

		expect(custom.reportContent('halo')).toBe(false)
		expect(custom.reportContent('halo')).toBe(true)
		expect(custom.getScore()).toBe(RISK_PER_GUARD)
	})

	it('level risk naik sesuai ambang', () => {
		expect(health.getLevel()).toBe('low')
		health.addRisk(45, 'naik medium')
		expect(health.getLevel()).toBe('medium')
		health.addRisk(30, 'naik high')
		expect(health.getLevel()).toBe('high')
		health.addRisk(25, 'naik critical')
		expect(health.getLevel()).toBe('critical')
	})
})