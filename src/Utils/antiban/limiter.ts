import { jitter, sleep } from './timing'
import type { AntibanProfile } from './profiles'

// sliding-window rate limiter: max N actions per window.
export class RateLimiter {
	private stamps: number[] = []

	constructor(private max: number, private windowMs: number) {}

	static fromProfile(p: AntibanProfile) {
		return new RateLimiter(p.maxPerHour, 60 * 60 * 1000)
	}

	// explicit return type: recursive async method needs it under strict mode
	async take(): Promise<void> {
		const now = Date.now()
		this.stamps = this.stamps.filter((t) => now - t < this.windowMs)

		if (this.stamps.length >= this.max) {
			const first = this.stamps[0] ?? now
			const wait = this.windowMs - (now - first) + jitter(200, 900)
			await sleep(wait)
			return this.take()
		}

		this.stamps.push(now)
	}
}
