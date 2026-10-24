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
}

export class USyncResolver {
	private sock: any

	constructor(sock: any) {
		this.sock = sock
	}

async searchByUsername(username: string): Promise<UserInfo | null> {
		if (!username || username.trim().length === 0) return null
		const cleanUsername = username.trim().replace(/^@/, '')

		try {
			const q = new USyncQuery()
				.withMode('query')
				.withContext('interactive')
				.withUsernameProtocol()
				.withContactProtocol()
				.withLIDProtocol()
				.withBotProfileProtocol()
			q.withUser(new USyncUser().withUsername(cleanUsername))

			// this.sock.executeUSyncQuery is not in public TypeSocket type, cast to access
			const res = await (this.sock as any).executeUSyncQuery(q)
			const entry = res?.list?.[0]
			if (!entry) return null

			const idIsLid = typeof entry.id === 'string' && entry.id.endsWith('@lid')
			const lidFromProtocol = (entry.lid as string) ?? null
			
			// Detect business: contact protocol returns true for regular contacts (type='in')
			// Business accounts may return false or different type
			const contactResult = entry.contact as boolean | undefined
			const botProfile = entry.bot as any
			
			return {
				jid: entry.id ?? null,
				lid: idIsLid ? entry.id : lidFromProtocol,
				pn: idIsLid ? null : (entry.id ?? null),
				username: (entry.username as string) ?? cleanUsername,
				// Business if bot profile exists OR contact is not a regular 'in' contact
				isBusiness: botProfile ? true : (contactResult === false ? true : null),
				pushname: null,
				status: null,
			}
		} catch (err) {
			this.sock?.logger?.warn?.({ err, username: cleanUsername }, 'searchByUsername failed')
			return null
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
