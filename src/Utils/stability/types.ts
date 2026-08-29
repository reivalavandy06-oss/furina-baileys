// types.ts
// Type definitions for Furina Stability module
// All types are prefixed to avoid collision with Baileys upstream

export type FurinaErrorCategory =
	| 'connection'
	| 'session'
	| 'crypto'
	| 'message'
	| 'protocol'
	| 'auth'
	| 'unknown'

export type FurinaLogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug'

export interface FurinaErrorEvent {
	category: FurinaErrorCategory
	code: number | string | null
	message: string
	raw: any
	timestamp: number
	recoverable: boolean
	recoveryAction?: string
}

export interface StabilityConfig {
	autoRecovery?: boolean
	maxRetries?: number
	baseReconnectDelay?: number
	maxReconnectDelay?: number
	jitter?: number
	autoPauseAfter?: number
	autoPauseDuration?: number
	logLevel?: FurinaLogLevel
	stealthMode?: boolean
	onLog?: (level: FurinaLogLevel, message: string) => void
}

export interface StabilityStats {
	totalErrors: number
	errorsByCategory: Record<FurinaErrorCategory, number>
	reconnectAttempts: number
	lastReconnect: number | null
	isPaused: boolean
	pausedUntil: number | null
}

export interface DisconnectInfo {
	statusCode: number | null
	message: string
	isRecoverable: boolean
	requiresReauth: boolean
}
