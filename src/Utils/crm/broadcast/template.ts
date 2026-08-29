// template.ts
// Personalisasi broadcast message + spintax variation
// Biar tiap orang dapet sapaan beda-beda (anti-ban: konten nggak identik)
// Research source: komunitas Baileys (issue #2131 - delay aja nggak cukup, butuh variasi konten)

import type { CRMCustomer } from '../types'

// ═══════════════════════════════════════════════════════════════════
// SPINTAX PARSER - ganti {opsi1|opsi2|opsi3} dengan salah satu acak
// Contoh: "Halo {kak|bro|gan}" → "Halo kak" atau "Halo bro" atau "Halo gan"
// ═══════════════════════════════════════════════════════════════════

export function parseSpintax(text: string): string {
	// Match pattern {option1|option2|option3}
	// Regex: \{([^{}]+)\} — cari { ... } tanpa nested braces
	return text.replace(/\{([^{}]+)\}/g, (match, options) => {
		const choices = options.split('|')
		if (choices.length === 0) return match
		
		// Pilih random dari options
		const randomIndex = Math.floor(Math.random() * choices.length)
		return choices[randomIndex].trim()
	})
}

// ═══════════════════════════════════════════════════════════════════
// PERSONALIZE - ganti placeholder {nama}, {jid}, dll dengan data customer
// ═══════════════════════════════════════════════════════════════════

export function personalizeTemplate(
	template: string,
	customer: CRMCustomer | null,
	extra?: Record<string, string>
): string {
	// Step 1: Parse spintax dulu (biar {hai|halo} jadi salah satu)
	let result = parseSpintax(template)

	// Step 2: Replace placeholder bawaan (case-insensitive)
	const nama = customer?.pushname ?? 'kak'
	result = result.replace(/\{nama\}/gi, nama)
	result = result.replace(/\{jid\}/gi, customer?.jid ?? '')
	result = result.replace(/\{pn\}/gi, customer?.pn ?? '')

	// Step 3: Replace placeholder custom dari user (misal {kupon}, {expired})
	if (extra) {
		for (const [key, value] of Object.entries(extra)) {
			// Escape key biar aman jadi regex (hindari special chars)
			const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
			result = result.replace(new RegExp(`\\{${safeKey}\\}`, 'gi'), value)
		}
	}

	return result
}

// ═══════════════════════════════════════════════════════════════════
// UTILITY - cek apakah template punya variasi (spintax atau placeholder)
// ═══════════════════════════════════════════════════════════════════

export function hasVariation(template: string): boolean {
	// Cek spintax: {opsi1|opsi2}
	const hasSpintax = /\{[^{}]+\|[^{}]+\}/.test(template)
	
	// Cek placeholder: {nama}, {kupon}, dll
	const hasPlaceholder = /\{[^{}]+\}/.test(template)
	
	return hasSpintax || hasPlaceholder
}

// Generate multiple variations dari template (buat test atau batch)
export function generateVariations(template: string, count: number): string[] {
	const variations: string[] = []
	for (let i = 0; i < count; i++) {
		variations.push(parseSpintax(template))
	}
	return variations
}
