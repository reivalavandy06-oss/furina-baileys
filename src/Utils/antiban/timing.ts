// furina-baileys — antiban/timing.ts
// Gaussian jitter, sleep helper, human-like send, send window (jam tidur).

import type { AntibanProfile } from './profiles'
import { PROFILE_ORI } from './profiles'

// Gaussian jitter (Box-Muller) — interval nggak pernah fixed.
// Hasil selalu dalam [min, max].
export function jitter(min: number, max: number): number {
	const u1 = Math.random() || 1e-9
	const u2 = Math.random()
	const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
	const mean = (min + max) / 2
	const std = (max - min) / 6
	return Math.max(min, Math.min(max, Math.floor(mean + z * std)))
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ===== FURINA: SEND WINDOW (JAM TIDUR) =====

export interface SendWindowCheck {
	allowed: boolean
	/** Kalau nggak allowed, tunggu berapa ms lagi */
	waitMs: number
	/** Alasan (buat debug) */
	reason?: string
}

// Cek apakah sekarang boleh kirim, atau lagi di jam tidur.
// Handle overnight case: misal sleepStart=22, sleepEnd=6 — artinya 22:00 → 06:00 besoknya.
export function checkSendWindow(
	profile: AntibanProfile,
	now: Date = new Date()
): SendWindowCheck {
	if (!profile.sleepEnabled) {
		return { allowed: true, waitMs: 0 }
	}

	const hour = now.getHours()
	const { sleepStart, sleepEnd } = profile

	// Kasus normal (misal 1 → 5): tidur di tengah hari
	// Kasus overnight (misal 22 → 6): tidur lewat tengah malam
	const isOvernight = sleepStart > sleepEnd

	const inSleep = isOvernight
		? hour >= sleepStart || hour < sleepEnd
		: hour >= sleepStart && hour < sleepEnd

	if (!inSleep) {
		return { allowed: true, waitMs: 0 }
	}

	// Hitung ms sampai sleepEnd
	const next = new Date(now)
	if (isOvernight && hour < sleepEnd) {
		// Sudah lewat tengah malam, sleepEnd di hari yang sama
		next.setHours(sleepEnd, 0, 0, 0)
	} else {
		// sleepEnd besok (atau hari ini kalau bukan overnight)
		next.setDate(next.getDate() + 1)
		next.setHours(sleepEnd, 0, 0, 0)
	}

	return {
		allowed: false,
		waitMs: next.getTime() - now.getTime(),
		reason: `sleep window ${sleepStart}:00–${sleepEnd}:00`,
	}
}

// Tunggu sampai di luar jam tidur. Return saat udah boleh kirim.
export async function waitForSendWindow(profile: AntibanProfile): Promise<void> {
	const check = checkSendWindow(profile)
	if (check.allowed) return

	console.log(
		`[furina-antiban] sleep window aktif (${check.reason}). ` +
		`Tunggu ${Math.round(check.waitMs / 1000 / 60)} menit...`
	)
	await sleep(check.waitMs)

	// Rekursif — kalau masih di dalam window (misal system sleep), tunggu lagi
	return waitForSendWindow(profile)
}

// ===== FURINA: HUMAN SEND =====

// composing → typing pause → send → cleanup paused.
// Urutan presence: paused dikirim SETELAH send, bukan sebelum.
// WA client otomatis trigger paused saat pesan terkirim, jadi kirim manual
// sebelum send = pola nggak natural (terdeteksi bot).
export async function humanSend(
	sock: any,
	jid: string,
	content: any,
	opts: any = {},
	profile: AntibanProfile = PROFILE_ORI
) {
	if (!jid || typeof jid !== 'string') {
		throw new Error('[furina-antiban] humanSend: jid wajib string')
	}
	if (!content || typeof content !== 'object') {
		throw new Error('[furina-antiban] humanSend: content wajib object')
	}

	// 1. Tunggu kalau lagi di jam tidur
	await waitForSendWindow(profile)

	// 2. Mulai composing
	await sock.sendPresenceUpdate('composing', jid)

	// 3. Hitung durasi "typing" — teks lebih panjang = mikir lebih lama
	const textLen = typeof content?.text === 'string' ? content.text.length : 20
	const think = Math.min(profile.typingMax, profile.typingMin + textLen * 30)
	await sleep(jitter(profile.typingMin, think))

	// 4. Kirim pesan (WA client bakal auto set paused di sisi penerima)
	const res = await sock.sendMessage(jid, content, opts)

	// 5. Cooldown setelah kirim — cegah burst
	await sleep(jitter(profile.cooldownMin, profile.cooldownMax))

	// 6. Cleanup paused (opsional, WA client udah handle sendiri, ini buat consistency)
	try {
		await sock.sendPresenceUpdate('paused', jid)
	} catch {
		// presence update bisa fail kalau socket lagi nggak sehat, nggak fatal
	}

	return res
}
