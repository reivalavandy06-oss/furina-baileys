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

// Batas buffer update yang datang sebelum record-nya terdaftar. Messages.update
// bisa tiba sebelum await sendMessage() selesai, jadi statusnya sempat nggak ada
// record-nya. Tanpa buffer, update itu hilang permanen dan record-nya mentok di
// 'sent' lalu swept jadi 'failed' padahal sudah sampai.
const MAX_PENDING_UPDATES = 200

// Peringkat status string kita, untuk 검사 monotonic.
const STATUS_RANK: Record<string, number> = {
	pending: 0,
	sent: 1,
	delivered: 2,
	read: 3,
	failed: 4
}

// Peringkat status numeric Baileys. Angkanya sudah naik seiring progres
// (1 = PENDING, 2 = SERVER_ACK, 3 = DELIVERY_ACK, 4 = READ, 5 = PLAYED).
// Hanya ERROR (0) yang diberi peringkat tertinggi karena itu terminal: satu-
// satunya yang lebih penting dari "sudah sampai".
const numericRank = (status: number): number =>
	status === STATUS_ERROR ? Number.MAX_SAFE_INTEGER : status

export class CRMDeliveryTracker {
	private sock: any
	// Map messageId -> record tracking
	private records = new Map<string, CRMBroadcastMessage>()
	// Map messageId -> status numeric terakhir yang arrive sebelum track()
	private pendingUpdates = new Map<string, number>()
	// Timer buat nge-sweep yang unconfirmed
	private sweepTimer: ReturnType<typeof setInterval> | null = null
	// Handler disimpan sebagai field supaya .off() menerima reference yang sama
	// persis. Arrow inline tidak bisa dilepas — itu sumber leak-nya.
	private readonly handleUpdate = (updates: any[]): void => {
		if (!Array.isArray(updates)) return

		for (const entry of updates) {
			const messageId = entry?.key?.id
			const status = entry?.update?.status

			// Cuma proses update dengan status numeric valid
			if (!messageId || typeof status !== 'number') continue

			if (this.records.has(messageId)) {
				this.applyStatus(messageId, status)
			} else {
				this.bufferPending(messageId, status)
			}
		}
	}
	private attached = false
	private disposed = false

	constructor(sock?: any) {
		this.sock = sock

		// Auto-attach listener kalau socket dikasih
		if (this.sock?.ev) {
			this.attach()
		}
	}

	// ═══════════════════════════════════════════════════════════════
	// LIFECYCLE
	// ═══════════════════════════════════════════════════════════════

	// Lepas listener + sweep timer milik instance ini dan buang records.
	// Idempoten, dan hanya menyentuh handler yang kita daftarkan sendiri.
	dispose(): void {
		if (this.disposed) return
		this.disposed = true

		if (this.attached) {
			this.sock?.ev?.off('messages.update', this.handleUpdate)
			this.attached = false
		}

		if (this.sweepTimer) {
			clearInterval(this.sweepTimer)
			this.sweepTimer = null
		}

		this.records.clear()
		this.pendingUpdates.clear()
	}

	// ═══════════════════════════════════════════════════════════════
	// ATTACH - listen ke messages.update (sumber kebenaran delivery)
	// ═══════════════════════════════════════════════════════════════

	attach(): void {
		// Idempoten. Constructor sudah auto-attach, jadi pemanggil yang memanggil
		// attach() lagi akan menambah listener kedua + interval kedua — tiap
		// handler yang menumpuk memproses update yang sama berulang.
		if (this.disposed || this.attached) return

		this.sock.ev.on('messages.update', this.handleUpdate)
		this.attached = true

		// Sweep periodic buat tandai yang unconfirmed
		if (!this.sweepTimer) {
			this.sweepTimer = setInterval(() => this.sweepUnconfirmed(), 60_000)
		}
	}

	// Simpan update yang arrive sebelum track() mendaftarkan record-nya.
	// Satu entri per messageId: update berikutnya untuk id yang sama hanya
	// memperbarui statusnya, bukan menambah entri baru.
	private bufferPending(messageId: string, status: number): void {
		const existing = this.pendingUpdates.get(messageId)
		if (existing !== undefined) {
			// Simpan yang paling maju supaya urutan pesan yang tak sampai tidak
			// menimpa status yang sudah lebih tinggi.
			if (numericRank(existing) >= numericRank(status)) return
		}

		this.pendingUpdates.set(messageId, status)

		// Batas keras: buang entri terlama (FIFO) kalau lewat.
		while (this.pendingUpdates.size > MAX_PENDING_UPDATES) {
			const oldest = this.pendingUpdates.keys().next()
			if (oldest.done) break
			this.pendingUpdates.delete(oldest.value)
		}
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
		const existing = this.records.get(messageId)

		// Re-track untuk id yang sama harus menyatu, bukan menimpa. Kalau record
		// lama sudah punya deliveredAt atau readAt, menimpanya dengan null akan
		// menghapus bukti bahwa pesan benar-benar sampai.
		const record: CRMBroadcastMessage = existing
			? {
					...existing,
					customerJid,
					content,
					personalizedContent,
					// Status lama dipertahankan kalau tidak ada alasan untuk mundur.
					status:
						this.rankOf(existing.status) > this.rankOf('sent')
							? existing.status
							: 'sent'
				}
			: {
					id: messageId,
					customerJid,
					content,
					personalizedContent,
					status: 'sent',
					sentAt: Date.now(),
					deliveredAt: null,
					readAt: null,
				}

		this.records.set(messageId, record)

		// Terapkan update yang telanjah nyantol sebelum record ini terdaftar,
		// lalu buang dari buffer supaya tidak ter-apply dua kali.
		const pending = this.pendingUpdates.get(messageId)
		if (pending === undefined) return

		this.pendingUpdates.delete(messageId)
		this.applyStatus(messageId, pending)
	}

	// ═══════════════════════════════════════════════════════════════
	// APPLY STATUS - konversi numeric Baileys ke status string kita
	// ═══════════════════════════════════════════════════════════════
	private rankOf(status: string): number {
		return STATUS_RANK[status] ?? 0
	}

	// Status numeric Baileys -> status string kita. Status 1 (PENDING)
	// sengaja tidak dipetakan: perilaku lama membiarkannya apa adanya.
	private toStatus(status: number): CRMBroadcastMessage['status'] | null {
		if (status === STATUS_ERROR) return 'failed'
		if (status >= STATUS_READ) return 'read'
		if (status === STATUS_DELIVERY_ACK) return 'delivered'
		if (status === STATUS_SERVER_ACK) return 'sent'
		return null
	}

	private applyStatus(messageId: string, status: number): void {
		const record = this.records.get(messageId)
		if (!record) return

		const target = this.toStatus(status)
		if (target === null) return

		// Monotonic: jangan turunkan status yang sudah lebih maju. WhatsApp
		// bisa mengirim ack ulang (mis. SERVER_ACK menyusul DELIVERY_ACK), dan
		// tanpa guard ini record yang sudah 'read' bisa kembali jadi 'sent'.
		if (this.rankOf(target) < this.rankOf(record.status)) return

		if (target === 'failed') {
			record.error = 'delivery error (status 0)'
		} else if (target === 'read') {
			record.readAt = record.readAt ?? Date.now()
			record.deliveredAt = record.deliveredAt ?? Date.now()
		} else if (target === 'delivered') {
			record.deliveredAt = record.deliveredAt ?? Date.now()
		}

		record.status = target
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
	// Catatan: clear() TIDAK melepas listener. Ini reset state antar campaign,
	// bukan shutdown — tracking harus tetap jalan setelahnya. Untuk berhenti
	// total (termasuk listener + timer), pakai dispose().
	clear(): void {
		this.records.clear()

		if (this.sweepTimer) {
			clearInterval(this.sweepTimer)
			this.sweepTimer = null
		}
	}
}
