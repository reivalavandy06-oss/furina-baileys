// button-tracker.ts — parser tap + tracker
import { proto } from '../../../WAProto/index.js'
import type { WAMessage, MessageRelayOptions } from '../../Types'
import { generateMessageIDV2 } from '../generics'
import { sendButton } from './senders'
import { sendCarousel } from './carousel'
import type { FurinaCarouselOptions } from './carousel'
import type { FurinaSocket, FurinaButton, FurinaButtonOptions, FurinaButtonResponse } from './types'

function unwrap(msg?: proto.IMessage | null): proto.IMessage | null {
	let c = msg ?? null
	while (c) {
		const next =
			c.viewOnceMessage?.message ||
			c.viewOnceMessageV2?.message ||
			c.ephemeralMessage?.message ||
			c.documentWithCaptionMessage?.message ||
			c.viewOnceMessageV2Extension?.message
		if (!next) break
		c = next as proto.IMessage
	}
	return c
}

const safeParse = (s?: string | null): Record<string, any> => {
	try {
		return JSON.parse(s || '{}')
	} catch {
		return {}
	}
}

export function parseButtonResponse(m: WAMessage): FurinaButtonResponse | null {
	const content = unwrap(m.message as proto.IMessage)
	if (!content) return null

	// Native flow (quick_reply / single_select / flow)
	const ir = content.interactiveResponseMessage
	if (ir?.nativeFlowResponseMessage) {
		const nf = ir.nativeFlowResponseMessage
		const p = safeParse(nf.paramsJson)
		const id = (p.selected_id ?? p.selected_row_id ?? (nf as any).selectedId ?? '') as string
		const kind: FurinaButtonResponse['kind'] = nf.name === 'flow' ? 'flow' : p.selected_row_id ? 'list' : 'reply'
		return { isButton: true, kind, id, displayText: p.selected_display_text, raw: content }
	}

	// Order / payment
	const om = content.orderMessage
	if (om) {
		return {
			isButton: true,
			kind: 'order',
			id: om.orderId ?? '',
			order: {
				orderId: om.orderId ?? undefined,
				itemCount: om.itemCount ?? undefined,
				title: om.orderTitle ?? undefined,
			},
			raw: content,
		}
	}

	// Tap native-flow di klien WA 2026: datang sebagai templateButtonReplyMessage
	const tr = content.templateButtonReplyMessage
	if (tr) return { isButton: true, kind: 'reply', id: tr.selectedId ?? '', displayText: tr.selectedDisplayText ?? undefined, cardIndex: tr.selectedCarouselCardIndex ?? undefined, raw: content }

	// Legacy (dari user WA Mod yang ngirim ke user lo)
	const br = content.buttonsResponseMessage
	if (br) return { isButton: true, kind: 'legacy_reply', id: br.selectedButtonId ?? '', displayText: br.selectedDisplayText ?? undefined, raw: content }

	const lr = content.listResponseMessage
	if (lr) return { isButton: true, kind: 'legacy_list', id: lr.singleSelectReply?.selectedRowId ?? '', displayText: lr.title ?? undefined, raw: content }

	return null
}

// ── Tracker: biar tap button (termasuk tap carousel) langsung ketangkap ──
// Klien WA ngirim tap sebagai quoted-text; tracker nyocokin stanzaId quote
// sama message button yang kita kirim sendiri.

export interface FurinaButtonTracker {
	sendButton(sock: FurinaSocket, jid: string, opts: FurinaButtonOptions, extra?: MessageRelayOptions): Promise<WAMessage>
	sendCarousel(sock: FurinaSocket, jid: string, opts: FurinaCarouselOptions, extra?: MessageRelayOptions): Promise<WAMessage>
	parseTap(m: WAMessage): FurinaButtonResponse | null
}

export function createFurinaButtonTracker(): FurinaButtonTracker {
	// stanzaId (ID yang KITA generate sendiri) -> Map(label -> id)
	const registry = new Map<string, Map<string, string>>()

	function track(msgId: string, pairs: Array<[string, string]>): void {
		const m = new Map<string, string>()
		for (const [label, bid] of pairs) m.set(label, bid)
		registry.set(msgId, m)
	}

	return {
		async sendButton(sock, jid, opts, extra) {
			const msgId = generateMessageIDV2()
			const sent = await sendButton(sock, jid, opts, { messageId: msgId, ...extra })
			track(
				msgId,
				opts.buttons
					.filter((b): b is Extract<FurinaButton, { type: 'reply' }> => b.type === 'reply')
					.map((b) => [b.text, b.id])
			)
			return sent
		},

		async sendCarousel(sock, jid, opts, extra) {
			const msgId = generateMessageIDV2()
			const sent = await sendCarousel(sock, jid, opts, { messageId: msgId, ...extra })
			const pairs: Array<[string, string]> = []
			for (const card of opts.cards) {
				for (const b of card.buttons ?? []) {
					if (b.type === 'reply') pairs.push([b.text, b.id])
				}
			}
			track(msgId, pairs)
			return sent
		},

		parseTap(m) {
			// Jalur 1: respons resmi
			const official = parseButtonResponse(m)
			if (official) return official

			// Jalur 2: tap sebagai quoted-text
			const etm = m.message?.extendedTextMessage
			const ctx = etm?.contextInfo
			if (!ctx) return null
			const text = etm?.text ?? ''
			const stanzaId = ctx?.stanzaId

			let id: string | undefined
			if (stanzaId && registry.has(stanzaId)) {
				id = registry.get(stanzaId)!.get(text)
			}
			if (!id && ctx?.quotedMessage?.interactiveMessage) {
				for (const map of registry.values()) {
					if (map.has(text)) {
						id = map.get(text)
						break
					}
				}
			}
			if (!id) return null
			return { isButton: true, kind: 'reply', id, displayText: text, raw: m.message as proto.IMessage }
		},
	}
}
