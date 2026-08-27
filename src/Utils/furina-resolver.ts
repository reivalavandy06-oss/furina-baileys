// Furina Resolver - Complete WhatsApp identity resolver
// Combines LID mapping, USync queries, and legacy resolvers into one powerful tool

import { getLIDResolver, type LIDResolver, type FurinaLIDMapping } from './lid-resolver'
import { getUSyncResolver, type USyncResolver, type UserInfo } from './usync-resolver'

// Re-export types for convenience
export { FurinaLIDMapping, UserInfo }

// ===== LEGACY HELPERS (backward compatibility) =====

export const isNewsletter = (jid?: string) => !!jid && jid.endsWith('@newsletter')
export const isGroup = (jid?: string) => !!jid && jid.endsWith('@g.us')
export const isLID = (jid?: string) => !!jid && jid.endsWith('@lid')
export const isUser = (jid?: string) => !!jid && (jid.endsWith('@s.whatsapp.net') || isLID(jid))

// ===== ADVANCED RESOLVER INTERFACE =====

export interface FurinaResolver {
	// LID/PN bidirectional resolution
	resolveLID(pn: string): Promise<string | null>
	resolvePN(lid: string): Promise<string | null>

	// USync queries
	searchByUsername(username: string): Promise<UserInfo | null>
	fetchUserInfo(jid: string): Promise<UserInfo | null>
	fetchStatus(jid: string): Promise<string | null>

	// Target resolution (smart auto-detect)
	resolveTarget(target: string): Promise<string | null>

	// Cache management
	getLIDMapping(lid: string): FurinaLIDMapping | null
	getAllMappings(): FurinaLIDMapping[]
	clearCache(): void

	// Direct access to sub-resolvers
	lid: LIDResolver
	usync: USyncResolver
}

export function createFurinaResolver(sock: any): FurinaResolver {
	const lid = getLIDResolver(sock)
	const usync = getUSyncResolver(sock)

	return {
		lid,
		usync,

		async resolveLID(pn: string): Promise<string | null> {
			return lid.resolveLID(pn)
		},

		async resolvePN(lidJid: string): Promise<string | null> {
			return lid.resolvePN(lidJid)
		},

		async searchByUsername(username: string): Promise<UserInfo | null> {
			return usync.searchByUsername(username)
		},

		async fetchUserInfo(jid: string): Promise<UserInfo | null> {
			return usync.fetchUserInfo(jid)
		},

		async fetchStatus(jid: string): Promise<string | null> {
			return usync.fetchStatus(jid)
		},

		async resolveTarget(target: string): Promise<string | null> {
			// Smart auto-detect based on input type
			const normalized = target.trim()

			// Already a JID
			if (normalized.includes('@')) {
				return normalized
			}

			// Phone number (all digits, optionally with +)
			if (/^\+?\d+$/.test(normalized)) {
				const pn = normalized.replace(/^\+/, '') + '@s.whatsapp.net'
				const lidResult = await lid.resolveLID(pn)
				return lidResult ?? pn
			}

			// Username (contains letters/symbols)
			if (/[a-zA-Z]/.test(normalized)) {
				const userInfo = await usync.searchByUsername(normalized)
				if (userInfo?.lid) return userInfo.lid
				if (userInfo?.pn) return userInfo.pn
			}

			return null
		},

		getLIDMapping(lidStr: string): FurinaLIDMapping | null {
			return lid.getMapping(lidStr)
		},

		getAllMappings(): FurinaLIDMapping[] {
			return lid.getAllMappings()
		},

		clearCache(): void {
			lid.clearCache()
		}
	}
}

// Legacy compatibility wrappers
export const resolveTarget = async (sock: any, target: string): Promise<string | null> => {
	const resolver = createFurinaResolver(sock)
	return resolver.resolveTarget(target)
}

export const resolvePNtoLID = (sock: any, phone: string) => resolveTarget(sock, phone)

export const searchByUsername = async (sock: any, username: string) => {
	const resolver = createFurinaResolver(sock)
	return resolver.searchByUsername(username)
}

export const getNewsletterInfo = async (sock: any, jidOrInvite: string) => {
	// TODO: Implement newsletter info fetching
	return null
}
