import { jest } from '@jest/globals'
import { proto } from '../../../../WAProto'
import { generateWAMessageFromContent } from '../../../Utils/messages'
import { readRichMessage } from '../../../Utils/messaging/rich-message'
import { setMediaPreparer } from '../../../Utils/messaging/media-seam'
import {
	batchStickers,
	sendStickerPack,
	STICKER_PACK_BATCH_DELAY_MS,
	STICKER_PACK_MAX_ITEMS
} from '../../../Utils/messaging/sticker-pack'
import { sendGroupStatus } from '../../../Utils/messaging/group-status'
import { bulkFollowNewsletter, newsletterAdminUtils } from '../../../Utils/messaging/newsletter-extras'
import { sendPaymentRequest, sendProductCatalog, fetchCatalog } from '../../../Utils/messaging/commerce'
import { buildRejectCallStanza, createVoipClient, rejectCall, toActiveCall } from '../../../Utils/voip'
import type { FurinaSocket } from '../../../Utils/messaging/types'
import type { WAMessage } from '../../../Types'

type Call = { jid: string; content: proto.IMessage; options?: unknown }

const makeMockSock = (extra: Record<string, unknown> = {}) => {
	const calls: Call[] = []
	const sock = {
		relayMessage: async (jid: string, content: proto.IMessage, options?: unknown) => {
			calls.push({ jid, content, options })
			return { key: { id: `M${calls.length}`, remoteJid: jid } } as WAMessage
		},
		waUploadToServer: async () => ({ mediaUrl: 'https://mmg/x', directPath: '/x' }),
		user: { id: '6281234567890@s.whatsapp.net' },
		...extra
	} as unknown as FurinaSocket

	return { sock, calls }
}

afterEach(() => setMediaPreparer(null))

// ── Bagian 1: AI Icon Global ─────────────────────────────────────────────
describe('AI metadata injection', () => {
	const opts = { userJid: '6281234567890@s.whatsapp.net', messageId: 'AI_MSG_1' }

	it('injects botMetadata when ai: true', () => {
		const message = generateWAMessageFromContent(
			'628@s.whatsapp.net',
			{ conversation: 'hi' },
			{
				...opts,
				ai: true
			}
		)

		const bot = message.message?.messageContextInfo?.botMetadata
		expect(bot?.botResponseId).toBe('AI_MSG_1')
		expect(bot?.botModeSelectionMetadata?.mode).toEqual([
			proto.BotModeSelectionMetadata.BotUserSelectionMode.REASONING_MODE
		])
	})

	it('does not inject botMetadata by default', () => {
		const message = generateWAMessageFromContent('628@s.whatsapp.net', { conversation: 'hi' }, opts)
		expect(message.message?.messageContextInfo?.botMetadata).toBeUndefined()
	})

	it('readRichMessage extracts botMetadata', () => {
		const message = generateWAMessageFromContent(
			'628@s.whatsapp.net',
			{
				richResponseMessage: {
					messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
					submessages: []
				}
			},
			{ ...opts, ai: true }
		)

		const parsed = readRichMessage(message.message!)
		expect(parsed?.botMetadata?.botResponseId).toBe('AI_MSG_1')
	})
})

// ── Bagian 2: Sticker packs ──────────────────────────────────────────────
describe('sticker packs', () => {
	beforeEach(() =>
		setMediaPreparer((async () => ({
			stickerMessage: { url: 'https://mmg/s' },
			imageMessage: { width: 100, height: 100 }
		})) as never)
	)

	it('batchStickers splits at 60', () => {
		const stickers = Array.from({ length: 130 }, () => ({ data: Buffer.alloc(2) }))
		const batches = batchStickers(stickers)
		expect(batches.map(b => b.length)).toEqual([60, 60, 10])
		expect(STICKER_PACK_MAX_ITEMS).toBe(60)
	})

	it('rejects an empty pack', async () => {
		const { sock } = makeMockSock()
		await expect(
			sendStickerPack(sock, '628@s.whatsapp.net', { name: 'x', publisher: 'y', stickers: [] })
		).rejects.toThrow(/minimal 1 sticker/)
	})

	it('sends a single pack message', async () => {
		const { sock, calls } = makeMockSock()
		await sendStickerPack(sock, '6281234567890@s.whatsapp.net', {
			name: 'Pack',
			publisher: 'Me',
			stickers: [
				{ data: Buffer.alloc(2), emojis: ['😀'], isAnimated: true },
				{ data: Buffer.alloc(2), isLottie: true }
			]
		})

		expect(calls).toHaveLength(1)
		const pack = calls[0]!.content.stickerPackMessage
		expect(pack?.name).toBe('Pack')
		expect(pack?.publisher).toBe('Me')
		expect(pack?.stickers).toHaveLength(2)
		expect(pack?.stickers?.[0]?.emojis).toEqual(['😀'])
		expect(pack?.stickers?.[0]?.isAnimated).toBe(true)
		expect(pack?.stickers?.[1]?.isLottie).toBe(true)
		expect(pack?.stickerPackOrigin).toBe(proto.Message.StickerPackMessage.StickerPackOrigin.THIRD_PARTY)
	})

	it('splits large packs and uses a 2s delay', async () => {
		const sleeps: number[] = []
		const { sock, calls } = makeMockSock()
		const stickers = Array.from({ length: 61 }, () => ({ data: Buffer.alloc(2) }))

		const original = setTimeout
		// speed up the 2s pause; record the requested delay instead.
		const spy = jest.spyOn(globalThis, 'setTimeout').mockImplementation((fn: () => void) => {
			sleeps.push(STICKER_PACK_BATCH_DELAY_MS)
			fn()
			return 0 as never
		})

		try {
			await sendStickerPack(sock, '628@s.whatsapp.net', { name: 'Big', publisher: 'Me', stickers })
		} finally {
			spy.mockRestore()
			expect(original).toBeDefined()
		}

		expect(calls).toHaveLength(2)
		expect(sleeps).toEqual([STICKER_PACK_BATCH_DELAY_MS])
	})
})

// ── Bagian 3: PTV ────────────────────────────────────────────────────────
describe('PTV (video note)', () => {
	it('wraps video into ptvMessage', async () => {
		setMediaPreparer((async () => ({ videoMessage: { url: 'https://mmg/v', mimetype: 'video/mp4' } })) as never)

		const content = await (
			await import('../../../Utils/messages')
		).generateWAMessageContent(
			{ video: Buffer.alloc(2), ptv: true },
			{
				upload: async () => ({ mediaUrl: '', directPath: '' })
			}
		)

		expect(content.ptvMessage).toBeDefined()
		expect(content.videoMessage).toBeFalsy()
	})
})

// ── Bagian 4: Group status ───────────────────────────────────────────────
describe('group status', () => {
	it('injects isGroupStatus contextInfo for text', async () => {
		const { sock, calls } = makeMockSock()
		await sendGroupStatus(sock, '120363@g.us', { text: 'hello', textColor: '#ff0000' })

		const ext = calls[0]!.content.extendedTextMessage
		expect(ext?.contextInfo?.isGroupStatus).toBe(true)
		expect(ext?.contextInfo?.statusSourceType).toBe(proto.ContextInfo.StatusSourceType.TEXT)
		expect(ext?.contextInfo?.statusAudienceMetadata?.audienceType).toBe(
			proto.ContextInfo.StatusAudienceMetadata.AudienceType.CLOSE_FRIENDS
		)
		expect(ext?.textArgb).toBe(0xffff0000)
	})

	it('uses IMAGE source type for images', async () => {
		setMediaPreparer((async () => ({ imageMessage: { url: 'https://mmg/i' } })) as never)
		const { sock, calls } = makeMockSock()
		await sendGroupStatus(sock, '120363@g.us', { image: Buffer.alloc(2) })

		expect(calls[0]!.content.imageMessage?.contextInfo?.isGroupStatus).toBe(true)
		expect(calls[0]!.content.imageMessage?.contextInfo?.statusSourceType).toBe(proto.ContextInfo.StatusSourceType.IMAGE)
	})
})

// ── Bagian 5: Newsletter extras ─────────────────────────────────────────
describe('newsletter extras', () => {
	it('bulkFollowNewsletter waits between follows', async () => {
		const followed: string[] = []
		const sleeps: number[] = []
		const sock = {
			newsletterFollow: async (jid: string) => {
				followed.push(jid)
			}
		}

		const result = await bulkFollowNewsletter(sock, ['1@newsletter', '2@newsletter', '3@newsletter'], {
			delayMs: 1234,
			sleep: async (ms: number) => {
				sleeps.push(ms)
			}
		})

		expect(followed).toHaveLength(3)
		expect(sleeps).toEqual([1234, 1234])
		expect(result.failed).toHaveLength(0)
	})

	it('bulkFollowNewsletter records failures', async () => {
		const sock = {
			newsletterFollow: async (jid: string) => {
				if (jid.includes('bad')) throw new Error('nope')
			}
		}

		const result = await bulkFollowNewsletter(sock, ['bad@newsletter', 'ok@newsletter'], {
			sleep: async () => {}
		})

		expect(result.failed).toHaveLength(1)
		expect(result.followed).toHaveLength(1)
	})

	it('admin utils demote via newsletterDemote', async () => {
		const demoted: [string, string][] = []
		const sock = {
			newsletterDemote: async (jid: string, user: string) => {
				demoted.push([jid, user])
			}
		}

		await newsletterAdminUtils(sock).demoteAdmin('abc@newsletter', '628@s.whatsapp.net')
		expect(demoted[0]?.[0]).toBe('abc@newsletter')
	})

	it('admin utils document promote as unsupported', async () => {
		await expect(newsletterAdminUtils({}).promoteAdmin('a', 'b')).rejects.toThrow(/unsupported/)
	})

	it('getAdminList reads newsletter metadata', async () => {
		const sock = {
			newsletterMetadata: async () => ({ admins: [{ jid: '1@s.whatsapp.net', role: 'OWNER' }] })
		}

		const admins = await newsletterAdminUtils(sock).getAdminList('abc@newsletter')
		expect(admins).toEqual([{ jid: '1@s.whatsapp.net', role: 'OWNER' }])
	})
})

// ── Bagian 6: Commerce ───────────────────────────────────────────────────
describe('commerce', () => {
	it('sendPaymentRequest builds requestPaymentMessage', async () => {
		const { sock, calls } = makeMockSock()
		await sendPaymentRequest(sock, '6281234567890@s.whatsapp.net', {
			amount: 25000,
			currency: 'IDR',
			note: 'Bayar'
		})

		const req = calls[0]!.content.requestPaymentMessage
		expect(req?.amount1000).toBe(25000)
		expect(req?.currencyCodeIso4217).toBe('IDR')
		expect(req?.requestFrom).toBe('6281234567890@s.whatsapp.net')
		expect(req?.noteMessage?.conversation).toBe('Bayar')
	})

	it('sendProductCatalog builds productMessage', async () => {
		setMediaPreparer((async () => ({ imageMessage: { url: 'https://mmg/p' } })) as never)
		const { sock, calls } = makeMockSock()
		await sendProductCatalog(sock, '6281234567890@s.whatsapp.net', {
			title: 'Toko',
			products: [{ title: 'Kopi', price: 25000, currency: 'IDR', imageUrl: 'https://cdn/p.png' }]
		})

		const product = calls[0]!.content.productMessage
		expect(product?.body).toBe('Toko')
		expect(product?.product?.title).toBe('Kopi')
		expect(product?.catalog?.title).toBe('Toko')
	})

	it('fetchCatalog delegates to getCatalog', async () => {
		const catalog = { products: [] }
		const sock = { getCatalog: async () => catalog }
		await expect(fetchCatalog(sock as never, '628@s.whatsapp.net')).resolves.toBe(catalog)
	})
})

// ── Bagian 7: VoIP foundation ────────────────────────────────────────────
describe('voip foundation', () => {
	it('toActiveCall adds peerJid', () => {
		const call = toActiveCall({
			chatId: '628@s.whatsapp.net',
			from: '628@s.whatsapp.net',
			id: 'CALL1',
			date: new Date(),
			status: 'offer',
			offline: false
		})

		expect(call.peerJid).toBe('628@s.whatsapp.net')
	})

	it('buildRejectCallStanza has the right shape', () => {
		const stanza = buildRejectCallStanza('CALL1', '628111@s.whatsapp.net', '628222@s.whatsapp.net')
		expect(stanza.tag).toBe('call')
		expect(stanza.attrs).toMatchObject({ from: '628222@s.whatsapp.net', to: '628111@s.whatsapp.net' })
		expect((stanza.content as { tag: string }[])[0]).toMatchObject({
			tag: 'reject',
			attrs: { 'call-id': 'CALL1', 'call-creator': '628111@s.whatsapp.net' }
		})
	})

	it('rejectCall prefers sock.rejectCall', async () => {
		const rejected: [string, string][] = []
		const sock = {
			rejectCall: async (id: string, from: string) => {
				rejected.push([id, from])
			}
		}

		await rejectCall(sock, 'CALL1', '628111@s.whatsapp.net')
		expect(rejected).toEqual([['CALL1', '628111@s.whatsapp.net']])
	})

	it('rejectCall falls back to query', async () => {
		const queried: unknown[] = []
		const sock = {
			user: { id: '628222@s.whatsapp.net' },
			query: async (node: unknown) => {
				queried.push(node)
			}
		}

		await rejectCall(sock, 'CALL1', '628111@s.whatsapp.net')
		expect(queried).toHaveLength(1)
		expect((queried[0] as { attrs: { to: string } }).attrs.to).toBe('628111@s.whatsapp.net')
	})

	it('createVoipClient reports media as unavailable', async () => {
		const client = createVoipClient({})
		expect(client.available).toBe(false)
		await expect(client.startCall('628@s.whatsapp.net')).rejects.toThrow(/@roamhq\/wrtc/)
		client.dispose()
	})
})
