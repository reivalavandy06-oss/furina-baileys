// furina-baileys — antiban/health.ts
// Track error/disconnect dan trigger cooldown saat kondisi jelek.
// In-memory default, tapi bisa di-export/import biar persist antar restart.

import type { AntibanProfile } from './profiles'
import { jitter } from './timing'

export interface HealthState {
	/** Timestamp error dalam window (ms epoch) */
	errorTimestamps: number[]
	/** Timestamp disconnect dalam window */
	disconnectTimestamps: number[]
	/** Counter backoff attempt, buat exponential backoff */
	attempts: number
	/** Timestamp saat pause berakhir (0 = nggak pause) */
	pausedUntil: number
	/** Timestamp terakhir kali pause expired — buat reset window */
	lastPauseExpiry: number
}

export interface HealthStats {
	totalErrors: number
	totalDisconnects: number
	totalPauses: number
	pauseCount: number
	uptimeMs: number
}

export class HealthMonitor {
	private errorTimestamps: number[] = []
	private disconnectTimestamps: number[] = []
	private attempts = 0
	private pausedUntil = 0
	private lastPauseExpiry = 0
	private startedAt = Date.now()

	// Stats — cuma kalau profile.statsEnabled
	private totalErrors = 0
	private totalDisconnects = 0
	private totalPauses = 0

	constructor(private profile: AntibanProfile) {}

	// ===== FURINA: RECORD =====

	recordError(statusCode?: number) {
		const now = Date.now()
		this.errorTimestamps.push(now)
		this.totalErrors++

		// 403/515 dianggap berat — tambah bobot dobel
		if (statusCode === 403 || statusCode === 515) {
			this.errorTimestamps.push(now)
			this.totalErrors++
		}

		// Buang yang di luar window (biar nggak numpuk di memory)
		this.pruneTimestamps()
	}

	recordDisconnect() {
		const now = Date.now()
		this.disconnectTimestamps.push(now)
		this.totalDisconnects++
		this.pruneTimestamps()
	}

	// Buang error/disconnect yang lebih tua dari errorWindowMs
	private pruneTimestamps() {
		const cutoff = Date.now() - this.profile.errorWindowMs
		this.errorTimestamps = this.errorTimestamps.filter((t) => t > cutoff)
		this.disconnectTimestamps = this.disconnectTimestamps.filter((t) => t > cutoff)
	}

	// ===== FURINA: PAUSE =====

	isPaused() {
		return Date.now() < this.pausedUntil
	}

	maybePause() {
		// Kalau pause expired, reset semua counter — fresh start setelah istirahat
		if (this.pausedUntil > 0 && Date.now() >= this.pausedUntil) {
			this.errorTimestamps = []
			this.disconnectTimestamps = []
			this.attempts = 0
			this.lastPauseExpiry = Date.now()
			this.pausedUntil = 0
		}

		// Kalau lagi pause, jangan trigger pause lagi
		if (this.isPaused()) return false

		this.pruneTimestamps()

		const errorCount = this.errorTimestamps.length
		const disconnectCount = this.disconnectTimestamps.length

		const shouldPause =
			errorCount >= this.profile.errorThreshold ||
			disconnectCount >= this.profile.disconnectThreshold

		if (shouldPause) {
			this.pausedUntil = Date.now() + this.profile.pauseMs
			this.totalPauses++
			return true
		}

		return false
	}

	// ===== FURINA: BACKOFF =====

	// Exponential: 3s → 6s → 12s ... capped, plus jitter
	nextBackoff() {
		this.attempts++
		const exp = Math.min(
			this.profile.backoffMax,
			this.profile.backoffBase * 2 ** (this.attempts - 1)
		)
		return exp + jitter(200, 1000)
	}

	resetBackoff() {
		this.attempts = 0
	}

	// ===== FURINA: STATE PERSISTENCE =====

	exportState(): HealthState {
		return {
			errorTimestamps: this.errorTimestamps,
			disconnectTimestamps: this.disconnectTimestamps,
			attempts: this.attempts,
			pausedUntil: this.pausedUntil,
			lastPauseExpiry: this.lastPauseExpiry,
		}
	}

	importState(s: Partial<HealthState>) {
		this.errorTimestamps = s.errorTimestamps ?? []
		this.disconnectTimestamps = s.disconnectTimestamps ?? []
		this.attempts = s.attempts ?? 0
		this.pausedUntil = s.pausedUntil ?? 0
		this.lastPauseExpiry = s.lastPauseExpiry ?? 0
	}

	// ===== FURINA: STATS (opsional) =====

	getStats(): HealthStats {
		return {
			totalErrors: this.totalErrors,
			totalDisconnects: this.totalDisconnects,
			totalPauses: this.totalPauses,
			pauseCount: this.totalPauses,
			uptimeMs: Date.now() - this.startedAt,
		}
	}

	// Buat unit test — reset semua internal state
	_resetForTest() {
		this.errorTimestamps = []
		this.disconnectTimestamps = []
		this.attempts = 0
		this.pausedUntil = 0
		this.lastPauseExpiry = 0
		this.startedAt = Date.now()
		this.totalErrors = 0
		this.totalDisconnects = 0
		this.totalPauses = 0
	}
}
