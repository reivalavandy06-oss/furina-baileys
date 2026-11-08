import { jest } from '@jest/globals'
import { proto } from '../../../../WAProto'
import { applyAiMetadata } from '../../../Utils/ai-metadata'
import { EVENT_INVITE_META, sendEventInvite, toUnixSeconds } from '../../../Utils/messaging/event-invite'
import type { FurinaSocket } from '../../../Utils/messaging/types'
import type { WAMessage } from '../../../Types'

const makeSock = () => {
	const calls: { jid: string; content: proto.IMessage; options?: unknown; returnId?: string }[] = []
	let returns = ''
	const sock = {
		relayMessage: async (jid: string, content: proto.IMessage, options?: unknown) => {
			calls.push({ jid, content, options })
			returns = typeof returns === 'string' ? returns : returns
			return { key: { id: String(returns || 'MSG'), remoteJid: jid } } as WAMessage
		},
		waUploadToServer: async () => ({ mediaUrl: 'https://mmg/x', directPath: '/x' })
	} as unknown as FurinaSocket

	return { sock, calls }
}

// ── Langkah 1: AI marker on relayMessage ─────────────────────────────────
describe('applyAiMetadata', () => {
	afterEach(() => jest.restoreAllMocks())

	it('injects botMetadata with a generated response id', () => {
		const message: proto.IMessage = { extendedTextMessage: { text: 'hi' } }
		applyAiMetadata(message)

		const bot = message.messageContextInfo?.botMetadata
		expect(bot?.botResponseId).toBeTruthy()
		expect(bot?.botModeSelectionMetadata?.mode).toEqual([
			proto.BotModeSelectionMetadata.BotUserSelectionMode.REASONING_MODE
		])
	})

	it('honours a caller-supplied response id', () => {
		const message: proto.IMessage = {}
		applyAiMetadata(message, 'RESPONSE_1')
		expect(message.messageContextInfo?.botMetadata?.botResponseId).toBe('RESPONSE_1')
	})

	it('preserves existing botMetadata fields', () => {
		const message: proto.IMessage = {
			messageContextInfo: { botMetadata: { personaId: 'p1', invokerJid: 'x@s.whatsapp.net' } }
		}
		applyAiMetadata(message, 'R1')

		const bot = message.messageContextInfo?.botMetadata
		expect(bot?.personaId).toBe('p1')
		expect(bot?.invokerJid).toBe('x@s.whatsapp.net')
		expect(bot?.botResponseId).toBe('R1')
	})

	it('is a no-op on an empty message', () => {
		expect(() => applyAiMetadata(undefined as never)).not.toThrow()
	})
})

// ── Langkah 2: event invites ─────────────────────────────────────────────
describe('sendEventInvite', () => {
	it('builds an eventMessage with normalised start time', async () => {
		const { sock, calls } = makeSock()
		const start = new Date('2026-12-01T10:00:00Z')

		await sendEventInvite(sock, '6281234567890@s.whatsapp.net', {
			eventTitle: 'Rapat Tim',
			startTime: start,
			description: 'Diskusi sprint'
		})

		expect(calls).toHaveLength(1)
		const event = calls[0]!.content.eventMessage
		expect(event?.name).toBe('Rapat Tim')
		expect(event?.description).toBe('Diskusi sprint')
		expect(event?.startTime).toBe(Math.floor(start.getTime() / 1000))
	})

	it('normalises the jid', async () => {
		const { sock, calls } = makeSock()
		await sendEventInvite(sock, '6281234567890:11@s.whatsapp.net', {
			eventTitle: 'x',
			startTime: 1_800_000_000
		})
		expect(calls[0]!.jid).toBe('6281234567890@s.whatsapp.net')
	})

	it('attaches the event_invitation meta node', async () => {
		const { sock, calls } = makeSock()
		await sendEventInvite(sock, '628@s.whatsapp.net', {
			eventTitle: 'x',
			startTime: 1_800_000_000
		})

		const nodes = (calls[0]!.options as { additionalNodes?: { tag: string; attrs?: Record<string, string> }[] })
			.additionalNodes
		const meta = nodes?.find(node => node.tag === 'meta')
		expect(meta?.attrs).toMatchObject(EVENT_INVITE_META)
	})

	it('uses eventId as the messageId', async () => {
		const { sock, calls } = makeSock()
		await sendEventInvite(sock, '628@s.whatsapp.net', {
			eventId: 'EVT_1',
			eventTitle: 'x',
			startTime: 1_800_000_000
		})

		expect((calls[0]!.options as { messageId?: string }).messageId).toBe('EVT_1')
	})

	it('encodes a Buffer thumbnail as base64 on the meta node', async () => {
		const { sock, calls } = makeSock()
		await sendEventInvite(sock, '628@s.whatsapp.net', {
			eventTitle: 'x',
			startTime: 1_800_000_000,
			jpegThumbnail: Buffer.from('img')
		})

		const nodes = (calls[0]!.options as { additionalNodes?: { tag: string; attrs?: Record<string, string> }[] })
			.additionalNodes
		const meta = nodes?.find(node => node.tag === 'meta')
		expect(meta?.attrs?.['jpeg_thumbnail']).toBe(Buffer.from('img').toString('base64'))
	})

	it('passes a string thumbnail through unchanged', async () => {
		const { sock, calls } = makeSock()
		await sendEventInvite(sock, '628@s.whatsapp.net', {
			eventTitle: 'x',
			startTime: 1_800_000_000,
			jpegThumbnail: 'BASE64DATA'
		})

		const nodes = (calls[0]!.options as { additionalNodes?: { tag: string; attrs?: Record<string, string> }[] })
			.additionalNodes
		expect(nodes?.find(node => node.tag === 'meta')?.attrs?.['jpeg_thumbnail']).toBe('BASE64DATA')
	})

	it('preserves caller-supplied additionalNodes', async () => {
		const { sock, calls } = makeSock()
		await sendEventInvite(
			sock,
			'628@s.whatsapp.net',
			{ eventTitle: 'x', startTime: 1_800_000_000 },
			{ additionalNodes: [{ tag: 'custom', attrs: { a: '1' } }] }
		)

		const nodes = (calls[0]!.options as { additionalNodes?: { tag: string }[] }).additionalNodes
		expect(nodes?.map(node => node.tag)).toEqual(['custom', 'meta'])
	})

	it('puts messageSecret on messageContextInfo', async () => {
		const { sock, calls } = makeSock()
		await sendEventInvite(sock, '628@s.whatsapp.net', {
			eventTitle: 'x',
			startTime: 1_800_000_000,
			messageSecret: new Uint8Array(32).fill(7)
		})

		expect(calls[0]!.content.messageContextInfo?.messageSecret).toEqual(new Uint8Array(32).fill(7))
	})

	it('normalises an end time', async () => {
		const { sock, calls } = makeSock()
		await sendEventInvite(sock, '628@s.whatsapp.net', {
			eventTitle: 'x',
			startTime: new Date('2026-12-01T10:00:00Z'),
			endTime: new Date('2026-12-01T11:00:00Z')
		})

		expect(calls[0]!.content.eventMessage?.endTime).toBe(Math.floor(new Date('2026-12-01T11:00:00Z').getTime() / 1000))
	})

	it('rejects an empty title', async () => {
		const { sock } = makeSock()
		await expect(
			sendEventInvite(sock, '628@s.whatsapp.net', { eventTitle: '   ', startTime: 1_800_000_000 })
		).rejects.toThrow(/eventTitle wajib/)
	})

	it('rejects an invalid start time', async () => {
		const { sock } = makeSock()
		await expect(sendEventInvite(sock, '628@s.whatsapp.net', { eventTitle: 'x', startTime: 0 })).rejects.toThrow(
			/startTime tidak valid/
		)
		await expect(
			sendEventInvite(sock, '628@s.whatsapp.net', { eventTitle: 'x', startTime: Number.NaN })
		).rejects.toThrow(/startTime tidak valid/)
	})

	it('rejects an invalid jid', async () => {
		const { sock } = makeSock()
		await expect(sendEventInvite(sock, '', { eventTitle: 'x', startTime: 1_800_000_000 })).rejects.toThrow(
			/Invalid JID/
		)
	})

	it('toUnixSeconds handles Date and number inputs', () => {
		expect(toUnixSeconds(1_800_000_000)).toBe(1_800_000_000)
		expect(toUnixSeconds(new Date(1_800_000_000_000))).toBe(1_800_000_000)
	})
})
