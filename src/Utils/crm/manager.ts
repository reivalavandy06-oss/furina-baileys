// manager.ts
// CRMManager - Main orchestrator for Furina CRM module
// Coordinates semua sub-modules dan provide high-level API
// FINAL VERSION - integrate dengan message-detector baru

import type { CRMStorage } from './storage/interface'
import type { CRMConfig, CRMCustomer, CRMMessageType } from './types'
import { InMemoryStorage } from './storage/memory'
import { CRMCustomerManager } from './customer'
import { CRMActivityTracker } from './activity'
import { CRMConversationManager } from './conversation'
import { CRMAnalyticsManager } from './analytics'
import {
	detectMessageTypeFull,
	extractMessageText,
	extractCustomerJid,
	extractGroupJid,
	isIncomingMessage,
} from './message-detector'

// Default config: semua fitur aktif dengan setting yang aman
const DEFAULT_CONFIG: Required<CRMConfig> = {
	storage: undefined as any, // akan di-override di constructor
	autoTrackMessages: true,
	autoTrackActivities: true,
	maxConversationHistory: 100,
	defaultCustomerStatus: 'new',
	broadcast: {
		defaultDelay: 3000,        // 3 detik antar message (anti-ban)
		defaultBatchSize: 10,      // 10 message per batch
		defaultJitter: 500,        // random ±500ms biar natural
	},
	automation: {
		enabled: true,
		maxRules: 100,             // max 100 automation rules
		checkInterval: 60000,      // cek tiap 1 menit
	},
	webhook: {
		enabled: true,
		timeout: 10000,            // 10 detik timeout
		retryAttempts: 3,          // retry 3x kalau gagal
	},
	campaign: {
		enabled: true,
		checkInterval: 60000,      // cek campaign tiap 1 menit
	},
}

export class CRMManager {
	private sock: any
	private storage: CRMStorage
	private config: Required<CRMConfig>

	// Sub-modules (public access buat advanced usage)
	public customer: CRMCustomerManager
	public activity: CRMActivityTracker
	public conversation: CRMConversationManager
	public analytics: CRMAnalyticsManager

	constructor(sock: any, config: CRMConfig = {}) {
		this.sock = sock

		// Merge user config dengan defaults (deep merge buat nested objects)
		this.config = {
			...DEFAULT_CONFIG,
			...config,
			broadcast: { ...DEFAULT_CONFIG.broadcast, ...config.broadcast },
			automation: { ...DEFAULT_CONFIG.automation, ...config.automation },
			webhook: { ...DEFAULT_CONFIG.webhook, ...config.webhook },
			campaign: { ...DEFAULT_CONFIG.campaign, ...config.campaign },
		}

		// Use provided storage atau default ke InMemoryStorage
		this.storage = config.storage ?? new InMemoryStorage()

		// Initialize sub-modules
		this.customer = new CRMCustomerManager(this.storage)
		this.activity = new CRMActivityTracker(this.storage)
		this.conversation = new CRMConversationManager(this.storage)
		this.analytics = new CRMAnalyticsManager(this.storage)

		// Attach event listeners kalau auto-tracking aktif
		if (this.config.autoTrackMessages || this.config.autoTrackActivities) {
			this.attachListeners()
		}
	}

	// Initialize storage (panggil ini sebelum pakai CRM)
	async init(): Promise<void> {
		await this.storage.init()
	}

	// Close storage (panggil ini pas bot shutdown)
	async close(): Promise<void> {
		await this.storage.close()
	}

	// ═══════════════════════════════════════════════════════════════════
	// HIGH-LEVEL API
	// ═══════════════════════════════════════════════════════════════════

	// Track incoming message (auto-create customer kalau belum ada)
	// Sekarang support messageType detection!
	async trackIncomingMessage(
		senderJid: string,
		content: string,
		options: {
			messageId?: string
			groupJid?: string | null
			pushname?: string | null
			messageType?: CRMMessageType
			interactiveSubType?: 'nativeFlow' | 'a2ui' | 'carousel' | 'collection' | 'form' | 'button' | 'list' | null
			unwrappedFrom?: CRMMessageType | null
		} = {}
	): Promise<CRMCustomer> {
		// Get or create customer
		const customer = await this.customer.getOrCreate(senderJid, {
			pushname: options.pushname,
			status: this.config.defaultCustomerStatus,
		})

		// Track conversation (skip kalau internal type)
		if (this.config.autoTrackMessages) {
			await this.conversation.trackInbound(senderJid, content, {
				id: options.messageId,
				groupJid: options.groupJid,
				messageType: options.messageType,
				interactiveSubType: options.interactiveSubType,
				unwrappedFrom: options.unwrappedFrom,
			})
		}

		// Track activity
		if (this.config.autoTrackActivities) {
			await this.activity.logMessageReceived(senderJid, options.messageId ?? 'unknown')
		}

		// Update customer stats
		await this.customer.incrementMessageCount(senderJid)
		await this.customer.touch(senderJid)

		return customer
	}

	// Track outgoing message
	async trackOutgoingMessage(
		recipientJid: string,
		content: string,
		options: {
			messageId?: string
			groupJid?: string | null
			messageType?: CRMMessageType
		} = {}
	): Promise<void> {
		// Track conversation
		if (this.config.autoTrackMessages) {
			await this.conversation.trackOutbound(recipientJid, content, {
				id: options.messageId,
				groupJid: options.groupJid,
				messageType: options.messageType,
			})
		}

		// Track activity
		if (this.config.autoTrackActivities) {
			await this.activity.logMessageSent(recipientJid, options.messageId ?? 'unknown')
		}
	}

	// Get comprehensive customer info
	async getCustomerInfo(jid: string): Promise<{
		customer: CRMCustomer | null
		activities: any[]
		conversation: any[]
		tags: string[]
	}> {
		const customer = await this.customer.getOrCreate(jid)
		const activities = await this.activity.getCustomerActivities(jid, 10)
		const conversation = await this.conversation.getConversation(jid, 10)

		return {
			customer,
			activities,
			conversation,
			tags: customer.tags,
		}
	}

	// Send follow-up message (dengan CRM tracking)
	async sendFollowUp(
		recipientJid: string,
		text: string,
		options: { tag?: string } = {}
	): Promise<void> {
		// Send message via Baileys
		await this.sock.sendMessage(recipientJid, { text })

		// Track di CRM
		await this.trackOutgoingMessage(recipientJid, text, {
			messageType: 'conversation',
		})

		// Add follow-up tag kalau specified
		if (options.tag) {
			await this.customer.addTag(recipientJid, options.tag)
			await this.activity.logTagAdded(recipientJid, options.tag)
		}
	}

	// Get analytics report
	async getReport(): Promise<string> {
		return this.analytics.generateReport()
	}

	// ═══════════════════════════════════════════════════════════════════
	// EVENT LISTENERS - auto-track dari Baileys events
	// ═══════════════════════════════════════════════════════════════════

	private attachListeners(): void {
		// Listen buat incoming messages
		this.sock.ev.on('messages.upsert', ({ messages }: any) => {
			this.handleMessageUpsert(messages)
		})
	}

	private handleMessageUpsert(messages: any[]): void {
		if (!Array.isArray(messages)) return

		for (const msg of messages) {
			// Skip message dari diri sendiri
			if (!isIncomingMessage(msg)) continue

			// Extract JID customer
			const senderJid = extractCustomerJid(msg)
			if (!senderJid) continue

			// Extract text content (pakai detector baru yang support semua type)
			const content = extractMessageText(msg.message)

			// Detect message type (full detection dengan unwrap + subType)
			const detection = detectMessageTypeFull(msg.message, msg.key)

			// Skip internal types (protocol, senderKeyDistribution, dll)
			// Ini biar CRM nggak ke-pollute sama message internal
			if (detection.isInternal) {
				// Optional: log di debug mode
				// console.log(`[CRM] Skipping internal message: ${detection.type}`)
				continue
			}

			// Extract group JID (kalau di grup)
			const groupJid = extractGroupJid(msg)

			// Track incoming message dengan semua info yang terdeteksi
			this.trackIncomingMessage(senderJid, content, {
				messageId: msg.key?.id,
				groupJid,
				pushname: msg.pushName,
				messageType: detection.type,
				interactiveSubType: detection.subType,
				unwrappedFrom: detection.unwrappedFrom,
			}).catch(err => {
				// Silently fail - jangan break message handling
				// Tapi log error di debug mode
				// console.error('[CRM] Track error:', err)
			})
		}
	}
}
