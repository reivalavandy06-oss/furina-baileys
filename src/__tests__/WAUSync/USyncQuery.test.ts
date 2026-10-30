import { USyncContactProtocol } from '../../WAUSync/Protocols/USyncContactProtocol'
import { USyncQuery } from '../../WAUSync/USyncQuery'
import type { BinaryNode } from '../../WABinary'

const userNode = (attrs: BinaryNode['attrs'], content: BinaryNode[] = []): BinaryNode => ({
	tag: 'user',
	attrs,
	content
})

const resultNode = (users: BinaryNode[]): BinaryNode => ({
	tag: 'iq',
	attrs: { type: 'result' },
	content: [{ tag: 'usync', attrs: {}, content: [{ tag: 'list', attrs: {}, content: users }] }]
})

describe('USyncContactProtocol.parser', () => {
	it('preserves the raw contact type instead of collapsing to a boolean', () => {
		const parser = new USyncContactProtocol()
		expect(parser.parser({ tag: 'contact', attrs: { type: 'in' } })).toEqual({ isContact: true, type: 'in' })
		expect(parser.parser({ tag: 'contact', attrs: { type: 'smb' } })).toEqual({ isContact: false, type: 'smb' })
		expect(parser.parser({ tag: 'contact', attrs: {} })).toEqual({ isContact: false, type: null })
	})
})

describe('USyncQuery.parseUSyncQueryResult', () => {
	it('keeps `contact` boolean-compatible and exposes `contactType`', () => {
		const q = new USyncQuery().withContactProtocol()
		const parsed = q.parseUSyncQueryResult(
			resultNode([userNode({ jid: '1@s.whatsapp.net' }, [{ tag: 'contact', attrs: { type: 'in' } }])])
		)

		const entry = parsed!.list[0] as unknown as { contact: boolean; contactType: string | null; id: string }
		expect(entry.contact).toBe(true)
		expect(entry.contactType).toBe('in')
		expect(entry.id).toBe('1@s.whatsapp.net')
	})

	it('surfaces business type="smb" without flagging it as a saved contact', () => {
		const q = new USyncQuery().withContactProtocol()
		const parsed = q.parseUSyncQueryResult(
			resultNode([userNode({ jid: '2@s.whatsapp.net' }, [{ tag: 'contact', attrs: { type: 'smb' } }])])
		)

		const entry = parsed!.list[0] as unknown as { contact: boolean; contactType: string | null }
		expect(entry.contact).toBe(false)
		expect(entry.contactType).toBe('smb')
	})

	it('does not drop entries that have no <user jid> but carry a lid attribute', () => {
		const q = new USyncQuery().withLIDProtocol().withUsernameProtocol()
		const parsed = q.parseUSyncQueryResult(
			resultNode([
				userNode({ lid: '999@lid' }, [
					{ tag: 'username', attrs: {}, content: 'bizonlylid' },
					{ tag: 'lid', attrs: { val: '999@lid' } }
				])
			])
		)

		expect(parsed!.list).toHaveLength(1)
		const entry = parsed!.list[0] as unknown as { id: string; lid: string; username: string }
		expect(entry.id).toBe('999@lid')
		expect(entry.lid).toBe('999@lid')
		expect(entry.username).toBe('bizonlylid')
	})

	it('does not drop entries that carry only a username attribute', () => {
		const q = new USyncQuery().withUsernameProtocol()
		const parsed = q.parseUSyncQueryResult(
			resultNode([userNode({ username: 'onlyname' }, [{ tag: 'username', attrs: {}, content: 'onlyname' }])])
		)

		expect(parsed!.list).toHaveLength(1)
		expect((parsed!.list[0] as unknown as { id: string }).id).toBe('onlyname')
	})

	it('still drops entries with no identifier at all', () => {
		const q = new USyncQuery().withUsernameProtocol()
		const parsed = q.parseUSyncQueryResult(resultNode([userNode({}, [{ tag: 'username', attrs: {}, content: 'x' }])]))

		expect(parsed!.list).toHaveLength(0)
	})
})
