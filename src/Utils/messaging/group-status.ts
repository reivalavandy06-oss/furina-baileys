import { proto } from '../../../WAProto/index.js'
import type { WAMessage } from '../../Types'
import { generateWAMessageFromContent } from '../messages'
import { jidNormalizedUser } from '../../WABinary/jid-utils'
import { getMediaPreparer } from './media-seam'
import type { RichMessageSendOptions } from './rich-message'
import type { FurinaSocket } from './types'

export interface GroupStatusContent {
	text?: string
	textColor?: string
	backgroundColor?: string
	image?: Buffer | string
	video?: Buffer | string
	audio?: Buffer | string
	sticker?: Buffer | string
	caption?: string
}

const parseColor = (color?: string): number | undefined => {
	if (!color) return undefined
	const hex = color.replace(/^#/, '')
	if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) return undefined
	return parseInt(hex.length === 6 ? `ff${hex}` : hex, 16) >>> 0
}

const mediaSource = (data: Buffer | string) => (Buffer.isBuffer(data) ? data : { url: data })

/** Prepares the media/content message (test seam aware) for a group status. */
async function buildStatusContent(sock: FurinaSocket, content: GroupStatusContent): Promise<proto.IMessage> {
	const prepare = getMediaPreparer()
	const options = { upload: sock.waUploadToServer }

	if (content.image) {
		const prepared = await prepare({ image: mediaSource(content.image), caption: content.caption }, options)
		return { imageMessage: prepared.imageMessage ?? undefined }
	}

	if (content.video) {
		const prepared = await prepare({ video: mediaSource(content.video), caption: content.caption }, options)
		return { videoMessage: prepared.videoMessage ?? undefined }
	}

	if (content.audio) {
		const prepared = await prepare({ audio: mediaSource(content.audio), ptt: true }, options)
		return { audioMessage: prepared.audioMessage ?? undefined }
	}

	if (content.sticker) {
		const prepared = await prepare({ sticker: mediaSource(content.sticker) }, options)
		return { stickerMessage: prepared.stickerMessage ?? undefined }
	}

	return {
		extendedTextMessage: {
			text: content.text ?? '',
			textArgb: parseColor(content.textColor),
			backgroundArgb: parseColor(content.backgroundColor)
		}
	}
}

/**
 * Sends a status into a group's status ring. Uses
 * `generateWAMessageFromContent` + `relayMessage` (not `sendMessage`) so the
 * `contextInfo` markers (`isGroupStatus`, `statusSourceType`,
 * `statusAudienceMetadata`) are attached to the specific content key.
 */
export async function sendGroupStatus(
	sock: FurinaSocket,
	groupJid: string,
	content: GroupStatusContent,
	options: RichMessageSendOptions = {}
): Promise<WAMessage> {
	const normalizedJid = jidNormalizedUser(groupJid)
	if (!normalizedJid) {
		throw new Error(`Invalid JID: ${groupJid}`)
	}

	const contentMessage = await buildStatusContent(sock, content)

	const contextInfo: proto.IContextInfo = {
		isGroupStatus: true,
		statusSourceType: statusSourceType(content),
		statusAudienceMetadata: {
			audienceType: proto.ContextInfo.StatusAudienceMetadata.AudienceType.CLOSE_FRIENDS
		}
	}

	applyContextInfo(contentMessage, contextInfo)

	const message = generateWAMessageFromContent(normalizedJid, contentMessage, {
		userJid: normalizedJid,
		...(options.messageId ? { messageId: options.messageId } : {}),
		...(options.quoted ? { quoted: options.quoted } : {})
	})

	await sock.relayMessage(normalizedJid, message.message!, {
		messageId: message.key.id!,
		...(options.additionalAttributes ? { additionalAttributes: options.additionalAttributes } : {})
	})

	return message
}

function statusSourceType(content: GroupStatusContent): proto.ContextInfo.StatusSourceType {
	if (content.image) return proto.ContextInfo.StatusSourceType.IMAGE
	if (content.video) return proto.ContextInfo.StatusSourceType.VIDEO
	if (content.audio) return proto.ContextInfo.StatusSourceType.AUDIO
	return proto.ContextInfo.StatusSourceType.TEXT
}

function applyContextInfo(message: proto.IMessage, contextInfo: proto.IContextInfo) {
	const keys: (keyof proto.IMessage)[] = [
		'extendedTextMessage',
		'imageMessage',
		'videoMessage',
		'audioMessage',
		'stickerMessage'
	]

	for (const key of keys) {
		const value = message[key]
		if (value && typeof value === 'object') {
			;(value as { contextInfo?: proto.IContextInfo }).contextInfo = contextInfo
			return
		}
	}

	// Bare text fallback (shouldn't happen; buildStatusContent always emits
	// extendedTextMessage for text statuses).
	if (typeof message.conversation === 'string') {
		message.extendedTextMessage = { text: message.conversation, contextInfo }
		delete message.conversation
	}
}
