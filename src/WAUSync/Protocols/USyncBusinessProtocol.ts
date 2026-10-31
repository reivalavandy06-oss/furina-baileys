import type { USyncQueryProtocol } from '../../Types/USync'
import { type BinaryNode, getBinaryNodeChild, getBinaryNodeChildString } from '../../WABinary'

export type BusinessProfileInfo = {
	verifiedName: string | null
	verifiedLevel: string | null
	profileTag: string | null
	pnJid: string | null
}

const emptyBusinessProfile = (): BusinessProfileInfo => ({
	verifiedName: null,
	verifiedLevel: null,
	profileTag: null,
	pnJid: null
})

/**
 * USync `business` protocol — requests WhatsApp Business (SMB) profile metadata
 * alongside a username lookup so callers can enrich the result with the verified
 * name / level of business accounts.
 *
 * Adapted from the `findUserByUsername` approach used by `@vanzxy/baileys`
 * (and `innovatorssoft/Baileys`). The server payload is parsed defensively: business
 * metadata is optional enrichment, so a missing/empty `<business>` node (or one that
 * carries an `<error>`) must never abort the whole USync parse — unlike required
 * protocols we don't call `assertNodeErrorFree` here.
 */
export class USyncBusinessProtocol implements USyncQueryProtocol {
	name = 'business'

	getQueryElement(): BinaryNode {
		return {
			tag: 'business',
			attrs: {}
		}
	}

	getUserElement(): null {
		return null
	}

	parser(node: BinaryNode): BusinessProfileInfo {
		if (node.tag !== 'business') {
			return emptyBusinessProfile()
		}

		const profileNode = getBinaryNodeChild(node, 'profile')

		const pick = (attrKeys: string[], childTags: string[]): string | null => {
			for (const key of attrKeys) {
				const value = node.attrs[key] ?? profileNode?.attrs?.[key]
				if (typeof value === 'string' && value.length > 0) return value
			}

			for (const tag of childTags) {
				const value = getBinaryNodeChildString(node, tag) ?? getBinaryNodeChildString(profileNode, tag)
				if (typeof value === 'string' && value.length > 0) return value
			}

			return null
		}

		return {
			verifiedName: pick(['verified_name', 'verifiedName', 'name'], ['verified_name', 'verifiedName', 'name']),
			verifiedLevel: pick(['verified_level', 'verifiedLevel', 'level'], ['verified_level', 'verifiedLevel', 'level']),
			profileTag: pick(['profile_tag', 'profileTag', 'tag'], ['profile_tag', 'profileTag', 'tag']),
			pnJid: pick(['jid', 'pn_jid', 'pn'], ['jid', 'pn_jid', 'pn'])
		}
	}
}
