import type { AntibanProfile } from './profiles'
import { PROFILE_ORI } from './profiles'

// gaussian jitter (Box-Muller) so intervals never look fixed
export function jitter(min: number, max: number): number {
	const u1 = Math.random() || 1e-9
	const u2 = Math.random()
	const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
	const mean = (min + max) / 2
	const std = (max - min) / 6
	return Math.max(min, Math.min(max, Math.floor(mean + z * std)))
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// composing -> typing pause -> paused -> send, like a real person
export async function humanSend(sock: any, jid: string, content: any, opts: any = {}, profile: AntibanProfile = PROFILE_ORI) {
	await sock.sendPresenceUpdate('composing', jid)

	// longer text = longer "typing", capped by profile
	const textLen = typeof content?.text === 'string' ? content.text.length : 20
	const think = Math.min(profile.typingMax, profile.typingMin + textLen * 30)
	await sleep(jitter(profile.typingMin, think))

	await sock.sendPresenceUpdate('paused', jid)
	const res = await sock.sendMessage(jid, content, opts)

	// small cooldown after send so consecutive sends never burst
	await sleep(jitter(profile.cooldownMin, profile.cooldownMax))
	return res
}
