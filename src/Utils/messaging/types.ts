// buttons-types.ts — types + rules validasi + helpers internal
import { proto } from '../../../WAProto/index.js'
import type { WAMessage, MessageRelayOptions } from '../../Types'

export interface FurinaSocket {
	relayMessage(jid: string, message: proto.IMessage, options?: MessageRelayOptions): Promise<WAMessage>
	waUploadToServer: any
}

export interface FurinaRow { id: string; title: string; description?: string; header?: string }
export interface FurinaSection { title: string; rows: FurinaRow[] }
export interface FurinaHeader { title?: string; subtitle?: string; image?: Buffer | string; video?: Buffer | string }
export interface FurinaOrderItem { id: string; name: string; amount: number; quantity: number }

export type FurinaButton =
	| { type: 'reply'; id: string; text: string }
	| { type: 'list'; title: string; sections: FurinaSection[] }
	| { type: 'url'; text: string; url: string; webview?: boolean }
	| { type: 'call'; text: string; phone: string }
	| { type: 'copy'; text: string; code: string }
	| { type: 'reminder'; text: string; id?: string; expiresAt?: number }
	| { type: 'cancel-reminder'; text: string; id?: string }
	| { type: 'location'; text?: string }
	| { type: 'address'; text: string; id?: string }
	| { type: 'catalog'; text?: string }
	| { type: 'order'; referenceId: string; currency: string; totalAmount: number; items: FurinaOrderItem[] }
	| { type: 'flow'; text: string; flowId: string; flowJson?: string; mode?: 'published' | 'draft' }
        | { type: 'call-permission'; text?: string }
        | { type: 'pix'; merchantName: string; key: string; keyType?: 'EMAIL' | 'PHONE' | 'CPF' | 'EVP' }

export interface FurinaButtonOptions {
	text: string
	footer?: string
	header?: FurinaHeader
	buttons: FurinaButton[]
	viewOnce?: boolean
        bottomSheet?: FurinaBottomSheet
        limitedTimeOffer?: FurinaLimitedTimeOffer
}

export interface FurinaTemplateOptions { header?: string; body: string; footer?: string; buttons: { id: string; text: string }[] }
export interface FurinaBottomSheet { buttonsLimit: number; listTitle: string; buttonTitle: string; dividers?: number[] }
export interface FurinaLimitedTimeOffer { text: string; url?: string; copyCode?: string; expiresAtMs: number }
export interface FurinaProductListOptions { title: string; text?: string; buttonText?: string; footer?: string; businessOwnerJid?: string; sections: { title: string; productIds: string[] }[] }
export interface FurinaListOptions { title?: string; description?: string; buttonText: string; footer?: string; sections: FurinaSection[] }

export interface FurinaButtonResponse {
	isButton: true
	kind: 'reply' | 'list' | 'flow' | 'order' | 'legacy_reply' | 'legacy_list'
	id: string
	displayText?: string
	cardIndex?: number
	order?: { orderId?: string; itemCount?: number; title?: string }
	raw: proto.IMessage
}

export type NativeButton = { name: string; buttonParamsJson: string }

// Limit = throw, bukan truncate: biar user langsung tau salahnya di mana
export const FURINA_BUTTON_RULES = {
	buttonsMax: 10,
	templateButtonsMax: 3,
	listRowsMax: 10,
	carouselCardsMax: 10,
	buttonsPerCardMax: 10,
} as const

export function assert(cond: boolean, msg: string): asserts cond {
	if (!cond) throw new Error(`[furina-buttons] ${msg}`)
}

export const J = (o: unknown) => JSON.stringify(o)

export function assertUniqueIds(ids: string[], ctx: string): void {
	const dup = ids.find((v, i) => ids.indexOf(v) !== i)
	assert(!dup, `${ctx}: id duplikat "${dup}"`)
}

