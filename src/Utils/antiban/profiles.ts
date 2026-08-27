// anti-ban profiles. business accounts get watched harder, so tighter numbers.

export interface AntibanProfile {
	maxPerHour: number
	typingMin: number
	typingMax: number
	cooldownMin: number
	cooldownMax: number
	errorThreshold: number
	pauseMs: number
	backoffBase: number
	backoffMax: number
}

export const PROFILE_ORI: AntibanProfile = {
	maxPerHour: 60,
	typingMin: 600,
	typingMax: 4000,
	cooldownMin: 1500,
	cooldownMax: 4500,
	errorThreshold: 5,
	pauseMs: 10 * 60 * 1000,
	backoffBase: 3000,
	backoffMax: 60000,
}

// business = stricter: lower volume, longer cooldowns, quicker to pause
export const PROFILE_BUSINESS: AntibanProfile = {
	maxPerHour: 30,
	typingMin: 900,
	typingMax: 5000,
	cooldownMin: 2500,
	cooldownMax: 6500,
	errorThreshold: 3,
	pauseMs: 30 * 60 * 1000,
	backoffBase: 5000,
	backoffMax: 120000,
}

export function getProfile(kind: 'ori' | 'business', override: Partial<AntibanProfile> = {}): AntibanProfile {
	const base = kind === 'business' ? PROFILE_BUSINESS : PROFILE_ORI
	return { ...base, ...override }
}
