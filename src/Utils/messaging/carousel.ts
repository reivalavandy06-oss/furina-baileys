// carousel.ts — modul carousel terpisah (payload resmi traffic official client,
// ref: zaileys/NIXCODE MessageBuilder v4.7, Aug 2026)
// File terpisah dari buttons.ts biar type nggak bentrok.

import { proto } from '../../../WAProto/index.js'
import { prepareWAMessageMedia } from '../messages'
import { generateMessageIDV2 } from '../generics'
import type { BinaryNode } from '../../WABinary/types'
import { isJidGroup } from '../../WABinary/jid-utils'
import type { WAMessage, MessageRelayOptions } from '../../Types'

// Socket struktural (minimal, tanpa import melingkar)
interface FurinaCarouselSocket {
	relayMessage(jid: string, message: proto.IMessage, options?: MessageRelayOptions): Promise<WAMessage>
	waUploadToServer: any
}

// ===== TYPES (khusus carousel, nggak bentrok sama FurinaButton di buttons.ts) =====

export type FurinaCardButton =
	| { type: 'reply'; id: string; text: string }
	| { type: 'url'; text: string; url: string }
	| { type: 'copy'; text: string; code: string }
	| { type: 'call'; text: string; phone: string }

export interface FurinaCarouselCard {
	title?: string
	subtitle?: string
	body: string
	footer?: string
	image?: Buffer | string
	video?: Buffer | string
	buttons?: FurinaCardButton[]
}

export interface FurinaCarouselOptions {
	text?: string
	footer?: string
	cards: FurinaCarouselCard[]
}

// ===== NODE PERSIS: biz > interactive > native_flow =====
export const FURINA_CAROUSEL_NODES: BinaryNode[] = [
	{
		tag: 'biz',
		attrs: {},
		content: [
			{
				tag: 'interactive',
				attrs: { type: 'native_flow', v: '1' },
				content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
			},
		],
	},
]

export const FURINA_CAROUSEL_RULES = {
	cardsMax: 10,
	buttonsPerCardMax: 10,
} as const

// Private chat wajib tambah node `bot` (biz_bot=1), kalau nggak WhatsApp
// server silent drop carousel. Group chat cukup biz + interactive/native_flow.
// Ref: baileys_helper, gifted-btns, yukistage.
export function buildCarouselNodes(jid: string): BinaryNode[] {
const nodes: BinaryNode[] = [
{
tag: 'biz',
attrs: {},
content: [
{
tag: 'interactive',
attrs: { type: 'native_flow', v: '1' },
content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
},
],
},
]

if (!isJidGroup(jid)) {
nodes.push({ tag: 'bot', attrs: { biz_bot: '1' } })
}

return nodes
}
function assert(cond: boolean, msg: string): asserts cond {
	if (!cond) throw new Error(`[furina-carousel] ${msg}`)
}

function toNativeCardButton(b: FurinaCardButton) {
	switch (b.type) {
		case 'url':
			return { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: b.text, url: b.url, merchant_url: b.url }) }
		case 'copy':
			return { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: b.text, copy_code: b.code }) }
		case 'call':
			return { name: 'cta_call', buttonParamsJson: JSON.stringify({ display_text: b.text, phone_number: b.phone }) }
		default:
			return { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: b.text, id: b.id }) }
	}
}

async function buildFurinaCarouselCard(sock: FurinaCarouselSocket, c: FurinaCarouselCard) {
	assert(!!c.image || !!c.video, 'tiap kartu WAJIB punya image atau video di header')

	const media = c.image
		? await prepareWAMessageMedia({ image: c.image as any }, { upload: sock.waUploadToServer })
		: await prepareWAMessageMedia({ video: c.video as any }, { upload: sock.waUploadToServer })

	const buttons = (c.buttons ?? []).map(toNativeCardButton)
	assert(buttons.length <= FURINA_CAROUSEL_RULES.buttonsPerCardMax, `maksimal ${FURINA_CAROUSEL_RULES.buttonsPerCardMax} button per kartu`)

	return {
		header: {
			...(c.title ? { title: c.title } : {}),
			...(c.subtitle ? { subtitle: c.subtitle } : {}),
			hasMediaAttachment: true,
			...(media as any),
		},
		body: { text: c.body ?? '' },
		footer: { text: c.footer ?? '' },
		nativeFlowMessage: {
			messageParamsJson: JSON.stringify({}),
			buttons,
		},
	}
}

// ===== SEND CAROUSEL =====
export async function sendCarousel(
	sock: FurinaCarouselSocket,
	jid: string,
	opts: FurinaCarouselOptions,
	extra: MessageRelayOptions = {}
): Promise<WAMessage> {
	assert(opts.cards.length >= 1 && opts.cards.length <= FURINA_CAROUSEL_RULES.cardsMax, `cards harus 1-${FURINA_CAROUSEL_RULES.cardsMax}`)

	const cards = await Promise.all(opts.cards.map((c) => buildFurinaCarouselCard(sock, c)))

	const content: proto.IMessage = {
		interactiveMessage: {
			header: { hasMediaAttachment: false },
			body: { text: opts.text ?? ' ' },
			footer: { text: opts.footer ?? '' },
			carouselMessage: { cards },
		},
	}

	return sock.relayMessage(jid, content, {
		messageId: generateMessageIDV2(),
		additionalNodes: buildCarouselNodes(jid),
		...extra,
	})
}
