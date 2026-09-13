// buttons-builders.ts — builder murni (tanpa socket)
import { proto } from '../../../WAProto/index.js'
import { prepareWAMessageMedia } from '../messages'
import { isJidGroup } from '../../WABinary/jid-utils'
import type { BinaryNode } from '../../WABinary/types'
import { J, assert, assertUniqueIds, FURINA_BUTTON_RULES } from './types'
import type { NativeButton, FurinaButton, FurinaSocket, FurinaHeader } from './types'

export function toNativeButton(b: FurinaButton): NativeButton {
	switch (b.type) {
		case 'reply':
			assert(!!b.id && !!b.text, 'reply butuh id & text')
			return { name: 'quick_reply', buttonParamsJson: J({ display_text: b.text, id: b.id }) }
		case 'url':
			return { name: 'cta_url', buttonParamsJson: J({ display_text: b.text, url: b.url, merchant_url: b.url, ...(b.webview ? { webview: true } : {}) }) }
		case 'call':
			return { name: 'cta_call', buttonParamsJson: J({ display_text: b.text, phone_number: b.phone }) }
		case 'copy':
			return { name: 'cta_copy', buttonParamsJson: J({ display_text: b.text, copy_code: b.code }) }
		case 'reminder':
			return { name: 'cta_reminder', buttonParamsJson: J({ display_text: b.text, id: b.id ?? b.text, reminder_timestamp_in_seconds: b.expiresAt ?? 0 }) }
		case 'cancel-reminder':
			return { name: 'cta_cancel_reminder', buttonParamsJson: J({ display_text: b.text, id: b.id ?? b.text }) }
		case 'location':
			return { name: 'send_location', buttonParamsJson: J({ display_text: b.text ?? 'Share Location' }) }
		case 'address':
			return { name: 'address_message', buttonParamsJson: J({ display_text: b.text, id: b.id ?? b.text }) }
		case 'catalog':
			return { name: 'cta_catalog', buttonParamsJson: J(b.text ? { display_text: b.text } : {}) }
		case 'order':
                        return {
                                name: 'review_and_pay',
                                buttonParamsJson: J({
                                        currency: b.currency,
                                        payment_configuration: '',
                                        payment_type: '',
                                        total_amount: { value: String(b.totalAmount), offset: '100' },
                                        reference_id: b.referenceId,
                                        type: 'physical-goods',
                                        payment_method: 'confirm',
                                        payment_status: 'captured',
                                        payment_timestamp: Math.floor(Date.now() / 1000),
                                        order: {
                                                status: 'completed',
                                                description: '',
                                                subtotal: { value: String(b.totalAmount), offset: '100' },
                                                order_type: 'PAYMENT_REQUEST',
                                                items: b.items.map((i) => ({
                                                        retailer_id: i.id,
                                                        name: i.name,
                                                        amount: { value: String(i.amount), offset: '100' },
                                                        quantity: String(i.quantity),
                                                })),
                                        },
                                        additional_note: '',
                                        native_payment_methods: [],
                                        share_payment_status: false,
                                }),
                        }
                case 'call-permission':
                        return { name: 'call_permission_request', buttonParamsJson: J({ display_text: b.text ?? 'Izin Telepon' }) }
                case 'pix':
                        return {
                                name: 'payment_info',
                                buttonParamsJson: J({
                                        payment_settings: [{
                                                type: 'pix_static_code',
                                                pix_static_code: {
                                                        merchant_name: b.merchantName,
                                                        key: b.key,
                                                        key_type: b.keyType ?? 'EMAIL',
                                                },
                                        }],
                                        share_payment_status: false,
                                }),
                        }
                case 'flow':
			return { name: 'flow', buttonParamsJson: J({ flow_cta: b.text, flow_id: b.flowId, flow_json: b.flowJson ?? '{}', mode: b.mode ?? 'published' }) }
		case 'list': {
			const totalRows = b.sections.reduce((n, s) => n + s.rows.length, 0)
			assert(b.sections.length > 0 && totalRows > 0, 'list butuh minimal 1 section & 1 row')
			assert(totalRows <= FURINA_BUTTON_RULES.listRowsMax, `list maksimal ${FURINA_BUTTON_RULES.listRowsMax} row total`)
			assertUniqueIds(b.sections.flatMap((s) => s.rows.map((r) => r.id)), 'list')
			return {
				name: 'single_select',
				buttonParamsJson: J({
					title: b.title,
					sections: b.sections.map((s) => ({
						title: s.title,
						rows: s.rows.map((r) => ({
							id: r.id,
							title: r.title,
							description: r.description ?? '',
							...(r.header ? { header: r.header } : {}),
						})),
					})),
				}),
			}
		}
	}
}

// Node biz+bot: kunci biar native button render di nomor PERSONAL.
// Group nggak butuh node bot.
const SPECIAL_V2 = ['mpm', 'cta_catalog', 'send_location', 'call_permission_request', 'wa_payment_transaction_details', 'automated_greeting_message_view_catalog']

export function buildButtonNodes(buttons: NativeButton[], jid: string): BinaryNode[] {
	const first = buttons[0]?.name ?? ''
	let bizAttrs: Record<string, string> = {}
	let nativeFlow: BinaryNode

	if (first === 'review_and_pay') {
		bizAttrs = { native_flow_name: 'order_details' }
		nativeFlow = { tag: 'native_flow', attrs: { v: '2', name: first } }
	} else if (SPECIAL_V2.includes(first)) {
		nativeFlow = { tag: 'native_flow', attrs: { v: '2', name: first } }
	} else {
		nativeFlow = { tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }
	}

	const nodes: BinaryNode[] = [
		{
			tag: 'biz',
			attrs: bizAttrs,
			content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' }, content: [nativeFlow] }],
		},
	]
	if (!isJidGroup(jid)) nodes.push({ tag: 'bot', attrs: { biz_bot: '1' } })
	return nodes
}

// Header media: cast dipakai karena field media IHeader beda generasi d.ts;
// runtime protobuf tetep encode sesuai .proto asli.
export async function buildHeader(sock: FurinaSocket, header?: FurinaHeader) {
	if (!header) return undefined
	const h: proto.Message.InteractiveMessage.IHeader = { hasMediaAttachment: false }
	if (header.title) h.title = header.title
	if (header.subtitle) h.subtitle = header.subtitle
	if (header.image) {
		const media = await prepareWAMessageMedia({ image: header.image as any }, { upload: sock.waUploadToServer })
		;(h as any).imageMessage = media.imageMessage
		h.hasMediaAttachment = true
	} else if (header.video) {
		const media = await prepareWAMessageMedia({ video: header.video as any }, { upload: sock.waUploadToServer })
		;(h as any).videoMessage = media.videoMessage
		h.hasMediaAttachment = true
	}
	return h
}

