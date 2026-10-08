// connection.ts
// Handler for connection-related errors (disconnect, reconnect, network)
// Uses exponential backoff with jitter for stealth mode

import type { FurinaLogger } from './logger'
import type { StabilityConfig, DisconnectInfo } from './types'

// Known disconnect codes from Baileys.
// Codes that mean "don't bother retrying" are marked isRecoverable: false —
// blindly reconnecting a banned account escalates a soft ban into a hard ban.
const DISCONNECT_CODES: Record<number, DisconnectInfo> = {
	401: { statusCode: 401, message: 'Logged out', isRecoverable: false, requiresReauth: true },
	403: { statusCode: 403, message: 'Forbidden — account banned or restricted', isRecoverable: false, requiresReauth: true },
	408: { statusCode: 408, message: 'Connection timeout', isRecoverable: true, requiresReauth: false },
	411: { statusCode: 411, message: 'Multi-device mismatch — re-pair required', isRecoverable: false, requiresReauth: true },
	428: { statusCode: 428, message: 'Connection closed by server', isRecoverable: true, requiresReauth: false },
	440: { statusCode: 440, message: 'Connection replaced by another login', isRecoverable: false, requiresReauth: true },
	500: { statusCode: 500, message: 'Bad session', isRecoverable: false, requiresReauth: true },
	503: { statusCode: 503, message: 'Server busy, try again later', isRecoverable: true, requiresReauth: false },
	515: { statusCode: 515, message: 'Restart required', isRecoverable: true, requiresReauth: false },
}

export class ConnectionHandler {
	private logger: FurinaLogger
	private config: StabilityConfig
	private reconnectAttempts: number = 0
	private consecutiveErrors: number = 0
	private isPaused: boolean = false
	private pausedUntil: number = 0

	constructor(logger: FurinaLogger, config: StabilityConfig) {
		this.logger = logger
		this.config = config
	}

	getDisconnectInfo(statusCode: number | null): DisconnectInfo {
		if (statusCode === null) {
			return {
				statusCode: null,
				message: 'Unknown disconnect (network issue?)',
				isRecoverable: true,
				requiresReauth: false,
			}
		}

		const known = DISCONNECT_CODES[statusCode]
		// copy, don't hand out the shared table entry by reference — a caller
		// mutating it would silently reclassify disconnects process-wide.
		if (known) return { ...known }

		// Fail closed: an unrecognised code is not evidence that retrying helps.
		return {
			statusCode,
			message: `Unknown error code ${statusCode}`,
			isRecoverable: false,
			requiresReauth: false,
		}
	}

	canReconnect(): boolean {
		// Check if currently paused
		if (this.isPaused) {
			if (Date.now() < this.pausedUntil) {
				this.logger.debug(`Reconnect paused until ${new Date(this.pausedUntil).toISOString()}`)
				return false
			}
			// Pause expired, reset
			this.isPaused = false
			this.consecutiveErrors = 0
			this.reconnectAttempts = 0
			this.logger.info('Pause expired, resuming reconnect attempts')
		}

		const maxRetries = this.config.maxRetries ?? 5
		// recordError() sudah menaikkan reconnectAttempts, jadi attempt yang
		// sedang dievaluasi adalah nilai itu sendiri: dengan maxRetries 5,
		// attempt 1..5 diizinkan (sebelumnya 5<5 membuat attempt ke-5
		// ditolak, jadi maxRetries 5 hanya memberi 4 reconnect).
		return this.reconnectAttempts <= maxRetries
	}

	getReconnectDelay(): number {
		const base = this.config.baseReconnectDelay ?? 3000
		const max = this.config.maxReconnectDelay ?? 30000
		const jitter = this.config.jitter ?? 500
		const stealthMode = this.config.stealthMode !== false

		// Exponential backoff: base * 2^(attempts-1). recordError() menaikkan
		// counter sebelum handler ini dipanggil, jadi attempt pertama harus
		// memakai exponent 0 agar delay-nya benar-benar baseReconnectDelay
		// (sebelumnya selalu mulai dari base*2).
		const exponent = Math.max(0, this.reconnectAttempts - 1)
		const exponential = base * Math.pow(2, exponent)
		const capped = Math.min(exponential, max)

		// Add jitter for stealth mode (random ±jitter ms)
		// This makes reconnect timing look human-like
		const jitterAmount = stealthMode ? (Math.random() * 2 - 1) * jitter : 0

		// Minimum 1 second delay, tapi JANGAN lebih besar dari maxReconnectDelay
		// dan jangan mengabaikan base yang dikonfigurasi (< 1s).
		const floor = Math.min(1000, base)
		const withJitter = capped + jitterAmount
		return Math.max(floor, Math.min(max, Math.floor(withJitter)))
	}

	recordError(): void {
		this.reconnectAttempts++
		this.consecutiveErrors++

		const autoPauseAfter = this.config.autoPauseAfter ?? 3
		const autoPauseDuration = this.config.autoPauseDuration ?? 10 * 60 * 1000 // 10 minutes

		if (this.consecutiveErrors >= autoPauseAfter) {
			this.isPaused = true
			this.pausedUntil = Date.now() + autoPauseDuration
			this.logger.warn(
				`Auto-pausing reconnect for ${Math.floor(autoPauseDuration / 1000)}s ` +
				`after ${autoPauseAfter} consecutive errors (stealth mode: avoiding detection)`
			)
		}
	}

	recordSuccess(): void {
		if (this.reconnectAttempts > 0 || this.consecutiveErrors > 0) {
			this.logger.info('Connection stabilized, resetting reconnect counters')
		}
		this.reconnectAttempts = 0
		this.consecutiveErrors = 0
		this.isPaused = false
	}

	getStats(): { reconnectAttempts: number; isPaused: boolean; pausedUntil: number | null } {
		// isPaused harus dihitung saat READ, bukan hanya dibersihkan sebagai
		// side effect dari canReconnect(). Kalau autoRecovery dimatikan atau
		// disconnect-nya non-recoverable, canReconnect() tidak pernah dipanggil
		// sehingga flag melekat true selamanya — padahal pause-nya sudah habis.
		// Akibatnya stats.isPaused=true dengan pausedUntil basi, dan consumer
		// yang menghitung pausedUntil - Date.now() mendapat nilai negatif.
		const stillPaused = this.isPaused && Date.now() < this.pausedUntil
		if (this.isPaused && !stillPaused) {
			this.isPaused = false
			this.pausedUntil = 0
		}

		return {
			reconnectAttempts: this.reconnectAttempts,
			isPaused: stillPaused,
			pausedUntil: stillPaused ? this.pausedUntil : null,
		}
	}
}
