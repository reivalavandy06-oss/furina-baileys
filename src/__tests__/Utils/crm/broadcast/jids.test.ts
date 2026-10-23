// jids.test.ts
// Test untuk jids whitelist di CRMBroadcastSegment

import { filterSegment, validateSegment } from '../../../../Utils/crm/broadcast/segment'
import type { CRMCustomer, CRMBroadcastSegment } from '../../../../Utils/crm/types'

function makeCustomer(overrides: Partial<CRMCustomer> = {}): CRMCustomer {
	const base: CRMCustomer = {
		jid: '6281234567890@s.whatsapp.net',
		lid: null,
		pn: null,
		pushname: 'Test User',
		status: 'active',
		tags: [],
		metadata: {},
		firstSeen: Date.now() - 86400000,
		lastSeen: Date.now(),
		messageCount: 1,
		createdAt: Date.now() - 86400000,
		updatedAt: Date.now()
	}
	return { ...base, ...overrides }
}

describe('CRMBroadcastSegment jids whitelist', () => {
	const customers = [
		makeCustomer({ jid: '6281234567890@s.whatsapp.net', tags: ['vip'] }),
		makeCustomer({ jid: '6282345678901@s.whatsapp.net', tags: ['vip'] }),
		makeCustomer({ jid: '6283456789012@s.whatsapp.net', tags: ['regular'] })
	]

	test('a. returns only customers in jids whitelist', () => {
		const segment: CRMBroadcastSegment = {
			jids: ['6281234567890@s.whatsapp.net', '6282345678901@s.whatsapp.net']
		}
		const result = filterSegment(customers, segment)
		expect(result).toHaveLength(2)
		expect(result.map(c => c.jid)).toEqual(
			expect.arrayContaining([
				'6281234567890@s.whatsapp.net',
				'6282345678901@s.whatsapp.net'
			])
		)
	})

	test('b. returns empty when jids kosong', () => {
		const segment: CRMBroadcastSegment = {
			jids: []
		}
		const result = filterSegment(customers, segment)
		expect(result).toHaveLength(0)
	})

	test('c. backward compat: no jids field = return all filtered', () => {
		const segment: CRMBroadcastSegment = {}
		const result = filterSegment(customers, segment)
		expect(result).toHaveLength(3)
	})

	test('d. jids AND dengan filter lain', () => {
		const customersWithStatus = [
			makeCustomer({ jid: '6281234567890@s.whatsapp.net', status: 'active', tags: ['vip'] }),      // A: active, in jids
			makeCustomer({ jid: '6282345678901@s.whatsapp.net', status: 'inactive', tags: ['vip'] }),   // B: inactive, NOT in jids
			makeCustomer({ jid: '6283456789012@s.whatsapp.net', status: 'inactive', tags: ['regular'] }) // C: inactive, in jids
		]
		const segment: CRMBroadcastSegment = {
			jids: ['6281234567890@s.whatsapp.net', '6283456789012@s.whatsapp.net'],
			status: 'active'
		}
		const result = filterSegment(customersWithStatus, segment)
		expect(result).toHaveLength(1)
		expect(result[0]?.jid).toBe('6281234567890@s.whatsapp.net')
	})

	test('e. jids dedupe pakai jidNormalizedUser', () => {
		const customerWithDevice = makeCustomer({
			jid: '6281234567890:5@s.whatsapp.net',
			tags: ['vip']
		})
		const segment: CRMBroadcastSegment = {
			jids: ['6281234567890@s.whatsapp.net']
		}
		const result = filterSegment([customerWithDevice], segment)
		expect(result).toHaveLength(1)
		expect(result[0]?.jid).toBe('6281234567890:5@s.whatsapp.net')
	})

	test('f. validateSegment detects jids as filter (tidak warning TANPA FILTER)', () => {
		const segment: CRMBroadcastSegment = {
			jids: ['6281234567890@s.whatsapp.net']
		}
		const { safe, warnings } = validateSegment(customers, segment)
		expect(safe).toBe(true)
		expect(warnings).toHaveLength(0)
	})
})