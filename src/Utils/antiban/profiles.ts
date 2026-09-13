// furina-baileys — antiban profiles
// Profil ORI vs Business. Business dipantau lebih ketat, jadi angkanya lebih konservatif.

export interface AntibanProfile {
	/** Maksimum aksi per jam (sliding window) */
	maxPerHour: number
	/** Durasi typing minimum (ms) */
	typingMin: number
	/** Durasi typing maksimum (ms) */
	typingMax: number
	/** Cooldown minimum setelah kirim (ms) */
	cooldownMin: number
	/** Cooldown maksimum setelah kirim (ms) */
	cooldownMax: number
	/** Jumlah error sebelum auto-pause */
	errorThreshold: number
	/** Durasi auto-pause (ms) */
	pauseMs: number
	/** Base delay backoff (ms) */
	backoffBase: number
	/** Delay backoff maksimum (ms) */
	backoffMax: number
	/** Window waktu untuk hitung error (ms). Error di luar window diabaikan */
	errorWindowMs: number
	/** Jumlah disconnect sebelum auto-pause */
	disconnectThreshold: number
	/** Aktifkan jam tidur — bot nggak kirim di rentang sleepStart..sleepEnd */
	sleepEnabled: boolean
	/** Jam mulai tidur (0-23, waktu lokal) */
	sleepStart: number
	/** Jam selesai tidur (0-23, waktu lokal) */
	sleepEnd: number
	/** Aktifkan statistik internal (pause count, error count, dll) */
	statsEnabled: boolean
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
	errorWindowMs: 60 * 60 * 1000,   // 1 jam
	disconnectThreshold: 3,
	sleepEnabled: false,              // user opt-in
	sleepStart: 22,
	sleepEnd: 6,
	statsEnabled: false,
}

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
	errorWindowMs: 30 * 60 * 1000,   // 30 menit
	disconnectThreshold: 2,
	sleepEnabled: false,
	sleepStart: 22,
	sleepEnd: 6,
	statsEnabled: false,
}

export function getProfile(kind: 'ori' | 'business', override: Partial<AntibanProfile> = {}): AntibanProfile {
	const base = kind === 'business' ? PROFILE_BUSINESS : PROFILE_ORI
	return { ...base, ...override }
}	
