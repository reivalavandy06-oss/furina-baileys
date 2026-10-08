import { createFurinaResolver } from '../../Utils/furina-resolver'
import { normalizeJid } from '../../Utils/lid-resolver'

const DEVICE_12 = '628123456789:12@s.whatsapp.net'
const DEVICE_34 = '628123456789:34@s.whatsapp.net'
const CANONICAL = '628123456789@s.whatsapp.net'

// Resolver di-cache per socket, jadi tiap test pakai sock baru agar state
// antar test tidak saling bocor.
const makeSock = () => ({
	ev: { on: () => {} },
	signalRepository: undefined
})

describe('furina-resolver identity normalization', () => {
	it('resolves two device JIDs of the same user to one identifier', async () => {
		const resolver = createFurinaResolver(makeSock())

		expect(await resolver.resolveTarget(DEVICE_12)).toBe(CANONICAL)
		expect(await resolver.resolveTarget(DEVICE_34)).toBe(CANONICAL)
	})

	it('keeps group, status, broadcast and newsletter JIDs on their own server', async () => {
		const resolver = createFurinaResolver(makeSock())

		expect(await resolver.resolveTarget('1234567890-1234@g.us')).toBe('1234567890-1234@g.us')
		expect(await resolver.resolveTarget('status@broadcast')).toBe('status@broadcast')
		expect(await resolver.resolveTarget('123456789@newsletter')).toBe('123456789@newsletter')
	})

	it('strips the LID device suffix but keeps the lid server', async () => {
		const resolver = createFurinaResolver(makeSock())

		expect(await resolver.resolveTarget('99887766:12@lid')).toBe('99887766@lid')
		expect(await resolver.resolveTarget('99887766:34@lid')).toBe('99887766@lid')
	})

	it('returns null instead of a broken JID when input is undecodable', async () => {
		const resolver = createFurinaResolver(makeSock())

		expect(await resolver.resolveTarget('user@')).toBeNull()
	})

	it('builds the same wa.me link for both device JIDs', async () => {
		const resolver = createFurinaResolver(makeSock())

		expect(await resolver.toWhatsAppLink(DEVICE_12)).toBe('https://wa.me/628123456789')
		expect(await resolver.toWhatsAppLink(DEVICE_34)).toBe('https://wa.me/628123456789')
	})

	it('strips the agent suffix when building a wa.me link', async () => {
		// JID bisa punya agent suffix (user_1:5@server), yang tidak tertangkap
		// kalau bagian user ditelusuri dengan split('@')/split(':').
		const resolver = createFurinaResolver(makeSock())

		expect(await resolver.toWhatsAppLink('628123456789_1:5@s.whatsapp.net')).toBe(
			'https://wa.me/628123456789'
		)
	})

	it('refuses to build a wa.me link for a group', async () => {
		const resolver = createFurinaResolver(makeSock())

		expect(await resolver.toWhatsAppLink('1234567890-1234@g.us')).toBeNull()
	})
})

describe('normalizeJid (lid-resolver, kept for backward compat)', () => {
	it('delegates to the canonical normalizer', () => {
		expect(normalizeJid('99887766:12@lid')).toBe('99887766@lid')
		expect(normalizeJid('628123456789:34@s.whatsapp.net')).toBe('628123456789@s.whatsapp.net')
	})

	it('returns the input untouched when it cannot be decoded', () => {
		expect(normalizeJid('bukan-jid')).toBe('bukan-jid')
		expect(normalizeJid('')).toBe('')
	})
})
