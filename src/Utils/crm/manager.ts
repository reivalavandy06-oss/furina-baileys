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
import { jidNormalizedUser } from '../../WABinary'

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

	// Reference listener disimpan supaya .off() bisa dipanggil dengan handler
	// yang sama persis. Arrow inline tidak bisa dilepas — itu sumber leak-nya.
	private readonly handleUpsert = ({ messages }: any): void => {
		this.handleMessageUpsert(messages)
	}
	private listenersAttached = false
	private disposed = false

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
	// Delegate ke dispose() supaya user yang sudah memanggil close() ikut
	// dapat listener yang benar-benar dilepas.
	async close(): Promise<void> {
		this.dispose()
		await this.storage.close()
	}

	// ═══════════════════════════════════════════════════════════════════
	// LIFECYCLE
	// ═══════════════════════════════════════════════════════════════════

	// Lepas semua listener milik instance ini. Idempoten: panggil berkali-kali
	// aman. Hanya melepas handler yang kita daftarkan sendiri — listener lain di
	// sock.ev (termasuk instance CRMManager lain) tidak disentuh.
	dispose(): void {
		if (this.disposed) return
		this.disposed = true

		if (this.listenersAttached) {
			this.sock.ev?.off('messages.upsert', this.handleUpsert)
			this.listenersAttached = false
		}
	}

	// Status lifecycle, supaya kode eksternal bisa tahu manager sudah dibuang
	// sebelum memasang listener lagi.
	get isDisposed(): boolean {
		return this.disposed
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
		// Idempoten: panggil ulang pada instance yang sama tidak boleh menambah
		// listener kedua, karena tiap handler yang menumpuk akan memproses event
		// yang sama berulang (customer double-track, message terhitung dua kali).
		if (this.disposed || this.listenersAttached) return

		this.sock.ev.on('messages.upsert', this.handleUpsert)
		this.listenersAttached = true
	}

	private handleMessageUpsert(messages: any[]): void {
		// Setelah dispose, event yang sudah terlanjur di-queue tidak boleh
		// menyentuh storage yang sudah ditutup.
		if (this.disposed) return
		if (!Array.isArray(messages)) return

		for (const msg of messages) {
			// Skip message dari diri sendiri
			if (!isIncomingMessage(msg)) continue

			// Extract JID customer, lalu kanonikalkan sebelum dipakai sebagai key.
			// WhatsApp merotasi device suffix (user:12@ -> user:34@), jadi JID mentah
			// memecah satu orang jadi beberapa customer: history, tag, dan broadcast
			// jadi terpecah. JID yang tidak bisa didekode tetap dipakai apa adanya.
			const rawSenderJid = extractCustomerJid(msg)
			if (!rawSenderJid) continue
			const senderJid = jidNormalizedUser(rawSenderJid) || rawSenderJid

			// Extract text content (pakai detector baru yang support semua type)
			const content = extractMessageText(msg.message)

			// Detect message type (full detection dengan unwrap + subType)
			const detection = detectMessageTypeFull(msg.message, msg.key, msg)

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
				// Jangan sampai failure tracking ini breaking message handling,
				// tapi jangan juga ditelan diam-diam — tanpa log, mungkin bug
				// tracking-nya nggak ketahuan sama sekali.
				this.sock.logger?.debug({ err, jid: senderJid }, 'CRM: trackIncomingMessage failed')
			})
		}
	}
}
