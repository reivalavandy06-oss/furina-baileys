// manager.ts
// Inti orchestration broadcast anti-ban (personal + group + multi-channel)
// + registry channel persist (default: furina-broadcast-channel.json)
// Note: announcement group TIDAK di-skip (user yang decide, bisa kirim kalau bot admin komunitas)

import type { CRMStorage } from '../storage/interface'
import type { CRMCustomer, CRMBroadcastSegment, CRMBroadcastResult } from '../types'
import type {
	SendToChannelOptions,
	SendToChannelResult,
	SendToChannelsOptions,
	SendToChannelsResult,
	SendToGroupsOptions,
	SendToGroupsResult,
	CRMChannelRegistry,
} from '../types'
import { personalizeTemplate, hasVariation, parseSpintax } from './template'
import { filterSegment, validateSegment } from './segment'
import { CRMDeliveryTracker } from './tracker'
import { CRMHealthMonitor } from './health'
import { isBotMemberOfGroup } from './group'
import {
	resolveChannelFromLink,
	isChannelAdmin,
	verifyChannelPostViaEcho,
	getChannelInfo,
	normalizeChannelJid,
} from './channel'
import { CRMChannelRegistryStore, DEFAULT_REGISTRY_FILE } from './registry'

export interface CRMBroadcastConfig {
	minDelayMs: number
	maxDelayMs: number
	maxPerMinute: number
	newChatPenaltyMs: number
	maxRetries: number
	registryPath: string | null
}

const DEFAULT_CONFIG: CRMBroadcastConfig = {
	minDelayMs: 1500,
	maxDelayMs: 5000,
	maxPerMinute: 10,
	newChatPenaltyMs: 2500,
	maxRetries: 3,
	registryPath: DEFAULT_REGISTRY_FILE,
}

export interface BroadcastSendResult extends CRMBroadcastResult {
	status: 'completed' | 'paused' | 'aborted'
	warnings: string[]
	quarantined: string[]
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms))
}

function gaussianDelay(min: number, max: number): number {
	const u = (Math.random() + Math.random() + Math.random()) / 3
	return Math.round(min + u * (max - min))
}

export class CRMBroadcastManager {
	private sock: any
	private storage: CRMStorage
	private config: CRMBroadcastConfig
	public tracker: CRMDeliveryTracker
	public health: CRMHealthMonitor
	public registry: CRMChannelRegistryStore | null
	private quarantined = new Set<string>()
	private sendTimestamps: number[] = []

	constructor(sock: any, storage: CRMStorage, config?: Partial<CRMBroadcastConfig>) {
		this.sock = sock
		this.storage = storage
		this.config = { ...DEFAULT_CONFIG, ...config }
		this.tracker = new CRMDeliveryTracker(sock)
		this.health = new CRMHealthMonitor()

		this.registry = this.config.registryPath
			? new CRMChannelRegistryStore(this.config.registryPath)
			: null

		if (this.sock?.ev) {
			this.sock.ev.on('connection.update', (update: any) => {
				if (update?.connection === 'close') {
					const code = update?.lastDisconnect?.error?.output?.statusCode ?? 0
					this.health.reportDisconnect(code)
				}
			})
		}
	}

	async send(
		segment: CRMBroadcastSegment,
		template: string,
		options: { extra?: Record<string, string>; dryRun?: boolean } = {}
	): Promise<BroadcastSendResult> {
		const startedAt = Date.now()
		const broadcastId = `bc_${startedAt}_${Math.random().toString(36).substring(2, 7)}`
		const warnings: string[] = []

		const allCustomers = await this.storage.listCustomers()
		const validation = validateSegment(allCustomers, segment)
		for (const w of validation.warnings) {
			console.warn('[BROADCAST] WARNING:', w)
			warnings.push(w)
		}
		if (!hasVariation(template)) {
			const w = 'Template tanpa spintax/placeholder — risiko identik'
			console.warn('[BROADCAST] WARNING:', w)
			warnings.push(w)
		}

		const recipients = filterSegment(allCustomers, segment)
		let status: BroadcastSendResult['status'] = 'completed'

		for (const customer of recipients) {
			if (this.health.isPermanentStop()) {
				status = 'aborted'
				break
			}
			if (this.health.shouldPause()) {
				status = 'paused'
				break
			}
			if (this.quarantined.has(customer.jid)) continue

			await this.waitForRateSlot()

			let delay = gaussianDelay(this.config.minDelayMs, this.config.maxDelayMs)
			if (customer.messageCount === 0) delay += this.config.newChatPenaltyMs
			await sleep(delay)

			const content = personalizeTemplate(template, customer, options.extra)
			this.health.reportContent(content)

			if (options.dryRun) {
				this.tracker.track(`dry_${Date.now()}_${customer.jid}`, customer.jid, template, content)
				continue
			}
			await this.sendWithRetry(customer, template, content)
		}

		const records = this.tracker.getAllRecords().filter((r) => r.sentAt >= startedAt)
		const stats = { sent: 0, delivered: 0, read: 0, failed: 0 }
		for (const r of records) {
			if (r.status === 'sent') stats.sent++
			else if (r.status === 'delivered') stats.delivered++
			else if (r.status === 'read') stats.read++
			else if (r.status === 'failed') stats.failed++
		}

		return {
			broadcastId,
			totalRecipients: recipients.length,
			sentCount: stats.sent,
			deliveredCount: stats.delivered,
			readCount: stats.read,
			failedCount: stats.failed,
			startedAt,
			completedAt: Date.now(),
			messages: records,
			status,
			warnings,
			quarantined: Array.from(this.quarantined),
		}
	}

	private async sendWithRetry(
		customer: CRMCustomer,
		template: string,
		content: string
	): Promise<void> {
		let attempts = 0
		while (attempts <= this.config.maxRetries) {
			try {
				const sentMsg = await this.sock.sendMessage(customer.jid, { text: content })
				const messageId = sentMsg?.key?.id ?? `unk_${Date.now()}`
				this.tracker.track(messageId, customer.jid, template, content)
				this.sendTimestamps.push(Date.now())
				this.health.reportDeliverySuccess()
				return
			} catch (err) {
				const e = err as any
				const code = e?.output?.statusCode ?? e?.statusCode ?? 0
				const message = String(e?.message ?? '')
				if (code === 403 || message.includes('not available')) {
					this.quarantined.add(customer.jid)
					this.health.reportDeliveryFailure()
					return
				}
				attempts++
				if (attempts <= this.config.maxRetries) await sleep(2000 * attempts)
			}
		}
		const failId = `fail_${Date.now()}_${customer.jid}`
		this.tracker.track(failId, customer.jid, template, content)
		const rec = this.tracker.getRecord(failId)
		if (rec) {
			rec.status = 'failed'
			rec.error = `failed after ${this.config.maxRetries} retries`
		}
		this.health.reportDeliveryFailure()
	}

	private async waitForRateSlot(): Promise<void> {
		for (;;) {
			const now = Date.now()
			this.sendTimestamps = this.sendTimestamps.filter((t) => now - t < 60_000)
			if (this.sendTimestamps.length < this.config.maxPerMinute) return
			const oldest = this.sendTimestamps[0] ?? now
			const waitMs = Math.max(60_000 - (now - oldest) + 500, 1000)
			await sleep(waitMs)
		}
	}

	getQuarantined(): string[] {
		return Array.from(this.quarantined)
	}

	getHealthReport() {
		return this.health.getReport()
	}

	async registerChannel(linkOrJid: string): Promise<CRMChannelRegistry | null> {
		if (!this.registry) return null

		let jid: string | null = null
		if (linkOrJid.includes('whatsapp.com/channel/')) {
			jid = await resolveChannelFromLink(this.sock, linkOrJid)
		} else {
			jid = normalizeChannelJid(linkOrJid)
		}
		if (!jid) return null

		const info = await getChannelInfo(this.sock, jid)
		if (!info) return null

		const entry: CRMChannelRegistry = {
			jid: info.jid,
			name: info.name,
			invite: info.invite,
			registeredAt: Date.now(),
			role: info.role,
			subscribers: info.subscribers,
		}
		this.registry.add(entry)
		return entry
	}

	listRegisteredChannels(): CRMChannelRegistry[] {
		return this.registry?.list() ?? []
	}

	removeRegisteredChannel(jid: string): void {
		this.registry?.remove(jid)
	}

	// ── SEND TO GROUPS (no auto-skip, user decides for announcement groups) ──
	async sendToGroups(
		groupJids: string[],
		template: string,
		options: SendToGroupsOptions = {}
	): Promise<SendToGroupsResult> {
		const minDelay = options.minDelayMs ?? 15000
		const maxDelay = options.maxDelayMs ?? 30000
		const maxPerHour = options.maxPerHour ?? 10
		const warnings: string[] = []
		const quarantined: string[] = []
		let sentCount = 0
		let failedCount = 0
		let status: SendToGroupsResult['status'] = 'completed'
		const hourTimestamps: number[] = []

		for (const groupJid of groupJids) {
			if (this.health.shouldPause()) {
				console.warn('[GROUP] PAUSED: risk terlalu tinggi')
				status = 'paused'
				break
			}

			const now = Date.now()
			const recent = hourTimestamps.filter((t) => now - t < 3600_000)
			hourTimestamps.length = 0
			hourTimestamps.push(...recent)
			if (hourTimestamps.length >= maxPerHour) {
				console.warn('[GROUP] THROTTLED: cap group per jam')
				status = 'throttled'
				break
			}

			const isMember = await isBotMemberOfGroup(this.sock, groupJid)
			if (!isMember) {
				warnings.push(`Skip ${groupJid}: bot bukan member`)
				continue
			}

			await sleep(gaussianDelay(minDelay, maxDelay))

			const content = parseSpintax(template)
			this.health.reportContent(content)

			if (options.dryRun) {
				console.log('[GROUP DRY RUN] would send to', groupJid)
				sentCount++
				hourTimestamps.push(Date.now())
				continue
			}

			try {
				await this.sock.sendMessage(groupJid, { text: content })
				sentCount++
				hourTimestamps.push(Date.now())
				this.health.reportDeliverySuccess()
			} catch (err) {
				const e = err as any
				const code = e?.output?.statusCode ?? e?.statusCode ?? 0
				if (code === 403 || String(e?.message ?? '').includes('not available')) {
					quarantined.push(groupJid)
					console.warn('[GROUP] Quarantine:', groupJid)
				}
				failedCount++
				this.health.reportDeliveryFailure()
			}
		}

		return {
			status,
			sentCount,
			failedCount,
			totalGroups: groupJids.length,
			quarantined,
			warnings,
		}
	}

	async sendToChannel(
		jidOrLink: string,
		template: string,
		options: SendToChannelOptions = {}
	): Promise<SendToChannelResult> {
		const postVerifyTimeout = options.postVerifyTimeoutMs ?? 5000

		let channelJid = jidOrLink
		if (jidOrLink.includes('whatsapp.com/channel/')) {
			const resolved = await resolveChannelFromLink(this.sock, jidOrLink)
			if (!resolved) {
				return { status: 'failed', jid: jidOrLink, error: 'Link channel invalid' }
			}
			channelJid = resolved
		}

		const isAdmin = await isChannelAdmin(this.sock, channelJid)
		if (!isAdmin) {
			const info = await getChannelInfo(this.sock, channelJid)
			console.warn(
				`[CHANNEL] Bot BUKAN admin "${info?.name ?? channelJid}" (role: ${info?.role ?? 'UNKNOWN'}). ` +
				'Promosikan bot jadi admin channel dulu.'
			)
			return {
				status: 'not_admin',
				jid: channelJid,
				error: 'Bot bukan admin channel',
				needsPromotion: true,
			}
		}

		const content = parseSpintax(template)

		if (options.dryRun) {
			console.log('[CHANNEL DRY RUN] would send to', channelJid)
			return { status: 'dry_run', jid: channelJid, postVerified: false }
		}

		try {
			await this.sock.sendMessage(channelJid, { text: content })
			const verified = await verifyChannelPostViaEcho(this.sock, channelJid, content, postVerifyTimeout)

			if (verified) {
				this.health.reportDeliverySuccess()
				return { status: 'success', jid: channelJid, postVerified: true }
			}

			this.health.reportDeliveryFailure()
			return {
				status: 'failed',
				jid: channelJid,
				error: 'Post tidak ter-verify',
				postVerified: false,
			}
		} catch (err) {
			const e = err as any
			const code = e?.output?.statusCode ?? e?.statusCode ?? 0
			this.health.reportDeliveryFailure()
			return {
				status: 'failed',
				jid: channelJid,
				error: `Error ${code}: ${e?.message ?? 'unknown'}`,
				postVerified: false,
			}
		}
	}

	async sendToChannels(
		inputs: string[],
		template: string,
		options: SendToChannelsOptions = {}
	): Promise<SendToChannelsResult> {
		const minDelay = options.minDelayMs ?? 10000
		const maxDelay = options.maxDelayMs ?? 30000
		const results: SendToChannelResult[] = []
		const warnings: string[] = []
		const seenJids = new Set<string>()
		let sentCount = 0
		let failedCount = 0
		let status: SendToChannelsResult['status'] = 'completed'

		for (let i = 0; i < inputs.length; i++) {
			if (this.health.shouldPause()) {
				console.warn('[CHANNEL] PAUSED: risk terlalu tinggi')
				status = 'paused'
				break
			}

			const input = (inputs[i] ?? '').trim()
			if (!input) continue

			let jid: string | null = null
			if (input.includes('whatsapp.com/channel/')) {
				jid = await resolveChannelFromLink(this.sock, input)
			} else {
				jid = normalizeChannelJid(input)
			}

			if (!jid) {
				warnings.push(`Skip "${input}": link nggak bisa di-resolve`)
				results.push({ status: 'failed', jid: input, error: 'resolve gagal' })
				failedCount++
				continue
			}

			if (seenJids.has(jid)) {
				warnings.push(`Skip ${jid}: duplikat (channel sama udah dikirim)`)
				results.push({ status: 'failed', jid, error: 'duplicate' })
				continue
			}
			seenJids.add(jid)

			if (i > 0) await sleep(gaussianDelay(minDelay, maxDelay))

			const res = await this.sendToChannel(jid, template, {
				dryRun: options.dryRun,
				postVerifyTimeoutMs: options.postVerifyTimeoutMs,
			})
			results.push(res)

			if (res.status === 'success' || res.status === 'dry_run') sentCount++
			else failedCount++
		}

		return { status, results, warnings, sentCount, failedCount }
	}
}
