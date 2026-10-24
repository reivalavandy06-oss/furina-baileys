// usync-resolver.test.ts
// Test untuk USyncResolver.searchByUsername menggunakan executeUSyncQuery engine

import { USyncResolver } from '../../Utils/usync-resolver'
import type { UserInfo } from '../../Utils/usync-resolver'
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
})