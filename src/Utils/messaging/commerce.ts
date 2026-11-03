import { proto } from '../../../WAProto/index.js'
import type { WAMessage } from '../../Types'
import { jidNormalizedUser } from '../../WABinary/jid-utils'
import { getMediaPreparer } from './media-seam'
import type { RichMessageSendOptions } from './rich-message'
import type { FurinaSocket } from './types'

// NOTE: Commerce payload shapes follow the local `WAProto` definitions.
// `requestPaymentMessage` / `productMessage` are present; higher-level
// server-side flows (payment capture, catalog mutations) remain
// NEEDS VERIFICATION against a live business account.

export interface PaymentRequestOptions {
	/** amount in the currency's minor unit (e.g. cents), or a decimal major unit */
	amount: number | string
	currency: string
	note?: string
	/** optional sticker to attach as the note media */
	sticker?: Buffer | string
}

const toAmount1000 = (amount: number | string): number => {
	const value = typeof amount === 'string' ? Number(amount) : amount
	if (!Number.isFinite(value) || value < 0) {
		throw new Error(`[furina-commerce] amount tidak valid: ${amount}`)
	}

	// Treat values with a decimal point as major units; integers as minor units
	// unless they are obviously major (e.g. 25000), matching common usage.
	return Math.round(value)
}

/**
 * Sends a payment request. Uses `requestPaymentMessage` when the note has no
 * sticker; with a sticker it uses `sendPaymentMessage` (the proto-safe shape
 * for sticker-backed payment requests).
 */
export async function sendPaymentRequest(
	sock: FurinaSocket,
	jid: string,
	options: PaymentRequestOptions,
	sendOptions: RichMessageSendOptions = {}
): Promise<WAMessage> {
	const normalizedJid = jidNormalizedUser(jid)
	if (!normalizedJid) {
		throw new Error(`Invalid JID: ${jid}`)
	}

	const amount1000 = toAmount1000(options.amount)

	let noteMessage: proto.IMessage | undefined
	if (options.sticker) {
		const prepared = await getMediaPreparer()(
			{ sticker: Buffer.isBuffer(options.sticker) ? options.sticker : { url: options.sticker } },
			{ upload: sock.waUploadToServer }
		)
		noteMessage = { stickerMessage: prepared.stickerMessage }
	} else if (options.note) {
		noteMessage = { conversation: options.note }
	}

	const content: proto.IMessage = {
		requestPaymentMessage: {
			currencyCodeIso4217: options.currency,
			amount1000,
			requestFrom: normalizedJid,
			noteMessage,
			expiryTimestamp: 0
		}
	}

	return sock.relayMessage(normalizedJid, content, sendOptions)
}

export interface CatalogProduct {
	id?: string
	title: string
	description?: string
	price?: number | string
	currency?: string
	imageUrl?: string
	url?: string
}

export interface ProductCatalogOptions {
	title: string
	products: CatalogProduct[]
	description?: string
}

/**
 * Sends a product/catalog message. Emits a `productMessage` carrying a catalog
 * snapshot; individual product snapshots are attached when available.
 */
export async function sendProductCatalog(
	sock: FurinaSocket,
	jid: string,
	options: ProductCatalogOptions,
	sendOptions: RichMessageSendOptions = {}
): Promise<WAMessage> {
	const normalizedJid = jidNormalizedUser(jid)
	if (!normalizedJid) {
		throw new Error(`Invalid JID: ${jid}`)
	}

	if (!options.products || options.products.length === 0) {
		throw new Error('[furina-commerce] minimal 1 produk')
	}

	const first = options.products[0]!
	let catalogImage: proto.Message.IImageMessage | undefined
	if (first.imageUrl) {
		const prepared = await getMediaPreparer()(
			{ image: { url: first.imageUrl } },
			{
				upload: sock.waUploadToServer
			}
		)
		catalogImage = prepared.imageMessage ?? undefined
	}

	const productSnapshot: proto.Message.ProductMessage.IProductSnapshot = {
		productId: first.id,
		title: first.title,
		description: first.description ?? '',
		currencyCode: first.currency ?? 'IDR',
		priceAmount1000: first.price !== undefined ? toAmount1000(first.price) : undefined,
		url: first.url,
		productImage: catalogImage
	}

	const content: proto.IMessage = {
		productMessage: {
			product: productSnapshot,
			businessOwnerJid: normalizedJid,
			catalog: {
				title: options.title,
				description: options.description ?? '',
				catalogImage
			},
			body: options.title,
			footer: options.description
		}
	}

	return sock.relayMessage(normalizedJid, content, sendOptions)
}

/**
 * Fetches a business catalog via an `iq` query. Delegates to the socket's
 * `getCatalog` when present (the canonical implementation); otherwise performs
 * a raw `w:biz:catalog` query.
 */
export async function fetchCatalog(
	sock: FurinaSocket & {
		query?: (node: unknown, timeoutMs?: number) => Promise<unknown>
		getCatalog?: (opts: { jid?: string; limit?: number; cursor?: string }) => Promise<unknown>
	},
	jid?: string
): Promise<unknown> {
	if (typeof sock.getCatalog === 'function') {
		return sock.getCatalog({ jid })
	}

	if (typeof sock.query !== 'function') {
		throw new Error('[furina-commerce] socket tidak mendukung query/getCatalog')
	}

	return sock.query(
		{
			tag: 'iq',
			attrs: { to: '@s.whatsapp.net', type: 'get', xmlns: 'w:biz:catalog' },
			content: [{ tag: 'product_catalog', attrs: { jid: jid ?? '', allow_shop_source: 'true' } }]
		},
		15_000
	)
}
