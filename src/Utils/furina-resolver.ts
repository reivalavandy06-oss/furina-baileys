// furina-baileys — furina-resolver.ts
// WhatsApp identity resolver: LID ↔ PN bidirectional + USync queries + link utils.
//
// Cakupan:
//   - Resolve LID → PN / PN → LID
//   - Cari user via username (USync)
//   - Auto-detect format input (JID / nomor / username)
//   - Generate wa.me link dari identifier
//   - Parse link WhatsApp (wa.me / chat.whatsapp.com) jadi JID
//   - Bulk resolve dengan chunk (hindari rate-limit)

import { getLIDResolver, type LIDResolver, type FurinaLIDMapping } from './lid-resolver'
import { getUSyncResolver, type USyncResolver, type UserInfo } from './usync-resolver'
import { jidDecode, jidNormalizedUser } from '../WABinary'

// Known WhatsApp JID servers - used to validate JID branch
const WHATSAPP_SERVERS = new Set([
	's.whatsapp.net',
	'lid',
	'g.us',
	'broadcast',
	'newsletter',
	'c.us',
	'call',
	'bot',
	'hosted',
	'hosted.lid',
	'status',
])

// Re-export types biar user nggak perlu import dari 2 file berbeda
export type { FurinaLIDMapping, UserInfo }

// ===== FURINA: LEGACY HELPERS =====

export const isNewsletter = (jid?: string) => !!jid && jid.endsWith('@newsletter')
export const isGroup = (jid?: string) => !!jid && jid.endsWith('@g.us')
export const isLID = (jid?: string) => !!jid && jid.endsWith('@lid')
export const isUser = (jid?: string) => !!jid && (jid.endsWith('@s.whatsapp.net') || isLID(jid))

// ===== FURINA: RESOLVER INTERFACE =====

export interface FurinaResolver {
	// LID ↔ PN bidirectional
	resolveLID(pn: string): Promise<string | null>
	resolvePN(lid: string): Promise<string | null>

	// USync queries
	searchByUsername(username: string): Promise<UserInfo | null>
	fetchUserInfo(jid: string): Promise<UserInfo | null>
	fetchStatus(jid: string): Promise<string | null>

	// Smart auto-detect input (JID / nomor / username)
	resolveTarget(target: string): Promise<string | null>

	// Link utils
	toWhatsAppLink(target: string): Promise<string | null>
	fromWhatsAppLink(link: string): Promise<string | null>

	// Bulk resolve
	resolveMany(targets: string[]): Promise<Array<string | null>>

	// Cache management
	getLIDMapping(lid: string): FurinaLIDMapping | null
	getAllMappings(): FurinaLIDMapping[]
	clearCache(): void

	// Direct access ke sub-resolver
	lid: LIDResolver
	usync: USyncResolver
}

// Chunk size untuk bulk resolve. WhatsApp mulai rate-limit kalau
// kirim >10 query serentak. 5 aman.
const BULK_CHUNK_SIZE = 5

export function createFurinaResolver(sock: any): FurinaResolver {
	const lid = getLIDResolver(sock)
	const usync = getUSyncResolver(sock)

	return {
		lid,
		usync,

		// ===== LID ↔ PN =====

		async resolveLID(pn: string): Promise<string | null> {
			return lid.resolveLID(pn)
		},

		async resolvePN(lidJid: string): Promise<string | null> {
			return lid.resolvePN(lidJid)
		},

		// ===== USync =====

		async searchByUsername(username: string): Promise<UserInfo | null> {
			return usync.searchByUsername(username)
		},

		async fetchUserInfo(jid: string): Promise<UserInfo | null> {
			return usync.fetchUserInfo(jid)
		},

		async fetchStatus(jid: string): Promise<string | null> {
			return usync.fetchStatus(jid)
		},

		// ===== SMART RESOLVE =====

		async resolveTarget(target: string): Promise<string | null> {
			if (!target || typeof target !== 'string') return null

			const t = target.trim()
			if (!t) return null

			// 0. Username (@user) — DICEK SEBELUM JID branch, karena '@username'
			// juga mengandung '@' tapi bukan JID valid.
			if (t.startsWith('@')) {
				const username = t.slice(1)
				if (!username || username.length === 0) return null
				const userInfo = await usync.searchByUsername(username)
				return userInfo?.lid ?? userInfo?.pn ?? userInfo?.jid ?? null
			}

			// 1. Sudah JID (ada @) — normalisasi device/agent suffix supaya
			// output konsisten dengan CRM key & recipient lain. Server kosong
			// ("user@") ditolak: JID cacat lebih baik kena null daripada
			// ikut terus ke seluruh flow CRM.
			// Jika server bukan domain WhatsApp dikenal → return null (bukan fall-through).
			if (t.includes('@')) {
				const decoded = jidDecode(t)
				if (!decoded?.server || !WHATSAPP_SERVERS.has(decoded.server)) {
					return null
				}
				return jidNormalizedUser(t)
			}

			// 2. Nomor telepon (8-15 digit, optional +)
			if (/^\+?\d{8,15}$/.test(t)) {
				const pn = t.replace(/\D/g, '') + '@s.whatsapp.net'
				// Coba convert ke LID — kalau ada, pakai LID (identifier utama WA modern)
				const lidResult = await lid.resolveLID(pn)
				return lidResult ?? pn
			}

			// 3. Username (mengandung huruf/simbol selain digit)
			if (/[a-zA-Z]/.test(t)) {
				const userInfo = await usync.searchByUsername(t)
				return userInfo?.lid ?? userInfo?.pn ?? userInfo?.jid ?? null
			}

			return null
		},

		// ===== LINK UTILS =====

		async toWhatsAppLink(target: string): Promise<string | null> {
			let jid = await this.resolveTarget(target)
			if (!jid) return null

			// Group & newsletter: butuh invite link, bukan wa.me
			if (isGroup(jid) || isNewsletter(jid)) return null

			// LID: coba resolve ke PN dulu. Kalau nggak dapet, return null
			// (wa.me butuh nomor telepon, bukan LID)
			if (isLID(jid)) {
				const pn = await lid.resolvePN(jid)
				if (!pn) return null
				jid = pn
			}

			// Ekstrak user (strip device suffix + server) lewat jidDecode, bukan
			// split manual: JID bisa punya agent suffix juga (user_1:5@server).
			const userPart = jidDecode(jid)?.user

			// Validasi: harus angka murni
			if (!userPart || !/^\d+$/.test(userPart)) return null

			return `https://wa.me/${userPart}`
		},

		async fromWhatsAppLink(link: string): Promise<string | null> {
			if (!link || typeof link !== 'string') return null

			const trimmed = link.trim()

			// Format 1: wa.me/62XXX atau api.whatsapp.com/send?phone=62XXX
			const waMatch = trimmed.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)(\d+)/)
			if (waMatch) {
				return `${waMatch[1]}@s.whatsapp.net`
			}

			// Format 2: chat.whatsapp.com/XXXX (group invite code)
			const groupMatch = trimmed.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/)
			if (groupMatch) {
				try {
					const info = await sock.groupGetInviteInfo(groupMatch[1])
					return info?.id ?? null
				} catch {
					return null
				}
			}

			return null
		},

		// ===== BULK RESOLVE =====

		async resolveMany(targets: string[]): Promise<Array<string | null>> {
			if (!Array.isArray(targets) || targets.length === 0) return []

			const results: Array<string | null> = []

			// Chunk buat hindari rate-limit WhatsApp
			for (let i = 0; i < targets.length; i += BULK_CHUNK_SIZE) {
				const chunk = targets.slice(i, i + BULK_CHUNK_SIZE)
				const chunkResults = await Promise.all(
					chunk.map((t) => this.resolveTarget(t))
				)
				results.push(...chunkResults)
			}

			return results
		},

		// ===== CACHE =====

		getLIDMapping(lidStr: string): FurinaLIDMapping | null {
			return lid.getMapping(lidStr)
		},

		getAllMappings(): FurinaLIDMapping[] {
			return lid.getAllMappings()
		},

		clearCache(): void {
			lid.clearCache()
		},
	}
}

// ===== FURINA: STANDALONE WRAPPERS (backward compat) =====
// Tetap ada biar kode lama yang import function langsung nggak breaking.

export const resolveTarget = async (sock: any, target: string): Promise<string | null> => {
	const resolver = createFurinaResolver(sock)
	return resolver.resolveTarget(target)
}

export const resolvePNtoLID = (sock: any, phone: string) => resolveTarget(sock, phone)

export const searchByUsername = async (sock: any, username: string) => {
	const resolver = createFurinaResolver(sock)
	return resolver.searchByUsername(username)
}

export const toWhatsAppLink = async (sock: any, target: string): Promise<string | null> => {
	const resolver = createFurinaResolver(sock)
	return resolver.toWhatsAppLink(target)
}

export const fromWhatsAppLink = async (sock: any, link: string): Promise<string | null> => {
	const resolver = createFurinaResolver(sock)
	return resolver.fromWhatsAppLink(link)
}

// TODO: newsletter info fetching (belum diimplementasi di upstream)
export const getNewsletterInfo = async (_sock: any, _jidOrInvite: string) => {
	return null
}