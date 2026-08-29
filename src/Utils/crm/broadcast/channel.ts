// channel.ts — utility channel (newsletter) + metadata lengkap
// Research: #2199 (text OK media broken), #2204 (thread_metadata runtime),
// #2555 (fetchMessages broken → verify pakai echo upsert), #1903 (no list API)

import type { CRMChannelRole } from '../types'

export interface CRMChannelInfo {
	jid: string
	name: string
	description: string | null
	role: CRMChannelRole
	invite: string | null
	subscribers: number
	verification: string | null
	creationTime: number | null
	isAdmin: boolean
}

export function normalizeChannelJid(raw: string): string {
	if (!raw) return raw
	return raw.replace(/@newsletter+/g, '') + '@newsletter'
}

export async function resolveChannelFromLink(
	sock: any,
	link: string
): Promise<string | null> {
	try {
		const code = link.replace('https://whatsapp.com/channel/', '')
		const meta = await sock.newsletterMetadata('invite', code)
		if (!meta?.id) return null
		return normalizeChannelJid(meta.id)
	} catch (err) {
		return null
	}
}

let roleDetectionLogged = false

export async function detectChannelRole(
	sock: any,
	channelJid: string
): Promise<CRMChannelRole> {
	try {
		const jid = normalizeChannelJid(channelJid)
		const meta = await sock.newsletterMetadata('jid', jid)

		const viewerMetadata = (meta as any)?.viewer_metadata
		if (viewerMetadata?.role) {
			if (!roleDetectionLogged) {
				console.warn('[CHANNEL] Role dari viewer_metadata.role (runtime)')
				roleDetectionLogged = true
			}
			return viewerMetadata.role as CRMChannelRole
		}

		const botLid = sock.user?.lid ?? sock.user?.id ?? ''
		if (meta?.owner && meta.owner === botLid) return 'OWNER'

		return 'SUBSCRIBER'
	} catch (err) {
		return 'UNKNOWN'
	}
}

export async function isChannelAdmin(sock: any, channelJid: string): Promise<boolean> {
	const role = await detectChannelRole(sock, channelJid)
	return role === 'ADMIN' || role === 'OWNER'
}

// ── Extractor defensif (shape runtime beda-beda per versi WA, #2204) ──

function extractName(meta: any): string {
	const raw = meta?.thread_metadata?.name ?? meta?.name
	if (typeof raw === 'string') return raw
	if (raw?.text) return raw.text
	return 'Unknown Channel'
}

function extractDescription(meta: any): string | null {
	const raw = meta?.thread_metadata?.description ?? meta?.description
	if (typeof raw === 'string') return raw
	if (raw?.text) return raw.text
	return null
}

function extractSubscribers(meta: any): number {
	const count =
		meta?.thread_metadata?.subscribers_count ??
		meta?.thread_metadata?.subscribers ??
		meta?.subscribers
	if (typeof count === 'number') return count
	if (typeof count === 'string') return parseInt(count, 10) || 0
	return 0
}

function extractInvite(meta: any): string | null {
	return meta?.thread_metadata?.invite ?? meta?.invite ?? null
}

function extractVerification(meta: any): string | null {
	return meta?.thread_metadata?.verification ?? meta?.verification ?? null
}

function extractCreationTime(meta: any): number | null {
	const t = meta?.thread_metadata?.creation_time ?? meta?.creation_time
	if (typeof t === 'string') return parseInt(t, 10) || null
	if (typeof t === 'number') return t
	return null
}

// Verifikasi pakai echo upsert (newsletterFetchMessages broken, #2555)
export function verifyChannelPostViaEcho(
	sock: any,
	channelJid: string,
	content: string,
	timeoutMs: number = 15000
): Promise<boolean> {
	return new Promise((resolve) => {
		let resolved = false
		const jid = normalizeChannelJid(channelJid)

		const handler = ({ messages }: any) => {
			if (resolved) return
			for (const m of messages) {
				if (m.key?.fromMe && m.key?.remoteJid === jid) {
					const text =
						m.message?.conversation ??
						m.message?.extendedTextMessage?.text ??
						''
					if (text.includes(content.slice(0, 40))) {
						resolved = true
						sock.ev.off('messages.upsert', handler)
						clearTimeout(timer)
						resolve(true)
						return
					}
				}
			}
		}

		const timer = setTimeout(() => {
			if (!resolved) {
				resolved = true
				sock.ev.off('messages.upsert', handler)
				resolve(false)
			}
		}, timeoutMs)

		sock.ev.on('messages.upsert', handler)
	})
}

export async function getChannelInfo(
	sock: any,
	channelJid: string
): Promise<CRMChannelInfo | null> {
	try {
		const jid = normalizeChannelJid(channelJid)
		const meta = await sock.newsletterMetadata('jid', jid)
		const role = await detectChannelRole(sock, jid)

		return {
			jid,
			name: extractName(meta),
			description: extractDescription(meta),
			role,
			invite: extractInvite(meta),
			subscribers: extractSubscribers(meta),
			verification: extractVerification(meta),
			creationTime: extractCreationTime(meta),
			isAdmin: role === 'ADMIN' || role === 'OWNER',
		}
	} catch (err) {
		console.warn('[CHANNEL] getChannelInfo failed:', (err as any)?.message ?? err)
		return null
	}
}

// Resolve banyak channel sekaligus (link invite / JID / ID mentah)
export async function resolveMultipleChannels(
	sock: any,
	inputs: string[]
): Promise<CRMChannelInfo[]> {
	const results: CRMChannelInfo[] = []

	for (const raw of inputs) {
		const input = (raw ?? '').trim()
		if (!input) continue

		try {
			let jid: string | null = null

			if (input.includes('whatsapp.com/channel/')) {
				jid = await resolveChannelFromLink(sock, input)
			} else {
				jid = normalizeChannelJid(input)
			}

			if (!jid) continue

			const info = await getChannelInfo(sock, jid)
			if (info) results.push(info)
		} catch (err) {
			// skip channel yang gagal resolve
		}
	}

	return results
}
