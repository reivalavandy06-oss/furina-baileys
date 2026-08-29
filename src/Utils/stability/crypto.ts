// crypto.ts
// Handler for crypto-related errors (libsignal, buffer issues)
// These errors usually happen when pre-keys or sender keys are out of sync

import type { FurinaLogger } from './logger'

export class CryptoHandler {
	private logger: FurinaLogger

	constructor(logger: FurinaLogger) {
		this.logger = logger
	}

	// Detect if an error is crypto-related
	isCryptoError(error: any): boolean {
		const message = error?.message ?? String(error ?? '')
		return (
			message.includes('Expected Buffer') ||
			message.includes('Invalid key') ||
			message.includes('Decryption failed') ||
			message.includes('Identity key changed') ||
			message.includes('Key used already')
		)
	}

	logCryptoError(jid: string, error: any): void {
		const message = error?.message ?? String(error ?? 'Unknown crypto error')
		this.logger.warn(`Crypto error for ${jid}: ${message}`)
	}

	// Suggest recovery action based on error type
	getRecoverySuggestion(error: any): string {
		const message = error?.message ?? String(error ?? '')

		if (message.includes('Identity key changed')) {
			return 'Contact re-installed WhatsApp or changed device. Session will auto-recover.'
		}
		if (message.includes('Key used already')) {
			return 'Duplicate message detected. Safe to ignore.'
		}
		if (message.includes('Expected Buffer')) {
			return 'Pre-key corruption detected. Try deleting the session for this contact.'
		}
		if (message.includes('No session found')) {
			return 'Session not established yet. Wait for sender key distribution.'
		}

		return 'Unknown crypto error. Try restarting the connection.'
	}
}
