// segment.ts
// Filtering penerima broadcast berdasarkan segment
// Contoh: kirim cuma ke yang tag 'vip' + status 'active'
// SAFETY: customer dengan status 'blocked' (opt-out) SELALU di-exclude,
// apapun segment-nya — ini wajib sesuai WhatsApp Business Messaging Policy

import type { CRMCustomer, CRMBroadcastSegment } from '../types'

// ═══════════════════════════════════════════════════════════════════
// FILTER SEGMENT - saring customers sesuai kriteria
// ═══════════════════════════════════════════════════════════════════

export function filterSegment(
	customers: CRMCustomer[],
	segment: CRMBroadcastSegment
): CRMCustomer[] {
	return customers.filter((customer) => {
		// SAFETY PALING PENTING: jangan pernah kirim ke yang opt-out/blocked
		if (customer.status === 'blocked') {
			return false
		}

		// 1. Harus punya SEMUA tags yang diminta (AND logic)
		if (segment.tags && segment.tags.length > 0) {
			const hasAll = segment.tags.every((tag) => customer.tags.includes(tag))
			if (!hasAll) return false
		}

		// 2. Jangan punya tags yang di-exclude
		if (segment.excludeTags && segment.excludeTags.length > 0) {
			const hasExcluded = segment.excludeTags.some((tag) => customer.tags.includes(tag))
			if (hasExcluded) return false
		}

		// 3. Status harus cocok (kalau diminta)
		if (segment.status && customer.status !== segment.status) {
			return false
		}

		// 4. Masih aktif dalam X hari terakhir (kalau diminta)
		// Ini penting buat anti-ban: kirim ke list "hangat" lebih aman
		if (segment.lastSeenWithinDays) {
			const cutoff = Date.now() - segment.lastSeenWithinDays * 24 * 60 * 60 * 1000
			if (customer.lastSeen < cutoff) return false
		}

		// 5. Custom filter dari user (kalau ada)
		if (segment.customFilter && !segment.customFilter(customer)) {
			return false
		}

		return true
	})
}

// ═══════════════════════════════════════════════════════════════════
// VALIDATE SEGMENT - cek apakah segment "berbahaya" sebelum kirim
// Balikin warnings biar user sadar sebelum blast ke list dingin
// (research: issue #2131 — blast ke list dingin = risiko ban tinggi)
// ═══════════════════════════════════════════════════════════════════

export function validateSegment(
	customers: CRMCustomer[],
	segment: CRMBroadcastSegment
): { safe: boolean; warnings: string[]; recipientCount: number } {
	const warnings: string[] = []
	const recipients = filterSegment(customers, segment)

	// Warning 1: nggak ada filter sama sekali = blast ke SEMUA orang
	const hasAnyFilter =
		(segment.tags && segment.tags.length > 0) ||
		(segment.excludeTags && segment.excludeTags.length > 0) ||
		segment.status !== undefined ||
		segment.lastSeenWithinDays !== undefined ||
		segment.customFilter !== undefined

	if (!hasAnyFilter) {
		warnings.push(
			'TANPA FILTER: broadcast bakal ke SEMUA customers. ' +
			'List besar + dingin = risiko ban tinggi. Pertimbangkan segment aktif dulu.'
		)
	}

	// Warning 2: recipient terlalu banyak buat nomor biasa
	if (recipients.length > 256) {
		warnings.push(
			`Recipient ${recipients.length} orang (> 256). ` +
			'Ini bakal jalan sebagai loop individual (bukan broadcast list WA), ' +
			'pastikan delay + warmup aktif biar aman.'
		)
	}

	// Warning 3: nggak ada penerima sama sekali
	if (recipients.length === 0) {
		warnings.push('Recipient KOSONG: nggak ada customer yang cocok sama segment ini.')
	}

	return {
		safe: warnings.length === 0,
		warnings,
		recipientCount: recipients.length,
	}
}

// ═══════════════════════════════════════════════════════════════════
// UTILITY - hitung penerima tanpa bikin array baru (lebih hemat memori)
// ═══════════════════════════════════════════════════════════════════

export function countSegment(
	customers: CRMCustomer[],
	segment: CRMBroadcastSegment
): number {
	return filterSegment(customers, segment).length
}
