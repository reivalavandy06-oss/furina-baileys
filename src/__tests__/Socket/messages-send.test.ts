import { isLidUser, isPnUser } from '../../WABinary'
import { resolveStatusAddressing } from '../../Socket/messages-send'

const ME_ID = '628111111111@s.whatsapp.net'
const ME_LID = '999999999999@lid'

describe('resolveStatusAddressing', () => {
	it('uses LID addressing and LID sender identity for a LID account', () => {
		const result = resolveStatusAddressing({ meId: ME_ID, meLid: ME_LID })

		expect(result.addressingMode).toBe('lid')
		expect(result.senderIdentity).toBe(ME_LID)
	})

	it('maps PN recipients to LID for a LID account (prevents smax-invalid 479)', () => {
		const lidByPn: Record<string, string> = {
			'628222222222@s.whatsapp.net': '111111111111@lid',
			'628333333333@s.whatsapp.net': '222222222222@lid'
		}
		const result = resolveStatusAddressing({
			meId: ME_ID,
			meLid: ME_LID,
			recipients: ['628222222222@s.whatsapp.net', '628333333333@s.whatsapp.net'],
			resolveLid: pn => lidByPn[pn]
		})

		expect(result.addressingMode).toBe('lid')
		expect(result.recipients).toEqual(['111111111111@lid', '222222222222@lid'])
		expect(result.recipients.every(jid => isLidUser(jid))).toBe(true)
	})

	it('keeps LID recipients as LID and does not re-map them', () => {
		const result = resolveStatusAddressing({
			meId: ME_ID,
			meLid: ME_LID,
			recipients: ['444444444444@lid'],
			resolveLid: () => 'should-not-be-used@lid'
		})

		expect(result.recipients).toEqual(['444444444444@lid'])
	})

	it('falls back to the original PN when no LID mapping is known', () => {
		const result = resolveStatusAddressing({
			meId: ME_ID,
			meLid: ME_LID,
			recipients: ['628555555555@s.whatsapp.net'],
			resolveLid: () => undefined
		})

		expect(result.recipients).toEqual(['628555555555@s.whatsapp.net'])
		expect(result.recipients.every(jid => isPnUser(jid))).toBe(true)
	})

	it('deduplicates recipients that resolve to the same address', () => {
		const result = resolveStatusAddressing({
			meId: ME_ID,
			meLid: ME_LID,
			recipients: ['628222222222@s.whatsapp.net', '111111111111@lid', '628222222222:3@s.whatsapp.net'],
			resolveLid: pn => (pn.startsWith('628222222222') ? '111111111111@lid' : undefined)
		})

		expect(result.recipients).toEqual(['111111111111@lid'])
	})

	it('keeps PN addressing for a PN-only account (no regression)', () => {
		const result = resolveStatusAddressing({
			meId: ME_ID,
			recipients: ['628222222222@s.whatsapp.net', '628333333333@s.whatsapp.net'],
			resolveLid: () => 'should-not-be-used@lid'
		})

		expect(result.addressingMode).toBe('pn')
		expect(result.senderIdentity).toBe(ME_ID)
		// PN account must not remap recipients to LID
		expect(result.recipients).toEqual(['628222222222@s.whatsapp.net', '628333333333@s.whatsapp.net'])
	})

	it('handles an undefined recipient list', () => {
		const result = resolveStatusAddressing({ meId: ME_ID, meLid: ME_LID })
		expect(result.recipients).toEqual([])
	})
})
