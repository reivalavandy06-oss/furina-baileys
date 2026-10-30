import { buildRetryReceipt } from '../../Socket/messages-recv'
import type { BinaryNode } from '../../WABinary'

const getChild = (node: BinaryNode, tag: string): BinaryNode | undefined =>
	(Array.isArray(node.content) ? node.content : []).find(c => c.tag === tag)

const makeRegistration = () => Buffer.from([0, 0, 0, 42])

describe('buildRetryReceipt', () => {
	it('addresses the retry receipt to the full sender JID (no device mangling)', () => {
		const receipt = buildRetryReceipt({
			msgId: 'self-receipt-id',
			retryCount: 1,
			fromJid: '1234567890@s.whatsapp.net',
			originalId: 'orig-msg-id',
			originalTimestamp: '1700000000',
			registration: makeRegistration()
		})

		expect(receipt.tag).toBe('receipt')
		expect(receipt.attrs.type).toBe('retry')
		expect(receipt.attrs.id).toBe('self-receipt-id')
		// Must be the exact sender JID, not a jidEncode(..., device, 0) reconstruction that
		// breaks LID/ADJID addressing and triggers smax-invalid (479).
		expect(receipt.attrs.to).toBe('1234567890@s.whatsapp.net')
	})

	it('preserves a LID sender address verbatim', () => {
		const receipt = buildRetryReceipt({
			msgId: 'r1',
			retryCount: 2,
			fromJid: '111222333444@lid',
			originalId: 'orig-2',
			registration: makeRegistration()
		})

		expect(receipt.attrs.to).toBe('111222333444@lid')
	})

	it('builds a <retry> child with only the valid count/id/t/v attributes', () => {
		const receipt = buildRetryReceipt({
			msgId: 'r2',
			retryCount: 3,
			fromJid: '1234567890@s.whatsapp.net',
			originalId: 'orig-3',
			originalTimestamp: '1700000123',
			registration: makeRegistration()
		})

		const retry = getChild(receipt, 'retry')
		expect(retry).toBeDefined()
		expect(retry!.attrs).toEqual({
			count: '3',
			id: 'orig-3',
			t: '1700000123',
			v: '1'
		})
		// Legacy/invalid attributes must not be present (they cause smax-invalid 479).
		expect(retry!.attrs).not.toHaveProperty('error')
		expect(retry!.attrs).not.toHaveProperty('jid')
		expect(retry!.attrs).not.toHaveProperty('type')
	})

	it('omits the timestamp attribute entirely when the original stanza had none', () => {
		const receipt = buildRetryReceipt({
			msgId: 'r3',
			retryCount: 1,
			fromJid: '1234567890@s.whatsapp.net',
			originalId: 'orig-4',
			registration: makeRegistration()
		})

		const retry = getChild(receipt, 'retry')
		expect(retry!.attrs).not.toHaveProperty('t')
		expect(JSON.stringify(receipt)).not.toContain('undefined')
	})

	it('includes the registration node with the encoded registration id', () => {
		const registration = makeRegistration()
		const receipt = buildRetryReceipt({
			msgId: 'r4',
			retryCount: 1,
			fromJid: '1234567890@s.whatsapp.net',
			originalId: 'orig-5',
			registration
		})

		const reg = getChild(receipt, 'registration')
		expect(reg).toBeDefined()
		expect(Buffer.isBuffer(reg!.content)).toBe(true)
		expect((reg!.content as Buffer).equals(registration)).toBe(true)
	})

	it('propagates recipient and participant only when provided', () => {
		const withoutExtras = buildRetryReceipt({
			msgId: 'r5',
			retryCount: 1,
			fromJid: '1234567890@s.whatsapp.net',
			originalId: 'orig-6',
			registration: makeRegistration()
		})
		expect(withoutExtras.attrs).not.toHaveProperty('recipient')
		expect(withoutExtras.attrs).not.toHaveProperty('participant')

		const withExtras = buildRetryReceipt({
			msgId: 'r6',
			retryCount: 1,
			fromJid: '1234567890@s.whatsapp.net',
			originalId: 'orig-7',
			registration: makeRegistration(),
			recipient: 'recipient@s.whatsapp.net',
			participant: '111222333444@lid'
		})
		expect(withExtras.attrs.recipient).toBe('recipient@s.whatsapp.net')
		expect(withExtras.attrs.participant).toBe('111222333444@lid')
	})
})
