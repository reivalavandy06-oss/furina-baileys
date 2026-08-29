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

export class CRMHealthMonitor {
	private score = 0
	private events: RiskEvent[] = []
	private paused = false
	// Flag khusus 401: stop permanen, cuma operator yang boleh putusin
	private permanentStop = false
	// Window buat identical-message guard
	private contentWindow: { content: string; count: number; firstAt: number }[] = []
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
		this.events.push({ points, reason, timestamp: Date.now() })

		// AUTO-PAUSE: kalau level udah high/critical, stop kirim dulu
		const level = this.getLevel()
		if (level === 'high' || level === 'critical') {
			this.paused = true
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
				this.addRisk(
					25,
					`identical-message guard: ${entry.count} pesan identik dalam 1 jam`
				)
				return true
			}
		} else {
			this.contentWindow.push({ content: normalized, count: 1, firstAt: now })
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
			this.events.push({
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
