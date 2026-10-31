import type { USyncQueryProtocol } from '../Types/USync'
import { type BinaryNode, getBinaryNodeChild } from '../WABinary'
import { USyncBotProfileProtocol } from './Protocols/UsyncBotProfileProtocol'
import { USyncLIDProtocol } from './Protocols/UsyncLIDProtocol'
import { USyncBusinessProtocol } from './Protocols/USyncBusinessProtocol'
import {
	USyncContactProtocol,
	USyncDeviceProtocol,
	USyncDisappearingModeProtocol,
	USyncStatusProtocol,
	USyncUsernameProtocol
} from './Protocols'
import { USyncUser } from './USyncUser'

export type USyncQueryResultList = { [protocol: string]: unknown; id: string }

export type USyncQueryResult = {
	list: USyncQueryResultList[]
	sideList: USyncQueryResultList[]
}

export class USyncQuery {
	protocols: USyncQueryProtocol[]
	users: USyncUser[]
	context: string
	mode: string

	constructor() {
		this.protocols = []
		this.users = []
		this.context = 'interactive'
		this.mode = 'query'
	}

	withMode(mode: string) {
		this.mode = mode
		return this
	}

	withContext(context: string) {
		this.context = context
		return this
	}

	withUser(user: USyncUser) {
		this.users.push(user)
		return this
	}

	parseUSyncQueryResult(result: BinaryNode | undefined): USyncQueryResult | undefined {
		if (result?.attrs.type !== 'result') {
			return
		}

		const protocolMap = Object.fromEntries(
			this.protocols.map(protocol => {
				return [protocol.name, protocol.parser]
			})
		)

		const queryResult: USyncQueryResult = {
			// TODO: implement errors etc.
			list: [],
			sideList: []
		}

		const usyncNode = getBinaryNodeChild(result, 'usync')

		//TODO: implement error backoff, refresh etc.
		//TODO: see if there are any errors in the result node
		//const resultNode = getBinaryNodeChild(usyncNode, 'result')

		const listNode = usyncNode ? getBinaryNodeChild(usyncNode, 'list') : undefined

		if (listNode?.content && Array.isArray(listNode.content)) {
			queryResult.list = listNode.content.reduce((acc: USyncQueryResultList[], node) => {
				// Allow entries that lack a top-level `jid`: business / LID-migrated
				// accounts may be identified only by `lid` or `username` on the <user> node.
				const id = node?.attrs?.jid ?? node?.attrs?.lid ?? node?.attrs?.username
				if (id) {
					const data: Record<string, unknown> = {}

					if (Array.isArray(node?.content)) {
						for (const content of node.content) {
							const protocol = content.tag
							const parser = protocolMap[protocol]
							if (!parser) continue

							const parsed = parser(content)
							if (parsed === null) continue

							// Normalise the contact protocol: keep `contact` boolean-compatible for
							// existing callers (e.g. onWhatsApp) and surface the raw `type` separately
							// so business ("smb") markers are not lost.
							if (protocol === 'contact' && typeof parsed === 'object' && 'isContact' in parsed) {
								const contactResult = parsed as { isContact: boolean; type: string | null }
								data.contact = contactResult.isContact
								data.contactType = contactResult.type
							} else {
								data[protocol] = parsed
							}
						}
					}

					acc.push({ ...data, id })
				}

				return acc
			}, [])
		}

		//TODO: implement side list
		//const sideListNode = getBinaryNodeChild(usyncNode, 'side_list')
		return queryResult
	}

	withDeviceProtocol() {
		this.protocols.push(new USyncDeviceProtocol())
		return this
	}

	withContactProtocol() {
		this.protocols.push(new USyncContactProtocol())
		return this
	}

	withStatusProtocol() {
		this.protocols.push(new USyncStatusProtocol())
		return this
	}

	withDisappearingModeProtocol() {
		this.protocols.push(new USyncDisappearingModeProtocol())
		return this
	}

	withBotProfileProtocol() {
		this.protocols.push(new USyncBotProfileProtocol())
		return this
	}

	withLIDProtocol() {
		this.protocols.push(new USyncLIDProtocol())
		return this
	}

	withBusinessProtocol() {
		this.protocols.push(new USyncBusinessProtocol())
		return this
	}

	withUsernameProtocol() {
		this.protocols.push(new USyncUsernameProtocol())
		return this
	}
}
