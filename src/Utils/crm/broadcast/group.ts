// group.ts — utility group + kategorisasi struktur komunitas WA
// FIX: stripDevice sekarang preserve domain (@s.whatsapp.net / @lid)

export type CRMGroupCategory =
	| 'regular'
	| 'community-parent'
	| 'community-member'
	| 'community-announcement'

export interface CRMGroupInfo {
	jid: string
	subject: string
	participantCount: number
	adminCount: number
	category: CRMGroupCategory
	communityJid: string | null
}

export interface CRMGroupDetail extends CRMGroupInfo {
	owner: string | null
	admins: string[]
	desc: string | null
	creation: number | null
	inviteCode: string | null
	isBotMember: boolean
	isBotAdmin: boolean
	canSendMessage: boolean
}

function categorizeGroup(meta: any): { category: CRMGroupCategory; communityJid: string | null } {
	if (meta.isCommunity) {
		return { category: 'community-parent', communityJid: meta.id ?? null }
	}
	if (meta.isCommunityAnnounce) {
		return { category: 'community-announcement', communityJid: meta.linkedParent ?? null }
	}
	if (meta.linkedParent) {
		return { category: 'community-member', communityJid: meta.linkedParent }
	}
	return { category: 'regular', communityJid: null }
}

export async function listBotGroups(sock: any): Promise<CRMGroupInfo[]> {
	const groups: Record<string, any> = await sock.groupFetchAllParticipating()

	return Object.entries(groups).map(([jid, meta]: [string, any]) => {
		const participants = meta.participants ?? []
		const adminCount = participants.filter(
			(p: any) => p.admin === 'admin' || p.admin === 'superadmin'
		).length
		const { category, communityJid } = categorizeGroup(meta)

		return {
			jid,
			subject: meta.subject ?? 'Unknown Group',
			participantCount: participants.length,
			adminCount,
			category,
			communityJid,
		}
	})
}

export function filterGroupsByCategory(
	groups: CRMGroupInfo[],
	exclude: CRMGroupCategory[] = []
): CRMGroupInfo[] {
	return groups.filter((g) => !exclude.includes(g.category))
}

// FIXED: buang suffix device tapi PERTAHANKAN domain
// '6288216448588:52@s.whatsapp.net' → '6288216448588@s.whatsapp.net'
// '90525747179521:52@lid' → '90525747179521@lid'
function stripDevice(jid: string): string {
	if (!jid) return ''
	const atIdx = jid.indexOf('@')
	if (atIdx === -1) return jid.split(':')[0] ?? ''
	const user = jid.slice(0, atIdx).split(':')[0] ?? ''
	const server = jid.slice(atIdx)
	return user + server
}

function getBotIdentities(sock: any): string[] {
	const ids = new Set<string>()
	const candidates = [sock.user?.id, sock.user?.lid, sock.user?.pn]

	for (const c of candidates) {
		if (typeof c === 'string' && c.length > 0) {
			ids.add(c)
			ids.add(stripDevice(c))
		}
	}

	return Array.from(ids)
}

function matchBot(botIds: string[], p: any): boolean {
	const candidates = [p.id, p.phoneNumber, p.lid]

	for (const c of candidates) {
		if (typeof c === 'string' && c.length > 0) {
			if (botIds.includes(c) || botIds.includes(stripDevice(c))) return true
		}
	}

	return false
}

export async function getGroupDetail(sock: any, groupJid: string): Promise<CRMGroupDetail | null> {
	try {
		const meta = await sock.groupMetadata(groupJid)
		const participants = meta.participants ?? []
		const botIds = getBotIdentities(sock)

		const admins = participants
			.filter((p: any) => p.admin === 'admin' || p.admin === 'superadmin')
			.map((p: any) => p.id)

		const { category, communityJid } = categorizeGroup(meta)
		const canSendMessage = category !== 'community-parent'

		return {
			jid: groupJid,
			subject: meta.subject ?? 'Unknown Group',
			participantCount: participants.length,
			adminCount: admins.length,
			owner: meta.owner ?? null,
			admins,
			desc: typeof meta.desc === 'string' ? meta.desc : null,
			creation: typeof meta.creation === 'number' ? meta.creation : null,
			inviteCode: meta.inviteCode ?? null,
			category,
			communityJid,
			isBotMember: participants.some((p: any) => matchBot(botIds, p)),
			isBotAdmin: participants.some(
				(p: any) => matchBot(botIds, p) && (p.admin === 'admin' || p.admin === 'superadmin')
			),
			canSendMessage,
		}
	} catch (err) {
		return null
	}
}

export async function isBotMemberOfGroup(sock: any, groupJid: string): Promise<boolean> {
	try {
		const all = await sock.groupFetchAllParticipating()
		if (all && groupJid in all) return true

		const detail = await getGroupDetail(sock, groupJid)
		return detail?.isBotMember ?? false
	} catch (err) {
		return false
	}
}

export async function isBotAdminOfGroup(sock: any, groupJid: string): Promise<boolean> {
	try {
		const detail = await getGroupDetail(sock, groupJid)
		return detail?.isBotAdmin ?? false
	} catch (err) {
		return false
	}
}
