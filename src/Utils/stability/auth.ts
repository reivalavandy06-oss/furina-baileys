// auth.ts
// Handler for authentication-related errors (logout, 401, unauthorized)
// When 401 occurs, reconnect must stop - user needs to re-pair

import type { FurinaLogger } from './logger'

export class AuthHandler {
	private logger: FurinaLogger

	constructor(logger: FurinaLogger) {
		this.logger = logger
	}

	isAuthError(statusCode: number | null): boolean {
		return statusCode === 401
	}

	handleAuthError(): void {
		this.logger.error('═══════════════════════════════════════════════════════')
		this.logger.error('AUTHENTICATION FAILED (401)')
		this.logger.error('Your session has been logged out or expired.')
		this.logger.error('ACTION REQUIRED: Please re-pair your device.')
		this.logger.error('All reconnect attempts have been stopped.')
		this.logger.error('═══════════════════════════════════════════════════════')
	}

	isRequiresReauth(statusCode: number | null): boolean {
		return this.isAuthError(statusCode)
	}
}
