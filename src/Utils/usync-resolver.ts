// USync Resolver - Advanced user information resolver using USync protocol
// Handles username search, user info fetching, and advanced queries

export interface UserInfo {
	jid?: string
	lid?: string
	pn?: string
	username?: string
	pushname?: string
	status?: string
	isBusiness?: boolean
}

export class USyncResolver {
	private sock: any

	constructor(sock: any) {
		this.sock = sock
	}

	async searchByUsername(username: string): Promise<UserInfo | null> {
		try {
			// Use USync query with username protocol
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
							mode: 'query',
							last: 'true',
							index: '0',
							context: 'interactive'
						},
						content: [
							{
								tag: 'query',
								attrs: {},
								content: [
									{
										tag: 'username',
										attrs: {},
										content: username
									}
								]
							}
						]
					}
				]
			})

			// Parse result
			const users = this.extractUsersFromUSync(result)
			return users[0] ?? null
		} catch (e) {
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
