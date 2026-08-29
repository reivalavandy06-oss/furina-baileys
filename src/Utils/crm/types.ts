// types.ts
// Type definitions for Furina CRM module
// FINAL VERSION - 96 message type union members based on WAProto.proto resmi WhiskeySockets/Baileys
// Source of truth: https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/WAProto/WAProto.proto
// Humanized with clear grouping per kategori biar gampang dipahami

import type { CRMStorage } from './storage/interface'

// ═══════════════════════════════════════════════════════════════════
// CUSTOMER TYPES - data customer yang kita track
// ═══════════════════════════════════════════════════════════════════

export type CRMCustomerStatus = 'new' | 'active' | 'inactive' | 'vip' | 'blocked'

export interface CRMCustomer {
	jid: string
	lid: string | null
	pn: string | null
	pushname: string | null
	status: CRMCustomerStatus
	tags: string[]
	metadata: Record<string, any>
	firstSeen: number
	lastSeen: number
	messageCount: number
	createdAt: number
	updatedAt: number
}

// ═══════════════════════════════════════════════════════════════════
// ACTIVITY TYPES - log aktivitas customer
// ═══════════════════════════════════════════════════════════════════

export interface CRMActivity {
	id: string
	customerJid: string
	activityType: string
	metadata: Record<string, any>
	timestamp: number
}

// ═══════════════════════════════════════════════════════════════════
// MESSAGE TYPES - 95 fields resmi dari WAProto.proto + 'unknown'
// Diurutin per kategori biar gampang dipahami
// ═══════════════════════════════════════════════════════════════════

export type CRMMessageType =

	// ═══ GRUP A: BASIC MESSAGES (yang paling sering dipakai) ═══
	| 'conversation'                      // text biasa
	| 'extendedTextMessage'               // text + link preview / mention / quote
	| 'imageMessage'                      // gambar
	| 'videoMessage'                      // video biasa
	| 'ptvMessage'                        // video note lingkaran (push-to-video)
	| 'audioMessage'                      // voice note / audio
	| 'documentMessage'                   // file / dokumen
	| 'stickerMessage'                    // stiker biasa
	| 'stickerPackMessage'                // add sticker pack
	| 'lottieStickerMessage'              // stiker animasi lottie
	| 'contactMessage'                    // 1 kontak (vCard)
	| 'contactsArrayMessage'              // banyak kontak
	| 'locationMessage'                   // lokasi statis
	| 'liveLocationMessage'               // live sharing lokasi
	| 'albumMessage'                      // album media (koleksi foto/video)

	// ═══ GRUP B: INTERACTIVE, FLOWS & BUSINESS UI ═══
	| 'interactiveMessage'                // MODERN: button/list/A2UI/nativeFlow (yang lo kirim di screenshot)
	| 'interactiveResponseMessage'        // hasil klik interactive modern
	| 'buttonsMessage'                    // DEPRECATED: button lama
	| 'buttonsResponseMessage'            // DEPRECATED: hasil klik button lama
	| 'listMessage'                       // DEPRECATED: list menu lama
	| 'listResponseMessage'               // hasil klik list lama
	| 'templateMessage'                   // HSM template WA Business
	| 'templateButtonReplyMessage'        // reply ke template button
	| 'highlyStructuredMessage'           // HSM interactive
	| 'productMessage'                    // 1 produk dari katalog
	| 'productListMessage'                // multi produk katalog
	| 'orderMessage'                      // pesanan dari katalog
	| 'invoiceMessage'                    // invoice / tagihan resmi

	// ═══ GRUP C: PAYMENT ═══
	| 'requestPaymentMessage'             // minta bayar
	| 'sendPaymentMessage'                // bukti transfer / kirim bayar
	| 'declinePaymentRequestMessage'      // tolak permintaan bayar
	| 'cancelPaymentRequestMessage'       // batal permintaan bayar
	| 'paymentInviteMessage'              // undangan aktivasi payment
	| 'requestPhoneNumberMessage'         // minta nomor telepon

	// ═══ GRUP D: POLL, REACTION, EDIT, KEEP ═══
	| 'pollCreationMessage'               // poll v1
	| 'pollCreationMessageV2'             // poll v2 (encrypted voters)
	| 'pollCreationMessageV3'             // poll v3
	| 'pollCreationMessageV4'             // poll v4
	| 'pollCreationMessageV5'             // poll v5 (terbaru)
	| 'pollUpdateMessage'                 // vote poll
	| 'pollResultSnapshotMessage'         // hasil poll snapshot
	| 'pollResultSnapshotMessageV3'       // hasil poll snapshot v3
	| 'reactionMessage'                   // emoji reaction
	| 'encReactionMessage'                // emoji reaction (encrypted)
	| 'editedMessage'                     // pesan diedit
	| 'commentMessage'                    // reply ke status
	| 'encCommentMessage'                 // reply status (encrypted)
	| 'keepInChatMessage'                 // "Keep in Chat" (biar nggak ilang pas ephemeral)

	// ═══ GRUP E: STATUS / CHANNEL / EVENT / GROUP ═══
	| 'statusMentionMessage'              // mention nomor di status
	| 'statusAddYours'                    // sticker "Add Yours"
	| 'statusQuotedMessage'               // quote ke status
	| 'statusStickerInteractionMessage'   // interaksi stiker di status
	| 'statusQuestionAnswerMessage'       // Q&A di status
	| 'statusNotificationMessage'         // notifikasi status
	| 'questionMessage'                   // question sticker
	| 'questionReplyMessage'              // reply question
	| 'questionResponseMessage'           // response question
	| 'groupStatusMentionMessage'         // mention status di grup
	| 'groupStatusMessage'                // status grup v1
	| 'groupStatusMessageV2'              // status grup v2
	| 'eventMessage'                      // event grup (RSVP)
	| 'encEventResponseMessage'           // response RSVP event (encrypted)
	| 'groupInviteMessage'                // link / card undangan grup
	| 'groupMentionedMessage'             // mention grup
	| 'newsletterAdminInviteMessage'      // invite admin channel
	| 'newsletterFollowerInviteMessageV2' // invite follow channel (v2)

	// ═══ GRUP F: CALL / BOT / META AI ═══
	| 'callLogMesssage'                   // log telpon (PERINGATAN: typo resmi proto, 3 huruf 's'!)
	| 'bcallMessage'                      // business call log
	| 'scheduledCallCreationMessage'      // jadwal call
	| 'scheduledCallEditMessage'          // edit jadwal call
	| 'botInvokeMessage'                  // mention Meta AI / bot
	| 'botTaskMessage'                    // task dari bot
	| 'botForwardedMessage'               // forward dari bot
	| 'richResponseMessage'               // AI rich response (Meta AI response)

	// ═══ GRUP G: WRAPPER (harus di-unwrap, bukan type final) ═══
	// Catatan: detector akan unwrap dan return type dalamnya
	| 'viewOnceMessage'                   // wrapper view once v1
	| 'viewOnceMessageV2'                 // wrapper view once v2
	| 'viewOnceMessageV2Extension'        // wrapper view once + caption
	| 'documentWithCaptionMessage'        // wrapper doc + caption
	| 'ephemeralMessage'                  // wrapper disappearing message
	| 'associatedChildMessage'            // wrapper child message
	| 'eventCoverImage'                   // wrapper cover image event
	| 'pollCreationOptionImageMessage'    // wrapper poll option image

	// ═══ GRUP H: INTERNAL / PROTOCOL (skip dari tracking CRM) ═══
	// Catatan: detector akan return type ini tapi conversation.ts akan skip track
	| 'protocolMessage'                   // revoke / delete / ephemeral timer / device sync
	| 'senderKeyDistributionMessage'      // distribusi e2e key
	| 'fastRatchetKeySenderKeyDistributionMessage' // fast ratchet key
	| 'deviceSentMessage'                 // sync dari device lain (companion)
	| 'messageContextInfo'                // metadata kontekstual
	| 'stickerSyncRMRMessage'             // sync sticker RMR
	| 'messageHistoryBundle'              // bundle history pesan
	| 'messageHistoryNotice'              // notifikasi history
	| 'placeholderMessage'                // placeholder (belum ter-decrypt)
	| 'secretEncryptedMessage'            // secret encrypted
	| 'limitSharingMessage'               // limit sharing notice
	| 'call'                              // raw call object
	| 'chat'                              // raw chat object

	// ═══ FALLBACK ═══
	| 'unknown'                           // kalau WA nambah type baru atau nggak ke-detect

// ═══════════════════════════════════════════════════════════════════
// MESSAGE INTERFACE - structure message yang kita track di CRM
// ═══════════════════════════════════════════════════════════════════

export interface CRMMessage {
	id: string
	customerJid: string
	groupJid: string | null
	direction: 'in' | 'out'
	content: string
	messageType: CRMMessageType // type-safe, no typo
	timestamp: number
	// Optional: info tambahan buat interactive message
	interactiveSubType?: 'nativeFlow' | 'a2ui' | 'carousel' | 'collection' | 'form' | 'button' | 'list' | null
	// Optional: kalau ini hasil unwrap dari wrapper (misal viewOnce)
	unwrappedFrom?: CRMMessageType | null
	// Optional: flag internal (buat skip tracking)
	isInternal?: boolean
	isStub?: boolean
	stubType?: CRMStubType
}

// ═══════════════════════════════════════════════════════════════════
// ANALYTICS TYPES - metrics bisnis
// ═══════════════════════════════════════════════════════════════════

export interface CRMAnalytics {
	totalCustomers: number
	activeCustomers: number
	newCustomersToday: number
	totalMessages: number
	messagesToday: number
	conversionRate: number
	averageResponseTime: number | null
}

// ═══════════════════════════════════════════════════════════════════
// TAG TYPES
// ═══════════════════════════════════════════════════════════════════

export interface CRMTag {
	name: string
	description: string
	color: string
	createdAt: number
}

// ═══════════════════════════════════════════════════════════════════
// BROADCAST TYPES (Tier 1)
// ═══════════════════════════════════════════════════════════════════

export interface CRMBroadcastSegment {
	tags?: string[]
	status?: CRMCustomerStatus
	lastSeenWithinDays?: number
	excludeTags?: string[]
	customFilter?: (customer: CRMCustomer) => boolean
}

export interface CRMBroadcastOptions {
	delayBetweenMessages?: number
	batchSize?: number
	randomizeDelay?: boolean
	jitter?: number
	trackDelivery?: boolean
	trackRead?: boolean
}

export interface CRMBroadcastMessage {
	id: string
	customerJid: string
	content: string
	personalizedContent: string
	status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
	error?: string
	sentAt: number
	deliveredAt: number | null
	readAt: number | null
}

export interface CRMBroadcastResult {
	broadcastId: string
	totalRecipients: number
	sentCount: number
	deliveredCount: number
	readCount: number
	failedCount: number
	startedAt: number
	completedAt: number | null
	messages: CRMBroadcastMessage[]
}

// ═══════════════════════════════════════════════════════════════════
// AUTOMATION TYPES (Tier 1)
// ═══════════════════════════════════════════════════════════════════

export type CRMAutomationTriggerType =
	| 'new_customer'
	| 'message_received'
	| 'message_sent'
	| 'tag_added'
	| 'tag_removed'
	| 'status_changed'
	| 'no_message_for'
	| 'message_count_gte'
	| 'has_tag'
	| 'converted'

export type CRMAutomationActionType =
	| 'send_message'
	| 'add_tag'
	| 'remove_tag'
	| 'update_status'
	| 'log_activity'
	| 'webhook'

export interface CRMAutomationTrigger {
	type: CRMAutomationTriggerType
	tag?: string
	hours?: number
	days?: number
	count?: number
	within?: string
	AND?: CRMAutomationTrigger
	OR?: CRMAutomationTrigger
}

export interface CRMAutomationAction {
	type: CRMAutomationActionType
	text?: string
	messageType?: CRMMessageType // type-safe
	tag?: string
	status?: CRMCustomerStatus
	activityType?: string
	metadata?: Record<string, any>
	url?: string
	payload?: Record<string, any>
}

export interface CRMAutomationRule {
	id: string
	name: string
	description?: string
	trigger: CRMAutomationTrigger
	action: CRMAutomationAction
	enabled: boolean
	createdAt: number
	lastTriggered: number | null
	triggerCount: number
}

// ═══════════════════════════════════════════════════════════════════
// WEBHOOK TYPES (Tier 2)
// ═══════════════════════════════════════════════════════════════════

export type CRMWebhookEvent =
	| 'new_message'
	| 'message_sent'
	| 'customer_created'
	| 'tag_added'
	| 'tag_removed'
	| 'status_changed'
	| 'converted'
	| 'broadcast_sent'
	| 'campaign_completed'
	| 'donation_detected'

export interface CRMWebhookPayload {
	event: CRMWebhookEvent
	customer?: CRMCustomer
	message?: CRMMessage
	data?: Record<string, any>
	timestamp: number
}

export interface CRMWebhookConfig {
	id: string
	event: CRMWebhookEvent
	url: string
	headers?: Record<string, string>
	enabled: boolean
	createdAt: number
	lastTriggered: number | null
	successCount: number
	failureCount: number
}

export interface CRMWebhookDeliveryResult {
	success: boolean
	statusCode?: number
	response?: string
	error?: string
	duration: number
}

// ═══════════════════════════════════════════════════════════════════
// CAMPAIGN TYPES (Tier 1 - drip campaign)
// ═══════════════════════════════════════════════════════════════════

export type CRMCampaignStatus = 'pending' | 'active' | 'paused' | 'completed' | 'cancelled'

export interface CRMCampaignStep {
	id: string
	delay: string
	message: string
	messageType?: CRMMessageType // type-safe
	conditions?: {
		hasTag?: string
		notHasTag?: string
		requiresReply?: boolean
	}
}

export interface CRMCampaign {
	id: string
	name: string
	description?: string
	steps: CRMCampaignStep[]
	status: CRMCampaignStatus
	createdAt: number
	updatedAt: number
}

export interface CRMCampaignEnrollment {
	id: string
	campaignId: string
	customerJid: string
	currentStep: number
	status: 'active' | 'completed' | 'cancelled'
	enrolledAt: number
	lastStepSentAt: number | null
	nextStepScheduledAt: number | null
}

// ═══════════════════════════════════════════════════════════════════
// CONFIG TYPES
// ═══════════════════════════════════════════════════════════════════

export interface CRMConfig {
	storage?: CRMStorage
	autoTrackMessages?: boolean
	autoTrackActivities?: boolean
	maxConversationHistory?: number
	defaultCustomerStatus?: CRMCustomerStatus
	broadcast?: {
		defaultDelay?: number
		defaultBatchSize?: number
		defaultJitter?: number
	}
	automation?: {
		enabled?: boolean
		maxRules?: number
		checkInterval?: number
	}
	webhook?: {
		enabled?: boolean
		timeout?: number
		retryAttempts?: number
	}
	campaign?: {
		enabled?: boolean
		checkInterval?: number
	}
}

// ═══════════════════════════════════════════════════════════════════
// MESSAGE CONTENT UTILITY
// ═══════════════════════════════════════════════════════════════════

export interface CRMMessageContent {
	text: string
	type: CRMMessageType
	mediaUrl?: string
	mimetype?: string
	caption?: string
	mentionedJids?: string[]
	quotedMessageId?: string
}

// ═══════════════════════════════════════════════════════════════════
// INTERNAL TYPES - buat Grup H (skip tracking)
// ═══════════════════════════════════════════════════════════════════

export const INTERNAL_MESSAGE_TYPES: ReadonlySet<CRMMessageType> = new Set([
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
])

// Helper function: cek apakah type ini internal (skip dari tracking)
export function isInternalMessageType(type: CRMMessageType): boolean {
	return INTERNAL_MESSAGE_TYPES.has(type)
}

// Helper type buat stub detection
export type CRMStubType = 'viewOnceStub' | 'decryptStub' | 'placeholderStub'


// ═══════════════════════════════════════════════════════════════════
// CHANNEL TYPES (WhatsApp Channel / Newsletter)
// Research: issue #2199 (text OK, media broken), #2204 (viewer_metadata)
// ═══════════════════════════════════════════════════════════════════

export type CRMChannelRole = 'OWNER' | 'ADMIN' | 'SUBSCRIBER' | 'GUEST' | 'UNKNOWN'

export interface CRMChannelRegistry {
	jid: string
	name: string
	invite: string | null
	registeredAt: number
	role: CRMChannelRole
	subscribers?: number
}

export interface SendToChannelOptions {
	allowMedia?: boolean  // default false (media broken di upstream, issue #2199)
	dryRun?: boolean
	postVerifyTimeoutMs?: number  // default 5000, range 3000-10000
}

export interface SendToChannelResult {
	status: 'success' | 'failed' | 'not_admin' | 'dry_run'
	jid: string
	error?: string
	needsPromotion?: boolean  // true kalau bot bukan admin
	postVerified?: boolean  // true kalau pesan beneran tayang (post-verify)
}

// ═══════════════════════════════════════════════════════════════════
// GROUP TYPES
// Research: issue #2157 — bulk ke group bikin auto-logout, wajib throttle
// ═══════════════════════════════════════════════════════════════════

export interface CRMGroupRegistry {
	jid: string
	subject: string
	registeredAt: number
}

export interface SendToGroupsOptions {
	minDelayMs?: number  // default 15000 (15 detik), range 10000-30000
	maxDelayMs?: number  // default 30000 (30 detik)
	maxPerHour?: number  // default 10 groups/jam
	dryRun?: boolean
}

export interface SendToGroupsResult {
	status: 'completed' | 'paused' | 'throttled'
	sentCount: number
	failedCount: number
	totalGroups: number
	quarantined: string[]
	warnings: string[]
}

// ═══════════════════════════════════════════════════════════════════
// REGISTRY STORAGE
// ═══════════════════════════════════════════════════════════════════

export interface CRMRegistryStorage {
	channels: CRMChannelRegistry[]
	groups: CRMGroupRegistry[]
}

// ═══════════════════════════════════════════════════════════════════
// MULTI-CHANNEL BROADCAST
// ═══════════════════════════════════════════════════════════════════

export interface SendToChannelsOptions {
	minDelayMs?: number  // default 10000 (10 detik antar channel)
	maxDelayMs?: number  // default 30000
	dryRun?: boolean
	postVerifyTimeoutMs?: number
}

export interface SendToChannelsResult {
	status: 'completed' | 'paused'
	results: SendToChannelResult[]
	warnings: string[]  // termasuk skip duplikat
	sentCount: number
	failedCount: number
}
