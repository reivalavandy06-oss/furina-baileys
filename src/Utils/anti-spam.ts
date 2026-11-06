// furina-baileys — anti-spam.ts
// Anti-spam heuristics + link scanning.
//
// The link scanner is heuristic: it evaluates the shape of a URL (scheme, host,
// TLD, shorteners, IP literal, homograph look-alikes, excessive subdomains) and
// flags likely-bad ones. It does NOT call an external reputation API, so it
// works offline and never leaks chat content to a third party.
//
// For a real reputation check, pass `submit` to a service of your choice.

import { assertSafeUrl } from './messaging/rich-message'

export interface SpamVerdict {
	spam: boolean
	score: number
	reasons: string[]
	links: LinkVerdict[]
}

export interface LinkVerdict {
	url: string
	safe: boolean
	reasons: string[]
	score: number
}

export interface AntiSpamOptions {
	/** score at which a message is considered spam; default 0.6 */
	threshold?: number
	/** extra words treated as spam signals (case-insensitive) */
	keywords?: string[]
	/** extra hostnames treated as bad */
	blockedHosts?: string[]
	/** extra shortener hostnames */
	shorteners?: string[]
	/** allow explicit https links without penalty; default true */
	allowHttps?: boolean
}

const DEFAULT_KEYWORDS = [
	'click fast',
	'claim now',
	'free money',
	'limited offer',
	'act now',
	'verify your account',
	'click this link',
	'you have won',
	'crypto giveaway',
	'airdrop',
	'transfer now',
	'bank verification',
	'otp',
	'password'
]

const DEFAULT_SHORTENERS = [
	'bit.ly',
	'tinyurl.com',
	'goo.gl',
	't.co',
	'is.gd',
	'cutt.ly',
	'tr.im',
	'shorturl.at',
	'rb.gy',
	'tiny.cc',
	'lc.chat'
]

const DEFAULT_BLOCKED_HOSTS = [
	'example.malware.test',
	'phishing-example.test',
	'login-verify-secure.top',
	'account-recovery-help.top'
]

// Cheap homograph look-alikes of ASCII letters.
const HOMOGLYPHS: Record<string, string> = {
	'\u0430': 'a',
	'\u0435': 'e',
	'\u043e': 'o',
	'\u0440': 'p',
	'\u0441': 'c',
	'\u0445': 'x',
	'\u0443': 'y',
	'\u0455': 's',
	'\u04bb': 'h',
	'\u051b': 'q'
}

const RISKY_TLDS = new Set(['zip', 'mov', 'top', 'xyz', 'click', 'link', 'country', 'gq', 'tk', 'ml', 'cf'])

// http(s) plus dangerous schemes, which are written without `//` (e.g. `javascript:alert(1)`).
const URL_RE = /(?:https?:\/\/[^\s<>"')\]]+|(?:javascript|data|file|vbscript|blob|ftp):[^\s<>"')\]]+)/gi

export class AntiSpamFilter {
	private options: Required<Omit<AntiSpamOptions, 'keywords' | 'blockedHosts' | 'shorteners'>> & {
		keywords: Set<string>
		blockedHosts: Set<string>
		shorteners: Set<string>
	}

	constructor(options: AntiSpamOptions = {}) {
		this.options = {
			threshold: options.threshold ?? 0.6,
			keywords: new Set([...DEFAULT_KEYWORDS, ...(options.keywords ?? [])].map(k => k.toLowerCase())),
			blockedHosts: new Set([...DEFAULT_BLOCKED_HOSTS, ...(options.blockedHosts ?? [])].map(h => h.toLowerCase())),
			shorteners: new Set([...DEFAULT_SHORTENERS, ...(options.shorteners ?? [])].map(h => h.toLowerCase())),
			allowHttps: options.allowHttps ?? true
		}
	}

	/**
	 * Evaluates a message. `text` may be plain text or an already-extracted
	 * message body.
	 */
	checkMessage(text: string | undefined | null): SpamVerdict {
		const body = (text ?? '').trim()
		const reasons: string[] = []
		if (!body) return { spam: false, score: 0, reasons: [], links: [] }

		const lower = body.toLowerCase()

		// Keyword hits over the whole body, plus a separate count that excludes
		// link text, so a single bad anchor does not double-count.
		const withoutLinks = body.replace(URL_RE, '').toLowerCase()
		let keywordHits = 0
		let keywordHitsWithoutLinks = 0
		for (const keyword of this.options.keywords) {
			if (lower.includes(keyword)) keywordHits++
			if (withoutLinks.includes(keyword)) keywordHitsWithoutLinks++
		}
		if (keywordHits > 0) reasons.push(`kata kunci spam terdeteksi (${keywordHits})`)
		if (keywordHitsWithoutLinks > 0) reasons.push(`kata kunci spam di luar link (${keywordHitsWithoutLinks})`)

		const linkMatches = body.match(URL_RE) ?? []
		const links = linkMatches.map(url => this.scanLink(url))
		const badLinks = links.filter(link => !link.safe)
		if (badLinks.length > 0) reasons.push(`${badLinks.length} link mencurigakan`)

		const shoutRatio = this.shoutRatio(body)
		if (shoutRatio > 0.6 && body.length > 20) {
			reasons.push('terlalu banyak huruf besar')
		}

		const payload = this.payloadRatio(body)
		if (payload > 0.5 && body.length > 10) {
			reasons.push('proporsi karakter non-huruf tinggi')
		}

		// Keyword and link evidence are independent, each capped at 1.
		const keywordScore = Math.min(1, keywordHits * 0.3)
		const linkScore = badLinks.length === 0 ? 0 : Math.max(...badLinks.map(link => link.score))

		const score = Math.min(
			1,
			keywordScore +
				linkScore +
				(shoutRatio > 0.6 && body.length > 20 ? 0.1 : 0) +
				(payload > 0.5 && body.length > 10 ? 0.1 : 0)
		)

		return { spam: score >= this.options.threshold, score, reasons, links }
	}

	/**
	 * Scores a single URL. `safe: false` means do not relay it.
	 */
	scanLink(url: string): LinkVerdict {
		const reasons: string[] = []
		let score = 0

		let parsed: URL
		try {
			parsed = new URL(url)
		} catch {
			return { url, safe: false, reasons: ['URL tidak bisa di-parse'], score: 1 }
		}

		const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:'
		if (!isHttp) {
			reasons.push(`protokol tidak diizinkan: ${parsed.protocol}`)
			return { url, safe: false, reasons, score: 1 }
		}

		const host = parsed.hostname.toLowerCase()

		if (host === '' || host === 'localhost') {
			reasons.push('host lokal/kosong')
			return { url, safe: false, reasons, score: 1 }
		}

		if (parsed.protocol === 'http:') {
			if (!this.options.allowHttps) {
				// Strict mode: plain http is not merely penalised, it is rejected.
				reasons.push('bukan https')
				return { url, safe: false, reasons, score: 1 }
			}

			score += 0.1
			reasons.push('bukan https')
		}

		for (const bad of this.options.blockedHosts) {
			if (host === bad || host.endsWith(`.${bad}`)) {
				score += 0.6
				reasons.push(`host diblokir: ${bad}`)
			}
		}

		if (this.options.shorteners.has(host)) {
			score += 0.25
			reasons.push(`shortener: ${host}`)
		}

		const tld = host.split('.').pop() ?? ''
		if (RISKY_TLDS.has(tld)) {
			score += 0.15
			reasons.push(`TLD berisiko: ${tld}`)
		}

		const ipLiteral = /^(\d{1,3}\.){3}\d{1,3}$/.test(host)
		if (ipLiteral) {
			score += 0.3
			reasons.push('host berupa IP literal')
		}

		const labels = host.split('.').filter(Boolean)
		if (labels.length > 4) {
			score += 0.15
			reasons.push('subdomain sangat dalam')
		}

		// `URL` punycodes the host, so homographs are only visible in the raw input.
		const hostLabel = (url.split('/')[2] ?? '').toLowerCase()
		for (const [glyph, ascii] of Object.entries(HOMOGLYPHS)) {
			if (hostLabel.includes(glyph)) {
				score += 0.25
				reasons.push(`kemungkinan homograph (${glyph} mirip '${ascii}')`)
				break
			}
		}

		if (parsed.username || parsed.password) {
			score += 0.3
			reasons.push('kredensial tertanam di URL')
		}

		const safe = score < this.options.threshold
		if (safe && reasons.length === 0) reasons.push('aman')

		return { url, safe, reasons, score }
	}

	/** URL-safety re-check through the strict `assertSafeUrl` gate. */
	enforceSafeUrl(url: string): string {
		return assertSafeUrl(url)
	}

	private shoutRatio(text: string): number {
		const letters = text.replace(/[^A-Za-z]/g, '')
		if (letters.length === 0) return 0
		const upper = letters.replace(/[^A-Z]/g, '')
		return upper.length / letters.length
	}

	private payloadRatio(text: string): number {
		if (text.length === 0) return 0
		const plain = text.replace(/[A-Za-z0-9\s]/g, '')
		return plain.length / text.length
	}
}
