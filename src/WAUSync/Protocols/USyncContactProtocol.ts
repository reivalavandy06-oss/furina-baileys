import type { USyncQueryProtocol } from '../../Types/USync'
import { assertNodeErrorFree, type BinaryNode } from '../../WABinary'
import { USyncUser } from '../USyncUser'

export class USyncContactProtocol implements USyncQueryProtocol {
	name = 'contact'

	getQueryElement(): BinaryNode {
		return {
			tag: 'contact',
			attrs: {}
		}
	}

	getUserElement(user: USyncUser): BinaryNode {
		if (user.phone) {
			return {
				tag: 'contact',
				attrs: {},
				content: user.phone
			}
		}

		if (user.username) {
			return {
				tag: 'contact',
				attrs: {
					username: user.username,
					...(user.usernameKey ? { pin: user.usernameKey } : {}),
					...(user.lid ? { lid: user.lid } : {})
				}
			}
		}

		if (user.type) {
			return {
				tag: 'contact',
				attrs: {
					type: user.type
				}
			}
		}

		return {
			tag: 'contact',
			attrs: {}
		}
	}

	parser(node: BinaryNode): { isContact: boolean; type: string | null } {
		if (node.tag === 'contact') {
			assertNodeErrorFree(node)
			const type = typeof node?.attrs?.type === 'string' ? node.attrs.type : null
			// `type="in"` means the user has us saved; `type="smb"` marks a business
			// account. Preserve the raw `type` instead of collapsing to a bare boolean
			// so downstream code can distinguish business (SMB) contacts.
			return { isContact: type === 'in', type }
		}

		return { isContact: false, type: null }
	}
}
