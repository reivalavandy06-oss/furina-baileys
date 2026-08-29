// connection.ts
// Handler for connection-related errors (disconnect, reconnect, network)
// Uses exponential backoff with jitter for stealth mode

import type { FurinaLogger } from './logger'
import type { StabilityConfig, DisconnectInfo } from './types'

// Known disconnect codes from Baileys
const DISCONNECT_CODES: Record<number, DisconnectInfo> = {
	401: { statusCode: 401, message: 'Logged out', isRecoverable: false, requiresReauth: true },
	408: { statusCode: 408, message: 'Connection timeout', isRecoverable: true, requiresReauth: false },
	428: { statusCode: 428, message: 'Rate limited, slow down', isRecoverable: true, requiresReauth: false },
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
		if (known) return known

		return {
			statusCode,
			message: `Unknown error code ${statusCode}`,
			isRecoverable: true,
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
		return this.reconnectAttempts < maxRetries
	}

	getReconnectDelay(): number {
		const base = this.config.baseReconnectDelay ?? 3000
		const max = this.config.maxReconnectDelay ?? 30000
		const jitter = this.config.jitter ?? 500
		const stealthMode = this.config.stealthMode !== false

		// Exponential backoff: base * 2^attempts
		const exponential = base * Math.pow(2, this.reconnectAttempts)
		const capped = Math.min(exponential, max)

		// Add jitter for stealth mode (random ±jitter ms)
		// This makes reconnect timing look human-like
		const jitterAmount = stealthMode ? (Math.random() * 2 - 1) * jitter : 0

		// Minimum 1 second delay
		return Math.max(1000, Math.floor(capped + jitterAmount))
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
		return {
			reconnectAttempts: this.reconnectAttempts,
			isPaused: this.isPaused,
			pausedUntil: this.isPaused ? this.pausedUntil : null,
		}
	}
}
