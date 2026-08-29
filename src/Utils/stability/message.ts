// message.ts
// Handler for message-related errors (duplicate detection, counter issues)
// Tracks processed message IDs to detect duplicates

import type { FurinaLogger } from './logger'

export class MessageHandler {
	private logger: FurinaLogger
	private processedMessageIds: Set<string> = new Set()
	private maxCacheSize: number

	constructor(logger: FurinaLogger, maxCacheSize: number = 10000) {
		this.logger = logger
		this.maxCacheSize = maxCacheSize
	}

	isDuplicate(messageId: string): boolean {
		if (!messageId) return false

		if (this.processedMessageIds.has(messageId)) {
			this.logger.debug(`Duplicate message detected: ${messageId}`)
			return true
		}

		this.processedMessageIds.add(messageId)

		// Limit cache size to prevent memory leak
		// Remove oldest entry when cache is full
		if (this.processedMessageIds.size > this.maxCacheSize) {
			const firstId = this.processedMessageIds.values().next().value
			if (firstId) {
				this.processedMessageIds.delete(firstId)
			}
		}

		return false
	}

	getCacheSize(): number {
		return this.processedMessageIds.size
	}

	clearCache(): void {
		const size = this.processedMessageIds.size
		this.processedMessageIds.clear()
		if (size > 0) {
			this.logger.debug(`Message cache cleared (${size} entries removed)`)
		}
	}
}
