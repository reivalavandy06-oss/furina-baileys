// usync-resolver.test.ts
// Test untuk USyncResolver.searchByUsername menggunakan executeUSyncQuery engine

import { USyncResolver } from '../../Utils/usync-resolver'
import { USyncQuery } from '../../WAUSync/USyncQuery'
import { jest } from '@jest/globals'

const makeMockSock = (executeUSyncQueryResult: any) => {
	const executeUSyncQuery = (jest.fn() as any).mockResolvedValue(executeUSyncQueryResult)
	return {
		ev: { on: () => {} },
		logger: { warn: jest.fn() },
		executeUSyncQuery,
		generateMessageTag: () => 'test-tag',
	}
}

/** Raw USync iq result wrapping the given <user> nodes. */
const rawUsyncResult = (users: any[]) => ({
	tag: 'iq',
	attrs: { type: 'result' },
	content: [{ tag: 'usync', attrs: {}, content: [{ tag: 'list', attrs: {}, content: users }] }]
})

/** Sock whose executeUSyncQuery runs the real USyncQuery parser on a raw response. */
const makeParsingSock = (raw: any) => ({
	ev: { on: () => {} },
	logger: { warn: jest.fn() },
	generateMessageTag: () => 'test-tag',
	executeUSyncQuery: (q: any) => Promise.resolve(q.parseUSyncQueryResult(raw))
})

describe('USyncResolver.searchByUsername', () => {
	test('returns UserInfo on success', async () => {
		const mockResult = {
			list: [
				{
					id: '123@lid',
					contact: true,
					lid: '123@lid',
					username: 'testuser',
				},
			],
		}
		const sock = makeMockSock(mockResult)
		const resolver = new USyncResolver(sock)

		const result = await resolver.searchByUsername('testuser')

		expect(result).not.toBeNull()
		expect(result?.jid).toBe('123@lid')
		expect(result?.lid).toBe('123@lid')
		expect(result?.pn).toBeNull()
		expect(result?.isBusiness).toBeNull()
		expect(result?.username).toBe('testuser')
		expect(sock.executeUSyncQuery).toHaveBeenCalled()
	})

	test('returns null when result list is empty', async () => {
		const sock = makeMockSock({ list: [] })
		const resolver = new USyncResolver(sock)

		const result = await resolver.searchByUsername('nonexistent')

		expect(result).toBeNull()
	})

	test('returns null on error', async () => {
		const sock = makeMockSock({})
		sock.executeUSyncQuery = (jest.fn() as any).mockRejectedValue(new Error('network error'))
		const resolver = new USyncResolver(sock)

		const result = await resolver.searchByUsername('testuser')

		expect(result).toBeNull()
		expect(sock.logger.warn).toHaveBeenCalled()
	})

	test('handles username with leading @', async () => {
		const mockResult = {
			list: [
				{
					id: '456@s.whatsapp.net',
					contact: true,
					lid: '456@lid',
					username: 'atuser',
				},
			],
		}
		const sock = makeMockSock(mockResult)
		const resolver = new USyncResolver(sock)

		const result = await resolver.searchByUsername('@atuser')

		expect(result).not.toBeNull()
		expect(result?.username).toBe('atuser')
	})

	test('detects business account via bot profile', async () => {
		const mockResult = {
			list: [
				{
					id: '789@lid',
					contact: true,
					lid: '789@lid',
					username: 'businessuser',
					bot: { name: 'Business Bot', category: 'business' },
				},
			],
		}
		const sock = makeMockSock(mockResult)
		const resolver = new USyncResolver(sock)

		const result = await resolver.searchByUsername('businessuser')

		expect(result).not.toBeNull()
		expect(result?.lid).toBe('789@lid')
		expect(result?.isBusiness).toBe(true)
	})

	test('resolves a LID-only business account (no <user jid>) through the real parser', async () => {
		// Business / LID-migrated accounts can come back addressed only by `lid`, with no
		// top-level `jid`. The parser must keep the entry and the resolver return a valid JID.
		const raw = rawUsyncResult([
			{
				tag: 'user',
				attrs: { lid: '999@lid' },
				content: [
					{ tag: 'contact', attrs: { type: 'smb' } },
					{ tag: 'username', attrs: {}, content: 'bizonlylid' },
					{ tag: 'lid', attrs: { val: '999@lid' } }
				]
			}
		])

		const resolver = new USyncResolver(makeParsingSock(raw))
		const result = await resolver.searchByUsername('bizonlylid')

		expect(result).not.toBeNull()
		expect(result?.jid).toBe('999@lid')
		expect(result?.lid).toBe('999@lid')
		expect(result?.pn).toBeNull()
		expect(result?.isBusiness).toBe(true)
	})

	test('detects business (SMB) via type="smb" through the real parser', async () => {
		const raw = rawUsyncResult([
			{
				tag: 'user',
				attrs: { jid: '555@s.whatsapp.net' },
				content: [
					{ tag: 'contact', attrs: { type: 'smb' } },
					{ tag: 'username', attrs: {}, content: 'smbbiz' },
					{ tag: 'lid', attrs: { val: '555@lid' } }
				]
			}
		])

		const resolver = new USyncResolver(makeParsingSock(raw))
		const result = await resolver.searchByUsername('smbbiz')

		expect(result).not.toBeNull()
		expect(result?.jid).toBe('555@s.whatsapp.net')
		expect(result?.pn).toBe('555@s.whatsapp.net')
		expect(result?.lid).toBe('555@lid')
		expect(result?.isBusiness).toBe(true)
	})

	test('keeps contact boolean-compatible and does not flag type="in" as business', async () => {
		// Backward-compat: the contact protocol still exposes a boolean `contact`
		// (consumed by onWhatsApp) while `contactType` carries the raw type.
		const raw = rawUsyncResult([
			{
				tag: 'user',
				attrs: { jid: '123@s.whatsapp.net' },
				content: [{ tag: 'contact', attrs: { type: 'in' } }, { tag: 'username', attrs: {}, content: 'regular' }]
			}
		])

		const parsed = new USyncQuery()
			.withContactProtocol()
			.withUsernameProtocol()
			.parseUSyncQueryResult(raw)
		const entry = parsed?.list[0] as any
		expect(entry.contact).toBe(true)
		expect(entry.contactType).toBe('in')

		const resolver = new USyncResolver(makeParsingSock(raw))
		const result = await resolver.searchByUsername('regular')
		expect(result?.isBusiness).toBeNull()
	})

	test('keeps the entry when only a username attribute is present', async () => {
		const raw = rawUsyncResult([
			{
				tag: 'user',
				attrs: { username: 'onlyname' },
				content: [{ tag: 'username', attrs: {}, content: 'onlyname' }]
			}
		])

		const parsed = new USyncQuery().withUsernameProtocol().parseUSyncQueryResult(raw)
		expect(parsed?.list).toHaveLength(1)
		expect((parsed?.list[0] as any).id).toBe('onlyname')
	})

	test('surfaces WhatsApp Business metadata via the business protocol', async () => {
		const raw = rawUsyncResult([
			{
				tag: 'user',
				attrs: { lid: '999@lid' },
				content: [
					{ tag: 'username', attrs: {}, content: 'acmebiz' },
					{ tag: 'lid', attrs: { val: '999@lid' } },
					{
						tag: 'business',
						attrs: {},
						content: [
							{ tag: 'verified_name', attrs: {}, content: 'Acme Corp' },
							{ tag: 'verified_level', attrs: {}, content: 'high' },
							{ tag: 'profile_tag', attrs: {}, content: 'retail' },
							{ tag: 'jid', attrs: {}, content: '999@s.whatsapp.net' }
						]
					}
				]
			}
		])

		const resolver = new USyncResolver(makeParsingSock(raw))
		const result = await resolver.searchByUsername('acmebiz')

		expect(result).not.toBeNull()
		expect(result?.jid).toBe('999@lid')
		expect(result?.lid).toBe('999@lid')
		expect(result?.pn).toBe('999@s.whatsapp.net')
		expect(result?.isBusiness).toBe(true)
		expect(result?.verifiedName).toBe('Acme Corp')
		expect(result?.verifiedLevel).toBe('high')
		expect(result?.profileTag).toBe('retail')
	})
})
