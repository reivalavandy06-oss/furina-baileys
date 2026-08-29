// protocol.ts
// Handler for protocol-related errors (parse error, invalid notification)
// These are usually non-fatal and can be safely ignored

import type { FurinaLogger } from './logger'

export class ProtocolHandler {
	private logger: FurinaLogger
	private seenWarnings: Set<string> = new Set()
	private maxSeenWarnings: number = 100

	constructor(logger: FurinaLogger) {
		this.logger = logger
	}

	// Detect if an error is protocol-related
	isProtocolError(error: any): boolean {
		const message = error?.message ?? String(error ?? '')
		return (
			message.includes('invalid mex') ||
			message.includes('invalid notification') ||
			message.includes('parse error') ||
			message.includes('unsupported protocol')
		)
	}

	// Log protocol errors with deduplication (avoid spamming the same warning)
	logProtocolError(error: any): void {
		const message = error?.message ?? String(error ?? 'Unknown protocol error')

		// Deduplicate: only log each unique warning once
		if (this.seenWarnings.has(message)) {
			return
		}

		// Limit seen warnings to prevent memory leak
		if (this.seenWarnings.size >= this.maxSeenWarnings) {
			const first = this.seenWarnings.values().next().value
			if (first) {
				this.seenWarnings.delete(first)
			}
		}

		this.seenWarnings.add(message)
		this.logger.debug(`Protocol error (ignored, non-fatal): ${message}`)
	}

	getSeenWarningsCount(): number {
		return this.seenWarnings.size
	}
}
