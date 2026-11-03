import { proto } from '../../../WAProto/index.js'
import type { WAMessage } from '../../Types'
import { generateMessageIDV2 } from '../generics'
import { jidNormalizedUser } from '../../WABinary/jid-utils'
import { getMediaPreparer } from './media-seam'
import type { RichMessageSendOptions } from './rich-message'
import type { FurinaSocket } from './types'

export interface StickerPackItem {
	/** sticker file: a Buffer, a local path, or an http(s) URL */
	data: Buffer | string
	emojis?: string[]
	isAnimated?: boolean
	isLottie?: boolean
	accessibilityLabel?: string
}

export interface StickerPackOptions {
	name: string
	publisher: string
	stickers: StickerPackItem[]
	/** optional tray/cover image (Buffer or http(s) URL) */
	cover?: Buffer | string
	description?: string
}

/** WhatsApp limits one pack message to 60 stickers. */
export const STICKER_PACK_MAX_ITEMS = 60
export const STICKER_PACK_BATCH_DELAY_MS = 2000

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

const stickerMimetype = (item: StickerPackItem): string => {
	if (item.isLottie) return 'application/wasm'
	if (item.isAnimated) return 'image/webp'
	return 'image/webp'
}

const toStickerData = (data: Buffer | string) => (Buffer.isBuffer(data) ? data : { url: data })

/** Splits stickers into batches of at most `STICKER_PACK_MAX_ITEMS`. */
export function batchStickers(stickers: StickerPackItem[]): StickerPackItem[][] {
	const batches: StickerPackItem[][] = []
	for (let i = 0; i < stickers.length; i += STICKER_PACK_MAX_ITEMS) {
		batches.push(stickers.slice(i, i + STICKER_PACK_MAX_ITEMS))
	}

	return batches
}

async function buildStickerPackContent(
	sock: FurinaSocket,
	options: StickerPackOptions,
	batch: StickerPackItem[],
	batchIndex: number,
	batchCount: number
): Promise<proto.IMessage> {
	const prepare = getMediaPreparer()
	const stickers: proto.Message.StickerPackMessage.ISticker[] = []

	for (const [index, item] of batch.entries()) {
		// Uploading each sticker registers its media keys/direct path server-side.
		await prepare({ sticker: toStickerData(item.data) }, { upload: sock.waUploadToServer })

		stickers.push({
			fileName: `sticker-${batchIndex}-${index}.webp`,
			isAnimated: item.isAnimated ?? false,
			isLottie: item.isLottie ?? false,
			emojis: item.emojis ?? [],
			accessibilityLabel: item.accessibilityLabel ?? '',
			mimetype: stickerMimetype(item)
		})
	}

	let coverData: { thumbnailWidth?: number; thumbnailHeight?: number } = {}
	if (options.cover) {
		const prepared = await prepare(
			{ image: toStickerData(options.cover) },
			{
				upload: sock.waUploadToServer
			}
		)
		const image = prepared.imageMessage
		coverData = {
			thumbnailWidth: image?.width ?? undefined,
			thumbnailHeight: image?.height ?? undefined
		}
	}

	const suffix = batchCount > 1 ? ` (${batchIndex + 1}/${batchCount})` : ''

	return {
		stickerPackMessage: {
			stickerPackId: generateMessageIDV2(),
			name: `${options.name}${suffix}`,
			publisher: options.publisher,
			packDescription: options.description,
			stickers,
			stickerPackOrigin: proto.Message.StickerPackMessage.StickerPackOrigin.THIRD_PARTY,
			...coverData
		}
	}
}

/**
 * Sends a sticker pack. Packs with more than 60 stickers are split into
 * batches, with a 2s pause between batches to stay under anti-spam limits.
 */
export async function sendStickerPack(
	sock: FurinaSocket,
	jid: string,
	options: StickerPackOptions,
	sendOptions: RichMessageSendOptions = {}
): Promise<WAMessage[]> {
	if (!options.stickers || options.stickers.length === 0) {
		throw new Error('[furina-sticker-pack] minimal 1 sticker')
	}

	const normalizedJid = jidNormalizedUser(jid)
	if (!normalizedJid) {
		throw new Error(`Invalid JID: ${jid}`)
	}

	const batches = batchStickers(options.stickers)
	const results: WAMessage[] = []

	for (const [index, batch] of batches.entries()) {
		const content = await buildStickerPackContent(sock, options, batch, index, batches.length)
		results.push(await sock.relayMessage(normalizedJid, content, sendOptions))

		if (index < batches.length - 1) {
			await sleep(STICKER_PACK_BATCH_DELAY_MS)
		}
	}

	return results
}
