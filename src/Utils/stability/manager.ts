// manager.ts
// Main StabilityManager class that orchestrates all handlers
// This is the heart of the stability module

import { FurinaLogger } from './logger'
import { ConnectionHandler } from './connection'
import { AuthHandler } from './auth'
import { MessageHandler } from './message'
import { SessionHandler } from './session'
import { CryptoHandler } from './crypto'
import { ProtocolHandler } from './protocol'
import type { StabilityConfig, StabilityStats, FurinaErrorCategory } from './types'

const DEFAULT_CONFIG: Required<Omit<StabilityConfig, 'onLog'>> = {
	autoRecovery: true,
	maxRetries: 5,
	baseReconnectDelay: 3000,
	maxReconnectDelay: 30000,
	jitter: 500,
	autoPauseAfter: 3,
	autoPauseDuration: 10 * 60 * 1000, // 10 minutes
	logLevel: 'warn',
	stealthMode: true,
}

export class StabilityManager {
	private sock: any
	private config: Required<Omit<StabilityConfig, 'onLog'>> & { onLog?: StabilityConfig['onLog'] }
	private logger: FurinaLogger

	private connectionHandler: ConnectionHandler
	private authHandler: AuthHandler
	private messageHandler: MessageHandler
	private sessionHandler: SessionHandler
	private cryptoHandler: CryptoHandler
	private protocolHandler: ProtocolHandler

	private stats: StabilityStats

	constructor(sock: any, config: StabilityConfig = {}) {
		this.sock = sock

		// Merge user config with defaults
		this.config = {
			...DEFAULT_CONFIG,
			...config,
		}

		this.logger = new FurinaLogger(this.config.logLevel, this.config.onLog)

		this.connectionHandler = new ConnectionHandler(this.logger, this.config)
		this.authHandler = new AuthHandler(this.logger)
		this.messageHandler = new MessageHandler(this.logger)
		this.sessionHandler = new SessionHandler(this.logger)
		this.cryptoHandler = new CryptoHandler(this.logger)
		this.protocolHandler = new ProtocolHandler(this.logger)

		this.stats = {
			totalErrors: 0,
			errorsByCategory: {
				connection: 0,
				session: 0,
				crypto: 0,
				message: 0,
				protocol: 0,
				auth: 0,
				unknown: 0,
			},
			reconnectAttempts: 0,
			lastReconnect: null,
			isPaused: false,
			pausedUntil: null,
		}

		this.attachListeners()
		this.logger.info('StabilityManager initialized with stealth mode ' + (this.config.stealthMode ? 'ON' : 'OFF'))
	}

	private attachListeners(): void {
		// Listen for connection updates (disconnect, reconnect, etc)
		this.sock.ev.on('connection.update', (update: any) => {
			this.handleConnectionUpdate(update)
		})

		// Listen for incoming messages (duplicate detection)
		this.sock.ev.on('messages.upsert', ({ messages }: any) => {
			this.handleMessagesUpsert(messages)
		})

		this.logger.debug('Event listeners attached to socket')
	}

	private handleConnectionUpdate(update: any): void {
		const { connection, lastDisconnect } = update

		if (connection === 'close') {
			const statusCode = lastDisconnect?.error?.output?.statusCode ?? null
			const disconnectInfo = this.connectionHandler.getDisconnectInfo(statusCode)

			this.stats.totalErrors++
			this.stats.errorsByCategory.connection++

			this.logger.warn(`Connection closed: ${disconnectInfo.message} (code: ${statusCode ?? 'unknown'})`)

			// Handle auth errors specially (401 = logged out)
			if (this.authHandler.isAuthError(statusCode)) {
				this.stats.errorsByCategory.auth++
				this.authHandler.handleAuthError()
				// Don't attempt reconnect for auth errors
				return
			}

			// Record error for reconnect tracking
			this.connectionHandler.recordError()

			// Attempt reconnect if recoverable and auto-recovery is enabled
			if (disconnectInfo.isRecoverable && this.config.autoRecovery) {
				if (this.connectionHandler.canReconnect()) {
					const delay = this.connectionHandler.getReconnectDelay()
					this.stats.lastReconnect = Date.now()
					this.stats.reconnectAttempts++

					const connectionStats = this.connectionHandler.getStats()
					this.stats.isPaused = connectionStats.isPaused
					this.stats.pausedUntil = connectionStats.pausedUntil

					this.logger.info(
						`Will reconnect in ${(delay / 1000).toFixed(1)}s ` +
						`(attempt ${this.stats.reconnectAttempts}/${this.config.maxRetries})`
					)
				} else {
					this.logger.warn('Max reconnect attempts reached or paused. Waiting...')
					const connectionStats = this.connectionHandler.getStats()
					this.stats.isPaused = connectionStats.isPaused
					this.stats.pausedUntil = connectionStats.pausedUntil
				}
			}
		}

		if (connection === 'open') {
			this.logger.info('Connection opened successfully')
			this.connectionHandler.recordSuccess()
			this.stats.isPaused = false
			this.stats.pausedUntil = null
			this.stats.reconnectAttempts = 0
		}
	}

	private handleMessagesUpsert(messages: any[]): void {
		if (!Array.isArray(messages)) return

		for (const msg of messages) {
			const messageId = msg?.key?.id
			if (!messageId) continue

			// Check for duplicate messages
			if (this.messageHandler.isDuplicate(messageId)) {
				this.stats.errorsByCategory.message++
			}
		}
	}

	// ===== Public API: Expose handlers for manual use =====

	getSessionHandler(): SessionHandler {
		return this.sessionHandler
	}

	getCryptoHandler(): CryptoHandler {
		return this.cryptoHandler
	}

	getProtocolHandler(): ProtocolHandler {
		return this.protocolHandler
	}

	getMessageHandler(): MessageHandler {
		return this.messageHandler
	}

	// Get current stability statistics
	getStats(): StabilityStats {
		const connectionStats = this.connectionHandler.getStats()
		return {
			...this.stats,
			reconnectAttempts: connectionStats.reconnectAttempts,
			isPaused: connectionStats.isPaused,
			pausedUntil: connectionStats.pausedUntil,
		}
	}

	// Change log level at runtime
	setLogLevel(level: StabilityConfig['logLevel']): void {
		if (level) {
			this.logger.setLevel(level)
		}
	}

	// Manual reset of reconnect counters (use when you know connection is stable)
	resetReconnectCounters(): void {
		this.connectionHandler.recordSuccess()
		this.logger.info('Reconnect counters manually reset')
	}
}
