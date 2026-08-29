// logger.ts
// Logging utility with level support
// Default: warn (cuma log error + warning penting)

import type { FurinaLogLevel } from './types'

const LOG_LEVEL_ORDER: FurinaLogLevel[] = ['silent', 'error', 'warn', 'info', 'debug']

export class FurinaLogger {
	private level: FurinaLogLevel
	private customLogger?: (level: FurinaLogLevel, message: string) => void
	private prefix: string

	constructor(
		level: FurinaLogLevel = 'warn',
		customLogger?: (level: FurinaLogLevel, message: string) => void,
		prefix: string = 'STABILITY'
	) {
		this.level = level
		this.customLogger = customLogger
		this.prefix = prefix
	}

	private shouldLog(level: FurinaLogLevel): boolean {
		if (this.level === 'silent') return false
		const currentIndex = LOG_LEVEL_ORDER.indexOf(level)
		const maxIndex = LOG_LEVEL_ORDER.indexOf(this.level)
		// index 0 = silent (nggak log), index 1+ = error/warn/info/debug
		return currentIndex > 0 && currentIndex <= maxIndex
	}

	log(level: FurinaLogLevel, message: string): void {
		if (!this.shouldLog(level)) return

		const formatted = `[${this.prefix}][${level.toUpperCase()}] ${message}`

		if (this.customLogger) {
			this.customLogger(level, formatted)
		} else {
			console.log(formatted)
		}
	}

	error(message: string): void {
		this.log('error', message)
	}

	warn(message: string): void {
		this.log('warn', message)
	}

	info(message: string): void {
		this.log('info', message)
	}

	debug(message: string): void {
		this.log('debug', message)
	}

	setLevel(level: FurinaLogLevel): void {
		this.level = level
	}
}
