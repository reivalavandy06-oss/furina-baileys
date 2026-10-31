import { USyncBusinessProtocol } from '../../WAUSync/Protocols/USyncBusinessProtocol'
import type { BinaryNode } from '../../WABinary'

const empty = { verifiedName: null, verifiedLevel: null, profileTag: null, pnJid: null }

describe('USyncBusinessProtocol', () => {
	it('emits a <business> query element and no per-user element', () => {
		const protocol = new USyncBusinessProtocol()
		expect(protocol.getQueryElement()).toEqual({ tag: 'business', attrs: {} })
		expect(protocol.getUserElement()).toBeNull()
	})

	it('parses business metadata from child elements', () => {
		const node: BinaryNode = {
			tag: 'business',
			attrs: {},
			content: [
				{ tag: 'verified_name', attrs: {}, content: 'Acme Corp' },
				{ tag: 'verified_level', attrs: {}, content: 'high' },
				{ tag: 'profile_tag', attrs: {}, content: 'retail' },
				{ tag: 'jid', attrs: {}, content: '123@s.whatsapp.net' }
			]
		}

		expect(new USyncBusinessProtocol().parser(node)).toEqual({
			verifiedName: 'Acme Corp',
			verifiedLevel: 'high',
			profileTag: 'retail',
			pnJid: '123@s.whatsapp.net'
		})
	})

	it('parses business metadata from attributes (and profile child)', () => {
		const node: BinaryNode = {
			tag: 'business',
			attrs: { verified_name: 'Attr Co', verified_level: 'low', profile_tag: 'x', jid: '456@s.whatsapp.net' },
			content: []
		}

		expect(new USyncBusinessProtocol().parser(node)).toEqual({
			verifiedName: 'Attr Co',
			verifiedLevel: 'low',
			profileTag: 'x',
			pnJid: '456@s.whatsapp.net'
		})
	})

	it('returns nulls (without throwing) when the node carries an error', () => {
		const node: BinaryNode = {
			tag: 'business',
			attrs: {},
			content: [{ tag: 'error', attrs: { code: '404', text: 'not found' } }]
		}

		expect(() => new USyncBusinessProtocol().parser(node)).not.toThrow()
		expect(new USyncBusinessProtocol().parser(node)).toEqual(empty)
	})

	it('returns nulls for a non-business node', () => {
		const node: BinaryNode = { tag: 'contact', attrs: { type: 'in' } }
		expect(new USyncBusinessProtocol().parser(node)).toEqual(empty)
	})
})
