// USync Resolver - Advanced user information resolver using USync protocol
// Handles username search, user info fetching, and advanced queries

import { USyncQuery } from '../WAUSync/USyncQuery'
import { USyncUser } from '../WAUSync/USyncUser'

export interface UserInfo {
	jid?: string | null
	lid?: string | null
	pn?: string | null
	username?: string | null
	pushname?: string | null
	status?: string | null
	isBusiness?: boolean | null
	/** Verified business name (from the USync `business` protocol) */
	verifiedName?: string | null
	/** Business verification level, e.g. "high" / "low" */
	verifiedLevel?: string | null
	/** Business profile tag */
	profileTag?: string | null
}

export class USyncResolver {
	private sock: any

	constructor(sock: any) {
		this.sock = sock
	}

	async searchByUsername(username: string): Promise<UserInfo | null> {
		if (!username || username.trim().length === 0) return null
		const cleanUsername = username.trim().replace(/^@/, '')
		if (!cleanUsername) return null

		try {
			const q = new USyncQuery()
				.withMode('query')
				.withContext('interactive')
				.withUsernameProtocol()
				.withContactProtocol()
				.withLIDProtocol()
				.withBotProfileProtocol()
				.withBusinessProtocol()
			q.withUser(new USyncUser().withUsername(cleanUsername))

			// this.sock.executeUSyncQuery is not in public TypeSocket type, cast to access
			const res = await (this.sock as any).executeUSyncQuery(q)

			// Business accounts often come back addressed only by LID (no top-level <user jid>),
			// so we can't require `id`. Pick the first entry that carries *any* identifier.
			const list: any[] = Array.isArray(res?.list) ? res.list : []
			const entry = list.find(e => e && (e.id || e.lid || e.username))
			if (!entry) return null

			// Raw server entry — handy when diagnosing optional business metadata.
			this.sock?.logger?.debug?.({ entry }, 'USync raw entry')

			return USyncResolver.mapUsernameEntry(entry, cleanUsername)
		} catch (err) {
			this.sock?.logger?.warn?.({ err, username: cleanUsername }, 'searchByUsername failed')
			return null
		}
	}

	/**
	 * Normalise a parsed USync list entry into a {@link UserInfo}.
	 *
	 * Handles the shapes returned for business / LID-migrated accounts:
	 * - identifier may be only a LID (`entry.lid`) with no top-level `entry.id`
	 * - `entry.id` may itself be a LID, in which case `pn` stays null
	 * - business is signalled either by a bot profile (`entry.bot`) or an SMB marker
	 *   (`type="smb"` contact, `entry.smb` / `entry.business`)
	 */
	private static mapUsernameEntry(entry: any, cleanUsername: string): UserInfo {
		const rawId = typeof entry.id === 'string' && entry.id.length > 0 ? entry.id : null
		const lidFromProtocol = typeof entry.lid === 'string' && entry.lid.length > 0 ? entry.lid : null
		const idIsLid = !!rawId && rawId.endsWith('@lid')

		// Optional WS Business (SMB) metadata from the `business` protocol.
		const business =
			entry.business && typeof entry.business === 'object'
				? (entry.business as {
						verifiedName?: string | null
						verifiedLevel?: string | null
						profileTag?: string | null
						pnJid?: string | null
					})
				: undefined
		const businessPn = typeof business?.pnJid === 'string' && business.pnJid.length > 0 ? business.pnJid : null
		const hasBusinessData = !!(business?.verifiedName || business?.verifiedLevel || business?.profileTag || businessPn)

		const lid = idIsLid ? rawId : lidFromProtocol
		// Prefer the explicit JID; fall back to LID then to the business PN so
		// LID-only/PN-only accounts still yield a usable JID instead of null.
		const jid = rawId ?? lidFromProtocol ?? businessPn ?? null
		const pn = rawId && !idIsLid ? rawId : businessPn && !businessPn.endsWith('@lid') ? businessPn : null

		const botProfile = entry.bot
		// `USyncContactProtocol` surfaces the raw contact `type` as `contactType`
		// (e.g. "in" / "smb"), while `contact` stays boolean-compatible for other callers.
		const smbMarker =
			entry.smb === true || entry.business === true || entry.contactType === 'smb' || entry.contact === 'smb'

		return {
			jid,
			lid,
			pn,
			username: (entry.username as string) || cleanUsername,
			// Business if a bot profile, an SMB marker, or business metadata is present.
			isBusiness: botProfile || smbMarker || hasBusinessData ? true : null,
			verifiedName: business?.verifiedName ?? null,
			verifiedLevel: business?.verifiedLevel ?? null,
			profileTag: business?.profileTag ?? null,
			pushname: null,
			status: null
		}
	}

	async fetchUserInfo(jid: string): Promise<UserInfo | null> {
		try {
			// Use USync query with contact protocol
			const result = await this.sock.query({
				tag: 'iq',
				attrs: {
					to: 's.whatsapp.net',
					type: 'get',
					xmlns: 'usync'
				},
				content: [
					{
						tag: 'usync',
						attrs: {
							sid: this.sock.generateMessageTag(),
							mode: 'full',
							last: 'true',
							index: '0',
							context: 'interactive'
						},
						content: [
							{
								tag: 'list',
								attrs: {},
								content: [
									{
										tag: 'user',
										attrs: { jid }
									}
								]
							},
							{
								tag: 'query',
								attrs: {},
								content: [
									{ tag: 'contact', attrs: {} },
									{ tag: 'status', attrs: {} },
									{ tag: 'username', attrs: {} }
								]
							}
						]
					}
				]
			})

			const users = this.extractUsersFromUSync(result)
			return users[0] ?? null
		} catch (e) {
			return null
		}
	}

	async fetchStatus(jid: string): Promise<string | null> {
		try {
			const info = await this.fetchUserInfo(jid)
			return info?.status ?? null
		} catch (e) {
			return null
		}
	}

	private extractUsersFromUSync(result: any): UserInfo[] {
		const users: UserInfo[] = []

		if (!result?.content || !Array.isArray(result.content)) {
			return users
		}

		const walk = (node: any) => {
			if (!node) return

			if (node.tag === 'user') {
				const user: UserInfo = {}

				// Extract JID
				if (node.attrs?.jid) {
					user.jid = node.attrs.jid
				}

				// Extract children
				if (Array.isArray(node.content)) {
					for (const child of node.content) {
						if (child.tag === 'contact') {
							if (child.attrs?.jid) {
								if (child.attrs.jid.includes('@lid')) {
									user.lid = child.attrs.jid
								} else {
									user.pn = child.attrs.jid
								}
							}
						} else if (child.tag === 'status') {
							if (typeof child.content === 'string') {
								user.status = child.content
							}
						} else if (child.tag === 'username') {
							if (typeof child.content === 'string') {
								user.username = child.content
							}
						}
					}
				}

				users.push(user)
			}

			// Recurse
			if (Array.isArray(node.content)) {
				for (const child of node.content) {
					walk(child)
				}
			}
		}

		walk(result)
		return users
	}
}

// Singleton manager
const usyncInstances = new WeakMap<any, USyncResolver>()

export function getUSyncResolver(sock: any): USyncResolver {
	let resolver = usyncInstances.get(sock)
	if (!resolver) {
		resolver = new USyncResolver(sock)
		usyncInstances.set(sock, resolver)
	}
	return resolver
}
