import type { AntibanProfile } from './profiles'
import { jitter } from './timing'

// tracks errors/disconnects and forces cooldown when things look bad.
// in-memory only on purpose: nothing on disk = nothing to corrupt.
export class HealthMonitor {
	private errors = 0
	private disconnects = 0
	private attempts = 0
	private pausedUntil = 0

	constructor(private profile: AntibanProfile) {}

	recordError(statusCode?: number) {
		this.errors++
		// 403/515 are the scary ones, weight them double
		if (statusCode === 403 || statusCode === 515) this.errors++
	}

	recordDisconnect() {
		this.disconnects++
	}

	isPaused() {
		return Date.now() < this.pausedUntil
	}

	maybePause() {
		if (this.errors >= this.profile.errorThreshold && !this.isPaused()) {
			this.pausedUntil = Date.now() + this.profile.pauseMs
			this.errors = 0
			return true
		}
		return false
	}

	// exponential backoff: 3s -> 6s -> 12s ... capped, plus jitter
	nextBackoff() {
		this.attempts++
		const exp = Math.min(this.profile.backoffMax, this.profile.backoffBase * 2 ** (this.attempts - 1))
		return exp + jitter(200, 1000)
	}

	resetBackoff() {
		this.attempts = 0
	}

	// bot saves/restores state its own way (no file writes here)
	exportState() {
		return { errors: this.errors, disconnects: this.disconnects, pausedUntil: this.pausedUntil }
	}

	importState(s: { errors?: number; disconnects?: number; pausedUntil?: number }) {
		this.errors = s.errors ?? 0
		this.disconnects = s.disconnects ?? 0
		this.pausedUntil = s.pausedUntil ?? 0
	}
}
