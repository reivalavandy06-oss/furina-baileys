// message-detector.ts
// Auto-detect message type dari Baileys WAMessage object
// FINAL VERSION - handle semua 95 proto fields + unwrap logic + typo handling
// Humanized: tiap bagian ada comment yang jelas fungsinya apa

import type { CRMMessageType, CRMStubType } from './types'

// ═══════════════════════════════════════════════════════════════════
// 1. UNWRAP LOGIC - buka wrapper biar dapet type asli
// ═══════════════════════════════════════════════════════════════════

// Wrapper types yang harus di-buka dulu (return message dalamnya)
const WRAPPER_FIELDS = [
	'viewOnceMessage',
	'viewOnceMessageV2',
	'viewOnceMessageV2Extension',
	'documentWithCaptionMessage',
	'ephemeralMessage',
	'associatedChildMessage',
	'eventCoverImage',
	'pollCreationOptionImageMessage',
] as const

// Buka wrapper sampe dapet message asli (recursive)
function unwrapMessage(message: any): { unwrapped: any; wrapperType: CRMMessageType | null } {
	if (!message || typeof message !== 'object') {
		return { unwrapped: message, wrapperType: null }
	}

	for (const field of WRAPPER_FIELDS) {
		const wrapperContent = message[field]
		if (wrapperContent && typeof wrapperContent === 'object') {
			// Wrapper FutureProof biasanya punya field .message di dalamnya
			const innerMessage = wrapperContent.message ?? wrapperContent
			// Rekursif: buka lagi kalau masih wrapper
			const result = unwrapMessage(innerMessage)
			if (result.wrapperType === null) {
				// Pertama kali unwrap, catat wrapper type-nya
				return {
					unwrapped: result.unwrapped,
					wrapperType: field as CRMMessageType,
				}
			}
			return result
		}
	}

	return { unwrapped: message, wrapperType: null }
}

// ═══════════════════════════════════════════════════════════════════
// 2. INTERACTIVE SUBTYPE DETECTION
// ═══════════════════════════════════════════════════════════════════

// Detect varian interactive message (biar tau itu button/list/carousel/A2UI)
function detectInteractiveSubType(interactiveMsg: any): 'nativeFlow' | 'a2ui' | 'carousel' | 'collection' | 'form' | 'button' | 'list' | null {
	if (!interactiveMsg || typeof interactiveMsg !== 'object') return null

	// NativeFlow (A2UI canvas) - yang ada di screenshot lo
	if (interactiveMsg.nativeFlowMessage) return 'nativeFlow'

	// Carousel (multiple cards)
	if (interactiveMsg.carouselMessage) return 'carousel'

	// Collection (product collection)
	if (interactiveMsg.collectionMessage) return 'collection'

	// Form (input fields)
	if (interactiveMsg.formMessage) return 'form'

	// Button (legacy style tapi pakai interactiveMessage wrapper)
	if (interactiveMsg.buttonReplyMessage || interactiveMsg.buttonsMessage) return 'button'

	// List (legacy style tapi pakai interactiveMessage wrapper)
	if (interactiveMsg.listMessage || interactiveMsg.listResponseMessage) return 'list'

	// Default: A2UI (generic interactive UI)
	return 'a2ui'
}

// ═══════════════════════════════════════════════════════════════════
// 3. MAIN DETECTOR - cek field per field
// ═══════════════════════════════════════════════════════════════════

// Cek semua 95 fields resmi dari WAProto.proto, urutan dari yang paling sering muncul
function detectInnerMessageType(msg: any): CRMMessageType {
	if (!msg || typeof msg !== 'object') return 'unknown'

	// --- GRUP A: BASIC MESSAGES ---
	if (msg.conversation) return 'conversation'
	if (msg.extendedTextMessage) return 'extendedTextMessage'
	if (msg.imageMessage) return 'imageMessage'
	if (msg.videoMessage) return 'videoMessage'
	if (msg.ptvMessage) return 'ptvMessage'
	if (msg.audioMessage) return 'audioMessage'
	if (msg.documentMessage) return 'documentMessage'
	if (msg.stickerMessage) return 'stickerMessage'
	if (msg.stickerPackMessage) return 'stickerPackMessage'
	if (msg.lottieStickerMessage) return 'lottieStickerMessage'
	if (msg.contactMessage) return 'contactMessage'
	if (msg.contactsArrayMessage) return 'contactsArrayMessage'
	if (msg.locationMessage) return 'locationMessage'
	if (msg.liveLocationMessage) return 'liveLocationMessage'
	if (msg.albumMessage) return 'albumMessage'

	// --- GRUP B: INTERACTIVE & BUSINESS ---
	if (msg.interactiveMessage) return 'interactiveMessage'
	if (msg.interactiveResponseMessage) return 'interactiveResponseMessage'
	if (msg.buttonsMessage) return 'buttonsMessage'
	if (msg.buttonsResponseMessage) return 'buttonsResponseMessage'
	if (msg.listMessage) return 'listMessage'
	if (msg.listResponseMessage) return 'listResponseMessage'
	if (msg.templateMessage) return 'templateMessage'
	if (msg.templateButtonReplyMessage) return 'templateButtonReplyMessage'
	if (msg.highlyStructuredMessage) return 'highlyStructuredMessage'
	if (msg.productMessage) return 'productMessage'
	if (msg.productListMessage) return 'productListMessage'
	if (msg.orderMessage) return 'orderMessage'
	if (msg.invoiceMessage) return 'invoiceMessage'

	// --- GRUP C: PAYMENT ---
	if (msg.requestPaymentMessage) return 'requestPaymentMessage'
	if (msg.sendPaymentMessage) return 'sendPaymentMessage'
	if (msg.declinePaymentRequestMessage) return 'declinePaymentRequestMessage'
	if (msg.cancelPaymentRequestMessage) return 'cancelPaymentRequestMessage'
	if (msg.paymentInviteMessage) return 'paymentInviteMessage'
	if (msg.requestPhoneNumberMessage) return 'requestPhoneNumberMessage'

	// --- GRUP D: POLL, REACTION, EDIT, KEEP ---
	if (msg.pollCreationMessage) return 'pollCreationMessage'
	if (msg.pollCreationMessageV2) return 'pollCreationMessageV2'
	if (msg.pollCreationMessageV3) return 'pollCreationMessageV3'
	if (msg.pollCreationMessageV4) return 'pollCreationMessageV4'
	if (msg.pollCreationMessageV5) return 'pollCreationMessageV5'
	if (msg.pollUpdateMessage) return 'pollUpdateMessage'
	if (msg.pollResultSnapshotMessage) return 'pollResultSnapshotMessage'
	if (msg.pollResultSnapshotMessageV3) return 'pollResultSnapshotMessageV3'
	if (msg.reactionMessage) return 'reactionMessage'
	if (msg.encReactionMessage) return 'encReactionMessage'
	if (msg.editedMessage) return 'editedMessage'
	if (msg.commentMessage) return 'commentMessage'
	if (msg.encCommentMessage) return 'encCommentMessage'
	if (msg.keepInChatMessage) return 'keepInChatMessage'

	// --- GRUP E: STATUS / CHANNEL / EVENT / GROUP ---
	if (msg.statusMentionMessage) return 'statusMentionMessage'
	if (msg.statusAddYours) return 'statusAddYours'
	if (msg.statusQuotedMessage) return 'statusQuotedMessage'
	if (msg.statusStickerInteractionMessage) return 'statusStickerInteractionMessage'
	if (msg.statusQuestionAnswerMessage) return 'statusQuestionAnswerMessage'
	if (msg.statusNotificationMessage) return 'statusNotificationMessage'
	if (msg.questionMessage) return 'questionMessage'
	if (msg.questionReplyMessage) return 'questionReplyMessage'
	if (msg.questionResponseMessage) return 'questionResponseMessage'
	if (msg.groupStatusMentionMessage) return 'groupStatusMentionMessage'
	if (msg.groupStatusMessage) return 'groupStatusMessage'
	if (msg.groupStatusMessageV2) return 'groupStatusMessageV2'
	if (msg.eventMessage) return 'eventMessage'
	if (msg.encEventResponseMessage) return 'encEventResponseMessage'
	if (msg.groupInviteMessage) return 'groupInviteMessage'
	if (msg.groupMentionedMessage) return 'groupMentionedMessage'
	if (msg.newsletterAdminInviteMessage) return 'newsletterAdminInviteMessage'
	if (msg.newsletterFollowerInviteMessageV2) return 'newsletterFollowerInviteMessageV2'

	// --- GRUP F: CALL / BOT / META AI ---
	// TYPO HANDLING: proto resmi punya typo "callLogMesssage" (3 s), gw handle 2 ejaan
	if (msg.callLogMesssage) return 'callLogMesssage'
	if (msg.callLogMessage) return 'callLogMesssage' // normalized ke typo resmi
	if (msg.bcallMessage) return 'bcallMessage'
	if (msg.scheduledCallCreationMessage) return 'scheduledCallCreationMessage'
	if (msg.scheduledCallEditMessage) return 'scheduledCallEditMessage'
	if (msg.botInvokeMessage) return 'botInvokeMessage'
	if (msg.botTaskMessage) return 'botTaskMessage'
	if (msg.botForwardedMessage) return 'botForwardedMessage'
	if (msg.richResponseMessage) return 'richResponseMessage'

	// --- GRUP G: WRAPPER (seharusnya udah ke-unwrap di luar, tapi jaga-jaga) ---
	if (msg.viewOnceMessage) return 'viewOnceMessage'
	if (msg.viewOnceMessageV2) return 'viewOnceMessageV2'
	if (msg.viewOnceMessageV2Extension) return 'viewOnceMessageV2Extension'
	if (msg.documentWithCaptionMessage) return 'documentWithCaptionMessage'
	if (msg.ephemeralMessage) return 'ephemeralMessage'
	if (msg.associatedChildMessage) return 'associatedChildMessage'
	if (msg.eventCoverImage) return 'eventCoverImage'
	if (msg.pollCreationOptionImageMessage) return 'pollCreationOptionImageMessage'

	// --- GRUP H: INTERNAL / PROTOCOL ---
	if (msg.protocolMessage) return 'protocolMessage'
	if (msg.senderKeyDistributionMessage) return 'senderKeyDistributionMessage'
	if (msg.fastRatchetKeySenderKeyDistributionMessage) return 'fastRatchetKeySenderKeyDistributionMessage'
	if (msg.deviceSentMessage) return 'deviceSentMessage'
	if (msg.messageContextInfo) return 'messageContextInfo'
	if (msg.stickerSyncRMRMessage) return 'stickerSyncRMRMessage'
	if (msg.messageHistoryBundle) return 'messageHistoryBundle'
	if (msg.messageHistoryNotice) return 'messageHistoryNotice'
	if (msg.placeholderMessage) return 'placeholderMessage'
	if (msg.secretEncryptedMessage) return 'secretEncryptedMessage'
	if (msg.limitSharingMessage) return 'limitSharingMessage'
	if (msg.call) return 'call'
	if (msg.chat) return 'chat'

		// --- FALLBACK DINAMIS (future-proof) ---
	// Kalau WA versi baru ngirim type yang belum ada di list,
	// cek key apapun yang berakhiran 'Message' biar tetap ke-detect
	// pakai nama key aslinya (bukan 'unknown')
	const dynamicKeys = Object.keys(msg)
	for (const key of dynamicKeys) {
		if (key.endsWith('Message') && msg[key] && typeof msg[key] === 'object') {
			return key as CRMMessageType
		}
	}

	// --- FALLBACK ---
	return 'unknown'
}

// ═══════════════════════════════════════════════════════════════════
// 4. PUBLIC API - yang dipanggil dari luar
// ═══════════════════════════════════════════════════════════════════

// Main detector: unwrap + detect + detect interactive subType
// Return object lengkap biar caller punya semua info
export interface DetectionResult {
	type: CRMMessageType
	subType?: 'nativeFlow' | 'a2ui' | 'carousel' | 'collection' | 'form' | 'button' | 'list' | null
	unwrappedFrom: CRMMessageType | null
	isInternal: boolean
	isStub?: boolean
	stubType?: CRMStubType
}

// Detect view-once stub (payload kosong tapi flag isViewOnce true)
function detectViewOnceStub(message: any, messageKey: any): DetectionResult | null {
	// Bukan stub kalau payload ada isinya
	if (message && typeof message === 'object' && Object.keys(message).length > 0) {
		return null
	}
	
	// Cek flag isViewOnce
	if (messageKey?.isViewOnce === true) {
		// Coba detect tipe media dari stub parameters
		const stubParams = messageKey?.messageStubParameters
		let detectedType: CRMMessageType = 'viewOnceMessageV2'
		
		if (stubParams && Array.isArray(stubParams)) {
			const paramStr = stubParams.join(' ').toLowerCase()
			if (paramStr.includes('audio') || paramStr.includes('voice') || paramStr.includes('vn')) {
				detectedType = 'audioMessage'
			} else if (paramStr.includes('video')) {
				detectedType = 'videoMessage'
			} else if (paramStr.includes('image') || paramStr.includes('photo') || paramStr.includes('pic')) {
				detectedType = 'imageMessage'
			}
		}
		
		return {
			type: detectedType,
			subType: null,
			unwrappedFrom: 'viewOnceMessageV2',
			isInternal: false,
			isStub: true,
			stubType: 'viewOnceStub',
		}
	}
	
	return null
}

// Detect decrypt stub (session belum sinkron, message gagal decrypt)
function detectDecryptStub(message: any, messageKey: any): DetectionResult | null {
	// Bukan stub kalau payload ada isinya
	if (message && typeof message === 'object' && Object.keys(message).length > 0) {
		return null
	}
	
	// Cek apakah ada messageStubType (indikator stub)
	if (messageKey?.messageStubType && !message) {
		return {
			type: 'protocolMessage',
			subType: null,
			unwrappedFrom: null,
			isInternal: true,
			isStub: true,
			stubType: 'decryptStub',
		}
	}
	
	// Placeholder stub (message belum ter-decrypt)
	if (!message && !messageKey?.isViewOnce) {
		return {
			type: 'placeholderMessage',
			subType: null,
			unwrappedFrom: null,
			isInternal: true,
			isStub: true,
			stubType: 'placeholderStub',
		}
	}
	
	return null
}

export function detectMessageTypeFull(message: any, messageKey?: any): DetectionResult {
	// ═══ CEK STUB DULU (sebelum unwrap) ═══
	
	// 1. Cek view-once stub
	const viewOnceResult = detectViewOnceStub(message, messageKey)
	if (viewOnceResult) return viewOnceResult
	
	// 2. Cek decrypt stub
	const decryptResult = detectDecryptStub(message, messageKey)
	if (decryptResult) return decryptResult
	
	// ═══ EXISTING UNWRAP LOGIC ═══
	const { unwrapped, wrapperType } = unwrapMessage(message)
	const type = detectInnerMessageType(unwrapped)

	// Detect subType kalau interactive
	let subType: DetectionResult['subType'] = null
	if (type === 'interactiveMessage' && unwrapped?.interactiveMessage) {
		subType = detectInteractiveSubType(unwrapped.interactiveMessage)
	}

	// Cek apakah ini internal (skip dari tracking)
	const isInternal = [
		'protocolMessage',
		'senderKeyDistributionMessage',
		'fastRatchetKeySenderKeyDistributionMessage',
		'deviceSentMessage',
		'messageContextInfo',
		'stickerSyncRMRMessage',
		'messageHistoryBundle',
		'messageHistoryNotice',
		'placeholderMessage',
		'secretEncryptedMessage',
		'limitSharingMessage',
		'call',
		'chat',
	].includes(type)

	return { type, subType, unwrappedFrom: wrapperType, isInternal }
}

// Versi simple: return string type aja (backward compatible)
export function detectMessageType(message: any): CRMMessageType {
	return detectMessageTypeFull(message).type
}

// ═══════════════════════════════════════════════════════════════════
// 5. TEXT EXTRACTION - ambil text dari semua type message
// ═══════════════════════════════════════════════════════════════════

// Buka wrapper dulu, baru extract text dari message aslinya
export function extractMessageText(message: any): string {
	const { unwrapped } = unwrapMessage(message)
	if (!unwrapped || typeof unwrapped !== 'object') return ''

	const msg = unwrapped

	// Basic text
	if (msg.conversation) return msg.conversation
	if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text

	// Media captions
	if (msg.imageMessage?.caption) return msg.imageMessage.caption
	if (msg.videoMessage?.caption) return msg.videoMessage.caption
	if (msg.ptvMessage?.caption) return msg.ptvMessage.caption
	if (msg.documentMessage?.caption) return msg.documentMessage.caption

	// Interactive message variants
	if (msg.interactiveMessage?.body?.text) return msg.interactiveMessage.body.text
	if (msg.interactiveResponseMessage?.body?.text) return msg.interactiveResponseMessage.body.text
	if (msg.templateMessage?.hydratedTemplate?.hydratedContentText) {
		return msg.templateMessage.hydratedTemplate.hydratedContentText
	}
	if (msg.highlyStructuredMessage?.hydratedTemplate?.hydratedContentText) {
		return msg.highlyStructuredMessage.hydratedTemplate.hydratedContentText
	}

	// Legacy button / list
	if (msg.buttonsMessage?.contentText) return msg.buttonsMessage.contentText
	if (msg.buttonsResponseMessage?.selectedDisplayText) {
		return msg.buttonsResponseMessage.selectedDisplayText
	}
	if (msg.listMessage?.description) return msg.listMessage.description
	if (msg.listResponseMessage?.title) return msg.listResponseMessage.title
	if (msg.templateButtonReplyMessage?.selectedDisplayText) {
		return msg.templateButtonReplyMessage.selectedDisplayText
	}

	// Product / order
	if (msg.productMessage?.title) return msg.productMessage.title
	if (msg.orderMessage?.orderTitle) return msg.orderMessage.orderTitle
	if (msg.invoiceMessage?.note) return msg.invoiceMessage.note

	// Contact / location
	if (msg.contactMessage?.displayName) return msg.contactMessage.displayName
	if (msg.locationMessage?.name) return msg.locationMessage.name

	// Poll / reaction / comment
	if (msg.pollCreationMessage?.name) return msg.pollCreationMessage.name
	if (msg.pollCreationMessageV2?.name) return msg.pollCreationMessageV2.name
	if (msg.pollCreationMessageV3?.name) return msg.pollCreationMessageV3.name
	if (msg.pollCreationMessageV4?.name) return msg.pollCreationMessageV4.name
	if (msg.pollCreationMessageV5?.name) return msg.pollCreationMessageV5.name
	if (msg.reactionMessage?.text) return msg.reactionMessage.text
	if (msg.commentMessage?.message?.conversation) return msg.commentMessage.message.conversation

	// Group / channel
	if (msg.groupInviteMessage?.groupName) return msg.groupInviteMessage.groupName
	if (msg.eventMessage?.name) return msg.eventMessage.name
	if (msg.newsletterMessage?.caption) return msg.newsletterMessage.caption

	// Fallback: coba field text/caption/body umum
	return (
		msg.text ||
		msg.caption ||
		msg.content ||
		msg.title ||
		msg.body?.text ||
		''
	)
}

// ═══════════════════════════════════════════════════════════════════
// 6. HELPER FUNCTIONS - buat extract info dari message
// ═══════════════════════════════════════════════════════════════════

// Cek apakah message dari bot (outgoing)
export function isOutgoingMessage(message: any): boolean {
	return message?.key?.fromMe === true
}

// Cek apakah message dari customer (incoming)
export function isIncomingMessage(message: any): boolean {
	return message?.key?.fromMe === false
}

// Extract JID customer dari message
// Kalau dari bot: remoteJid = customer
// Kalau dari customer di grup: participant = customer
// Kalau dari customer di DM: remoteJid = customer
export function extractCustomerJid(message: any): string | null {
	if (!message?.key) return null
	const key = message.key
	if (key.fromMe) return key.remoteJid || null
	if (key.participant) return key.participant
	return key.remoteJid || null
}

// Extract JID grup (kalau message di grup)
export function extractGroupJid(message: any): string | null {
	const remoteJid = message?.key?.remoteJid
	if (remoteJid && typeof remoteJid === 'string' && remoteJid.endsWith('@g.us')) {
		return remoteJid
	}
	return null
}
