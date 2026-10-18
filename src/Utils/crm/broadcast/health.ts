// health.ts
// Risk monitor + auto-pause buat broadcast (kill-switch anti-ban)
// Research: pola paling konsisten di semua source = kill-switch berbasis
// delivery rate + disconnect classification.
//
// Disconnect classification (dari riset):
//   401 (loggedOut) = BAN/logout permanen → JANGAN reconnect, stop total
//   408/428/503/515 = temporary → reconnect dengan backoff, tambah risk
//
// Identical-message guard (issue #2131):
//   3-5 pesan identik dalam 1 jam = flag spam → tambah risk besar

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface RiskEvent {
	points: number
	reason: string
	timestamp: number
}

// Threshold level risk (0-100)
const LEVEL_MEDIUM = 40
const LEVEL_HIGH = 70
const LEVEL_CRITICAL = 90

// Batas event yang disimpan. getReport() hanya menampilkan 10 terakhir, jadi
// menyimpan jauh lebih dari itu hanya menambah konsumsi memori tanpa
// menambah informasi. Buang yang terlama (FIFO).
const MAX_RISK_EVENTS = 200

export class CRMHealthMonitor {
	private score = 0
	private events: RiskEvent[] = []
	private paused = false
	// Flag khusus 401: stop permanen, cuma operator yang boleh putusin
	private permanentStop = false
	// Window buat identical-message guard.
	// latched: guard sudah pernah menambah risk untuk window ini, jadi pesan
	// identik berikutnya tidak boleh menambah risk lagi.
	private contentWindow: {
		content: string
		count: number
		firstAt: number
		latched: boolean
	}[] = []
	private maxIdentical: number
	private identicalWindowMs: number

	constructor(options?: { maxIdentical?: number; identicalWindowMinutes?: number }) {
		// Default: 4 pesan identik dalam 60 menit = trigger guard
		this.maxIdentical = options?.maxIdentical ?? 4
		this.identicalWindowMs = (options?.identicalWindowMinutes ?? 60) * 60 * 1000
	}

	// ═══════════════════════════════════════════════════════════════
	// RISK SCORE - tambah/kurang + auto-pause
	// ═══════════════════════════════════════════════════════════════

	addRisk(points: number, reason: string): void {
		this.score = Math.min(100, this.score + points)
		this.pushEvent({ points, reason, timestamp: Date.now() })

		// AUTO-PAUSE: kalau level udah high/critical, stop kirim dulu
		const level = this.getLevel()
		if (level === 'high' || level === 'critical') {
			this.paused = true
		}
	}

	// Semua penulisan event lewat sini supaya batasnya applies konsisten,
	// termasuk event 401 yang sebelumnya ditulis langsung ke array.
	private pushEvent(event: RiskEvent): void {
		this.events.push(event)
		if (this.events.length > MAX_RISK_EVENTS) {
			this.events.splice(0, this.events.length - MAX_RISK_EVENTS)
		}
	}

	// Turunin risk (misal setelah periode tenang / delivery lancar)
	reduceRisk(points: number): void {
		this.score = Math.max(0, this.score - points)
	}

	getScore(): number {
		return this.score
	}

	getLevel(): RiskLevel {
		if (this.score >= LEVEL_CRITICAL) return 'critical'
		if (this.score >= LEVEL_HIGH) return 'high'
		if (this.score >= LEVEL_MEDIUM) return 'medium'
		return 'low'
	}

	// ═══════════════════════════════════════════════════════════════
	// PAUSE CONTROL
	// ═══════════════════════════════════════════════════════════════

	shouldPause(): boolean {
		return this.paused || this.permanentStop
	}

	isPermanentStop(): boolean {
		return this.permanentStop
	}

	// Resume manual — TAPI nggak bisa kalau permanentStop (401)
	// Itu keputusan operator, bukan kode
	resume(): boolean {
		if (this.permanentStop) return false
		this.paused = false
		return true
	}

	// ═══════════════════════════════════════════════════════════════
	// IDENTICAL-MESSAGE GUARD (anti konten seragam)
	// Balikin true kalau guard ke-trigger
	// ═══════════════════════════════════════════════════════════════

	reportContent(content: string): boolean {
		const normalized = content.toLowerCase().trim()
		const now = Date.now()

		// Bersihin entries yang udah lewat window
		this.contentWindow = this.contentWindow.filter(
			(entry) => now - entry.firstAt < this.identicalWindowMs
		)

		const entry = this.contentWindow.find((e) => e.content === normalized)

		if (entry) {
			entry.count++

			// Trigger guard kalau udah kebanyakan pesan identik
			if (entry.count >= this.maxIdentical) {
				// Latch per window: satu window hanya menambah risk sekali.
				// Tanpa latch, setiap pesan identik berikutnya menambah 25 poin
				// lagi, jadi risk terakumulasi jauh melampaui yang dimaksud.
				// Latch menempel ke entry window ini; kalau jendela berikutnya
				// ter-filter, entry ikut hilang dan window baru otomatis ter-arm
				// lagi, jadi guard tidak mati permanen.
				if (!entry.latched) {
					entry.latched = true
					this.addRisk(
						25,
						`identical-message guard: ${entry.count} pesan identik dalam 1 jam`
					)
				}
				return true
			}
		} else {
			this.contentWindow.push({ content: normalized, count: 1, firstAt: now, latched: false })
		}

		return false
	}

	// ═══════════════════════════════════════════════════════════════
	// EVENT REPORTERS
	// ═══════════════════════════════════════════════════════════════

	// Delivery gagal = naikkin risk dikit
	reportDeliveryFailure(): void {
		this.addRisk(5, 'delivery failure')
	}

	// Delivery sukses = turunin risk dikit (reward)
	reportDeliverySuccess(): void {
		this.reduceRisk(1)
	}

	// Disconnect classification — ini penting banget
	reportDisconnect(statusCode: number): void {
		if (statusCode === 401) {
			// loggedOut / BAN: stop TOTAL, jangan reconnect otomatis
			this.permanentStop = true
			this.paused = true
			this.score = 100
			this.pushEvent({
				points: 100,
				reason: 'disconnect 401 (loggedOut/ban) — STOP permanen, alert operator',
				timestamp: Date.now(),
			})
		} else if (statusCode === 408 || statusCode === 428 || statusCode === 503 || statusCode === 515) {
			// Temporary: aman reconnect (StabilityManager yang urus)
			this.addRisk(15, `disconnect temporary (${statusCode})`)
		} else {
			this.addRisk(10, `disconnect (${statusCode})`)
		}
	}

	// ═══════════════════════════════════════════════════════════════
	// LIFECYCLE
	// ═══════════════════════════════════════════════════════════════

	// Buang seluruh state: events, window identik beserta latch-nya, dan flag
	// pause. Dipanggil saat monitor tidak dipakai lagi.
	dispose(): void {
		this.events = []
		this.contentWindow = []
		this.score = 0
		this.paused = false
		this.permanentStop = false
	}

	// ═══════════════════════════════════════════════════════════════
	// REPORT - snapshot kondisi health
	// ═══════════════════════════════════════════════════════════════

	getReport(): {
		score: number
		level: RiskLevel
		paused: boolean
		permanentStop: boolean
		recentEvents: RiskEvent[]
	} {
		return {
			score: this.score,
			level: this.getLevel(),
			paused: this.paused,
			permanentStop: this.permanentStop,
			recentEvents: this.events.slice(-10),
		}
	}
}
