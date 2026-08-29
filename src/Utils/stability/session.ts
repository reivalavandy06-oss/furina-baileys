// session.ts
// Handler for session-related errors (decrypt error, session not found)
// Note: Baileys doesn't emit events for decrypt failures, so we provide
// utilities that can be called manually when needed

import type { FurinaLogger } from './logger'

export class SessionHandler {
	private logger: FurinaLogger

	constructor(logger: FurinaLogger) {
		this.logger = logger
	}

	logSessionError(jid: string, error: string): void {
		this.logger.warn(`Session error for ${jid}: ${error}`)
	}

	// Delete a corrupt session to force re-establishment
	// Call this when you get "No session found" or decrypt errors
	async deleteSession(sock: any, jid: string): Promise<boolean> {
		try {
			if (sock.signalRepository?.deleteSession) {
				await sock.signalRepository.deleteSession(jid)
				this.logger.info(`Session deleted for ${jid}, will re-establish on next message`)
				return true
			}
			this.logger.warn('deleteSession not available on signalRepository')
			return false
		} catch (error) {
			this.logger.error(`Failed to delete session for ${jid}: ${error}`)
			return false
		}
	}

	// Clear all sessions (nuclear option, use with caution)
	// This will force re-establishment of ALL sessions
	async clearAllSessions(sock: any): Promise<boolean> {
		try {
			if (sock.signalRepository?.clearAllSessions) {
				await sock.signalRepository.clearAllSessions()
				this.logger.warn('All sessions cleared, this may take time to re-establish')
				return true
			}
			this.logger.warn('clearAllSessions not available on signalRepository')
			return false
		} catch (error) {
			this.logger.error(`Failed to clear all sessions: ${error}`)
			return false
		}
	}
}
