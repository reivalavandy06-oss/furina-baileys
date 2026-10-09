// button-tracker.ts — parser tap + tracker
import { proto } from '../../../WAProto/index.js'
import type { WAMessage, MessageRelayOptions } from '../../Types'
import { generateMessageIDV2 } from '../generics'
import { sendButton } from './senders'
import { sendCarousel } from './carousel'
import type { FurinaCarouselOptions } from './carousel'
import type { FurinaSocket, FurinaButton, FurinaButtonOptions, FurinaButtonResponse } from './types'

function unwrap(msg?: proto.IMessage | null): proto.IMessage | null {
	let c = msg ?? null
	while (c) {
		const next =
			c.viewOnceMessage?.message ||
			c.viewOnceMessageV2?.message ||
			c.ephemeralMessage?.message ||
			c.documentWithCaptionMessage?.message ||
			c.viewOnceMessageV2Extension?.message
		if (!next) break
		c = next as proto.IMessage
	}
	return c
}

const safeParse = (s?: string | null): Record<string, any> => {
	try {
		return JSON.parse(s || '{}')
	} catch {
		return {}
	}
}

export function parseButtonResponse(m: WAMessage): FurinaButtonResponse | null {
	const content = unwrap(m.message as proto.IMessage)
	if (!content) return null

	// Native flow (quick_reply / single_select / flow)
	const ir = content.interactiveResponseMessage
	if (ir?.nativeFlowResponseMessage) {
		const nf = ir.nativeFlowResponseMessage
		const p = safeParse(nf.paramsJson)
		const id = (p.selected_id ?? p.selected_row_id ?? (nf as any).selectedId ?? '') as string
		const kind: FurinaButtonResponse['kind'] = nf.name === 'flow' ? 'flow' : p.selected_row_id ? 'list' : 'reply'
		return { isButton: true, kind, id, displayText: p.selected_display_text, raw: content }
	}

	// Order / payment
	const om = content.orderMessage
	if (om) {
		return {
			isButton: true,
			kind: 'order',
			id: om.orderId ?? '',
			order: {
				orderId: om.orderId ?? undefined,
				itemCount: om.itemCount ?? undefined,
				title: om.orderTitle ?? undefined,
			},
			raw: content,
		}
	}

	// Tap native-flow di klien WA 2026: datang sebagai templateButtonReplyMessage
	const tr = content.templateButtonReplyMessage
	if (tr) return { isButton: true, kind: 'reply', id: tr.selectedId ?? '', displayText: tr.selectedDisplayText ?? undefined, cardIndex: tr.selectedCarouselCardIndex ?? undefined, raw: content }

	// Legacy (dari user WA Mod yang ngirim ke user lo)
	const br = content.buttonsResponseMessage
	if (br) return { isButton: true, kind: 'legacy_reply', id: br.selectedButtonId ?? '', displayText: br.selectedDisplayText ?? undefined, raw: content }

	const lr = content.listResponseMessage
	if (lr) return { isButton: true, kind: 'legacy_list', id: lr.singleSelectReply?.selectedRowId ?? '', displayText: lr.title ?? undefined, raw: content }

	return null
}

// ── Tracker: biar tap button (termasuk tap carousel) langsung ketangkap ──
// Klien WA ngirim tap sebagai quoted-text; tracker nyocokin stanzaId quote
// sama message button yang kita kirim sendiri.

export interface FurinaButtonTrackerOptions {
	// Umur maksimum satu entry. Entry yang lewat TTL tidak akan dieksekusi
	// dan dibuang. Infinity = tanpa batas umur.
	ttlMs?: number
	// Batas jumlah entry. Saat penuh, entry terlama dibuang lebih dulu.
	// Infinity = tanpa batas jumlah.
	maxEntries?: number
}

// Default konservatif: satu jam masih cukup untuk tap yang terjadi agak
// jauh setelah pesan dikirim, dan 500 entry cukup untuk bot yang mengirim
// tombol rutin tanpa membiarkan registry tumbuh tanpa batas.
const DEFAULT_TTL_MS = 60 * 60 * 1000
const DEFAULT_MAX_ENTRIES = 500

// Nilai invalid kembali ke default, bukan ke 0 atau tanpa batas. Mematikan
// seluruh tracking karena salah ketik lebih berbahaya daripada memakai
// default: hasilnya tetap bounded dan tracking tetap bekerja.
function resolveTtlMs(value: number | undefined): number {
	if (value === Infinity) return Infinity
	if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return DEFAULT_TTL_MS
	return value
}

function resolveMaxEntries(value: number | undefined): number {
	if (value === Infinity) return Infinity
	if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return DEFAULT_MAX_ENTRIES
	return Math.floor(value)
}

interface TrackedButtons {
	labels: Map<string, string>
	expiresAt: number
}

export interface FurinaButtonTracker {
	sendButton(sock: FurinaSocket, jid: string, opts: FurinaButtonOptions, extra?: MessageRelayOptions): Promise<WAMessage>
	sendCarousel(sock: FurinaSocket, jid: string, opts: FurinaCarouselOptions, extra?: MessageRelayOptions): Promise<WAMessage>
	parseTap(m: WAMessage): FurinaButtonResponse | null
	// Jumlah entry yang masih tercatat.
	readonly size: number
	// Buang semua state internal. Idempoten, dan tracker tetap inert
	// sesudahnya: track() tidak akan menambah entry lagi.
	dispose(): void
}

export function createFurinaButtonTracker(options: FurinaButtonTrackerOptions = {}): FurinaButtonTracker {
	const ttlMs = resolveTtlMs(options.ttlMs)
	const maxEntries = resolveMaxEntries(options.maxEntries)

	// stanzaId (ID yang KITA generate sendiri) -> label -> id button
	const registry = new Map<string, TrackedButtons>()
	let disposed = false

	const isExpired = (entry: TrackedButtons): boolean => entry.expiresAt <= Date.now()

	// Buang entry yang lewat TTL. Dijalankan dari jalur baca dan tulis, bukan
	// dari timer: tidak ada interval yang perlu dihentikan, jadi tidak ada
	// yang menahan Node process tetap hidup.
	function purgeExpired(): void {
		for (const [key, entry] of registry) {
			if (isExpired(entry)) registry.delete(key)
		}
	}

	// Jaga dua batas sekaligus. Expired dibuang lebih dulu supaya entry yang
	// masih hidup tidak tergantikan oleh entry expired.
	function enforceBounds(): void {
		purgeExpired()
		if (maxEntries === Infinity) return
		// Map mempertahankan urutan insert, jadi key pertama = entry terlama.
		while (registry.size > maxEntries) {
			const oldest = registry.keys().next()
			if (oldest.done) break
			registry.delete(oldest.value)
		}
	}

	function track(msgId: string, pairs: Array<[string, string]>): void {
		// Setelah dispose tracker tidak boleh hidup lagi: track jadi no-op.
		if (disposed) return

		const m = new Map<string, string>()
		for (const [label, bid] of pairs) m.set(label, bid)
		registry.set(msgId, { labels: m, expiresAt: Date.now() + ttlMs })
		enforceBounds()
	}

	return {
		get size() {
			return registry.size
		},

		dispose() {
			if (disposed) return
			disposed = true
			registry.clear()
		},

		async sendButton(sock, jid, opts, extra) {
			const msgId = generateMessageIDV2()
			const sent = await sendButton(sock, jid, opts, { messageId: msgId, ...extra })
			track(
				msgId,
				opts.buttons
					.filter((b): b is Extract<FurinaButton, { type: 'reply' }> => b.type === 'reply')
					.map((b) => [b.text, b.id])
			)
			return sent
		},

		async sendCarousel(sock, jid, opts, extra) {
			const msgId = generateMessageIDV2()
			const sent = await sendCarousel(sock, jid, opts, { messageId: msgId, ...extra })
			const pairs: Array<[string, string]> = []
			for (const card of opts.cards) {
				for (const b of card.buttons ?? []) {
					if (b.type === 'reply') pairs.push([b.text, b.id])
				}
			}
			track(msgId, pairs)
			return sent
		},

		parseTap(m) {
			// Jalur 1: respons resmi. Tidak menyentuh registry, jadi tetap
			// bekerja setelah dispose.
			const official = parseButtonResponse(m)
			if (official) return official

			// Jalur 2: tap sebagai quoted-text
			const etm = m.message?.extendedTextMessage
			const ctx = etm?.contextInfo
			if (!ctx) return null
			const text = etm?.text ?? ''
			const stanzaId = ctx?.stanzaId

			// Buang yang expired sebelum membaca, supaya entry basi tidak pernah
			// dieksekusi dan tidak ikut disisir di fallback.
			purgeExpired()

			let id: string | undefined
			if (stanzaId) {
				id = registry.get(stanzaId)?.labels.get(text)
			}
			if (!id && ctx?.quotedMessage?.interactiveMessage) {
				for (const entry of registry.values()) {
					const matched = entry.labels.get(text)
					if (matched) {
						id = matched
						break
					}
				}
			}
			if (!id) return null
			return { isButton: true, kind: 'reply', id, displayText: text, raw: m.message as proto.IMessage }
		},
	}
}
