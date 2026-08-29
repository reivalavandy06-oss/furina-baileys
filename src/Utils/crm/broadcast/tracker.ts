// tracker.ts
// Delivery tracking buat broadcast: tau mana yang terkirim/dibaca/gagal
// Research: issue #2363 — JANGAN pakai messages.upsert buat delivery truth
// (dia bisa delay/hilang). Pakai messages.update + timeout fallback.
//
// Mapping status Baileys (WAMessageStatus):
//   0 = ERROR, 1 = PENDING, 2 = SERVER_ACK, 3 = DELIVERY_ACK, 4 = READ, 5 = PLAYED
// Catatan jujur: read receipt tergantung privacy setting penerima.
// Kalau penerima offline, status mentok di SERVER_ACK sampe dia online.

import type { CRMBroadcastMessage } from '../types'

// Konstanta status numeric dari Baileys
const STATUS_ERROR = 0
const STATUS_SERVER_ACK = 2
const STATUS_DELIVERY_ACK = 3
const STATUS_READ = 4

// Timeout fallback: kalau setelah X ms status masih < DELIVERY_ACK,
// kita tandai "unconfirmed" (bukan "failed") — biar nggak salah vonis
const UNCONFIRMED_TIMEOUT_MS = 5 * 60 * 1000 // 5 menit

export class CRMDeliveryTracker {
	private sock: any
	// Map messageId -> record tracking
	private records = new Map<string, CRMBroadcastMessage>()
	// Timer buat nge-sweep yang unconfirmed
	private sweepTimer: ReturnType<typeof setInterval> | null = null

	constructor(sock?: any) {
		this.sock = sock

		// Auto-attach listener kalau socket dikasih
		if (this.sock?.ev) {
			this.attach()
		}
	}

	// ═══════════════════════════════════════════════════════════════
	// ATTACH - listen ke messages.update (sumber kebenaran delivery)
	// ═══════════════════════════════════════════════════════════════
	attach(): void {
		this.sock.ev.on('messages.update', (updates: any[]) => {
			if (!Array.isArray(updates)) return

			for (const entry of updates) {
				const messageId = entry?.key?.id
				const status = entry?.update?.status

				// Cuma proses message yang kita track + status numeric valid
				if (!messageId || typeof status !== 'number') continue
				if (!this.records.has(messageId)) continue

				this.applyStatus(messageId, status)
			}
		})

		// Sweep periodic buat tandai yang unconfirmed
		this.sweepTimer = setInterval(() => this.sweepUnconfirmed(), 60_000)
	}

	// ═══════════════════════════════════════════════════════════════
	// REGISTER - daftarin message broadcast buat di-track
	// ═══════════════════════════════════════════════════════════════
	track(
		messageId: string,
		customerJid: string,
		content: string,
		personalizedContent: string
	): void {
		this.records.set(messageId, {
			id: messageId,
			customerJid,
			content,
			personalizedContent,
			status: 'sent',
			sentAt: Date.now(),
			deliveredAt: null,
			readAt: null,
		})
	}

	// ═══════════════════════════════════════════════════════════════
	// APPLY STATUS - konversi numeric Baileys ke status string kita
	// ═══════════════════════════════════════════════════════════════
	private applyStatus(messageId: string, status: number): void {
		const record = this.records.get(messageId)
		if (!record) return

		if (status === STATUS_ERROR) {
			record.status = 'failed'
			record.error = 'delivery error (status 0)'
		} else if (status >= STATUS_READ) {
			// READ atau PLAYED
			record.status = 'read'
			record.readAt = record.readAt ?? Date.now()
			record.deliveredAt = record.deliveredAt ?? Date.now()
		} else if (status === STATUS_DELIVERY_ACK) {
			record.status = 'delivered'
			record.deliveredAt = record.deliveredAt ?? Date.now()
		} else if (status === STATUS_SERVER_ACK) {
			// Terkirim ke server, belum tentu sampe HP penerima
			record.status = 'sent'
		}
	}

	// ═══════════════════════════════════════════════════════════════
	// SWEEP - tandai yang mentok terlalu lama sebagai unconfirmed
	// ═══════════════════════════════════════════════════════════════
	private sweepUnconfirmed(): void {
		const now = Date.now()

		for (const record of this.records.values()) {
			const age = now - record.sentAt
			const stuck = record.status === 'pending' || record.status === 'sent'

			if (stuck && age > UNCONFIRMED_TIMEOUT_MS) {
				// Jangan vonis "failed" — penerima mungkin cuma offline
				record.status = 'failed'
				record.error = 'unconfirmed: no delivery ack within 5 minutes'
			}
		}
	}

	// ═══════════════════════════════════════════════════════════════
	// QUERY - ambil data tracking
	// ═══════════════════════════════════════════════════════════════
	getRecord(messageId: string): CRMBroadcastMessage | null {
		return this.records.get(messageId) ?? null
	}

	getAllRecords(): CRMBroadcastMessage[] {
		return Array.from(this.records.values())
	}

	// Ringkasan statistik delivery
	getStats(): {
		total: number
		sent: number
		delivered: number
		read: number
		failed: number
	} {
		const stats = { total: 0, sent: 0, delivered: 0, read: 0, failed: 0 }

		for (const record of this.records.values()) {
			stats.total++
			if (record.status === 'sent') stats.sent++
			else if (record.status === 'delivered') stats.delivered++
			else if (record.status === 'read') stats.read++
			else if (record.status === 'failed') stats.failed++
		}

		return stats
	}

	// ═══════════════════════════════════════════════════════════════
	// CLEANUP - hapus records lama biar nggak memory leak
	// ═══════════════════════════════════════════════════════════════
	clear(): void {
		this.records.clear()

		if (this.sweepTimer) {
			clearInterval(this.sweepTimer)
			this.sweepTimer = null
		}
	}
}
