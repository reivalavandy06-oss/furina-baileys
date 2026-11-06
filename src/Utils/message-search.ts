// furina-baileys — message-search.ts
// In-memory message search & indexing.
//
// Deliberately synchronous and dependency-free: it is a plain in-process index
// over `WAMessage[]`, not a persistent store. Entries are exposed as views so
// callers can serialize their own snapshot.

import type { WAMessage, WAMessageKey } from '../Types'

export interface SearchHit {
	message: WAMessage
	/** 0..1 relevance score */
	score: number
	/** matched text excerpt, when the score came from text */
	excerpt?: string
}

export interface SearchOptions {
	/** only return matches from these chat ids */
	chatIds?: string[]
	/** only return matches from these participants */
	participants?: string[]
	/** inclusive lower bound (unix seconds) */
	from?: number
	/** inclusive upper bound (unix seconds) */
	to?: number
	/** cap the number of hits; defaults to 50 */
	limit?: number
	/** include matches from the account itself; default true */
	includeFromMe?: boolean
	/** case-sensitive matching; default false */
	caseSensitive?: boolean
}

interface IndexedEntry {
	message: WAMessage
	chatId: string
	participant?: string
	text: string
	timestamp: number
	fromMe: boolean
	/** terms in their original case */
	terms: Set<string>
	/** terms lowercased, for case-insensitive lookup */
	foldedTerms: Set<string>
}

const textOf = (message: WAMessage | undefined): string => {
	if (!message?.message) return ''

	const m = message.message
	const pick = (value: unknown): string | null =>
		value && typeof value === 'object'
			? (((value as { text?: unknown }).text as string | undefined) ?? null)
			: typeof value === 'string'
				? value
				: null

	return (
		pick(m.conversation) ??
		pick(m.extendedTextMessage) ??
		pick(m.imageMessage) ??
		pick(m.videoMessage) ??
		pick(m.documentMessage) ??
		''
	)
}

const timestampOf = (message: WAMessage | undefined): number => {
	const raw =
		message?.messageTimestamp ??
		(message?.message?.extendedTextMessage as { contextInfo?: unknown } | undefined)?.contextInfo
	if (typeof raw === 'number' && raw > 1e9) return raw
	if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw)
	return Number(raw) > 1e9 ? Number(raw) : 0
}

const tokenise = (text: string, lowercase = true): string[] =>
	(lowercase ? text.toLowerCase() : text).split(/[^a-z0-9_@.\-]+/i).filter(token => token.length > 0)

/** Sorts hits by score desc, then timestamp desc, then caps the list. */
const rankHits = (hits: SearchHit[], limit: number): SearchHit[] => {
	// limit is widened by search()/count() when callers need the whole set
	const sorted = hits
		.map(hit => ({ hit, timestamp: timestampOf(hit.message) }))
		.sort(
			(a, b) =>
				b.hit.score - a.hit.score ||
				b.timestamp - a.timestamp ||
				String(a.hit.message.key?.id ?? '').localeCompare(String(b.hit.message.key?.id ?? ''))
		)
	return sorted.slice(0, limit).map(entry => entry.hit)
}

export class MessageSearchIndex {
	private entries: IndexedEntry[] = []
	private byId = new Map<string, WAMessage>()

	/** Number of indexed messages. */
	get size(): number {
		return this.entries.length
	}

	/** Indexes a single message (later adds win on id collision). */
	add(message: WAMessage): void {
		const id = message?.key?.id
		if (!id) return

		if (this.byId.has(id)) {
			this.entries = this.entries.filter(entry => entry.message.key?.id !== id)
		}

		const text = textOf(message)
		this.byId.set(id, message)
		this.entries.push({
			message,
			chatId: message.key?.remoteJid ?? '',
			participant: message.key?.participant ?? undefined,
			text,
			timestamp: timestampOf(message),
			fromMe: !!message.key?.fromMe,
			terms: new Set(tokenise(text, false)),
			foldedTerms: new Set(tokenise(text))
		})
	}

	/** Indexes many messages at once. */
	addMessages(messages: WAMessage[]): void {
		for (const message of messages ?? []) this.add(message)
	}

	/** Removes a message by id. */
	remove(id: string): boolean {
		this.byId.delete(id)
		const before = this.entries.length
		this.entries = this.entries.filter(entry => entry.message.key?.id !== id)
		return this.entries.length !== before
	}

	/** Drops every entry. */
	clear(): void {
		this.entries = []
		this.byId.clear()
	}

	private baseFilter(options: SearchOptions): IndexedEntry[] {
		const includeFromMe = options.includeFromMe ?? true

		return this.entries.filter(entry => {
			if (!includeFromMe && entry.fromMe) return false
			if (options.chatIds && !options.chatIds.includes(entry.chatId)) return false
			if (options.participants && !options.participants.includes(entry.participant ?? '')) return false
			if (options.from !== undefined && entry.timestamp < options.from) return false
			if (options.to !== undefined && entry.timestamp > options.to) return false
			return true
		})
	}

	/**
	 * Full-text search. Scoring is a simple bag-of-words overlap: matched query
	 * terms over total query terms, boosted when the query appears verbatim.
	 */
	search(query: string, options: SearchOptions = {}): SearchHit[] {
		const caseSensitive = options.caseSensitive ?? false
		const terms = tokenise(caseSensitive ? query : query.toLowerCase())
		if (terms.length === 0) return []

		const haystack = caseSensitive ? (t: string) => t : (t: string) => t.toLowerCase()
		const hits: SearchHit[] = []

		for (const entry of this.baseFilter(options)) {
			const pool = caseSensitive ? entry.terms : entry.foldedTerms
			const matched = terms.filter(term => pool.has(term))
			if (matched.length === 0) continue

			const base = matched.length / terms.length
			const verbatim = haystack(entry.text).includes(haystack(query).trim())
			const score = Math.min(1, base + (verbatim ? 0.25 : 0))
			hits.push({
				message: entry.message,
				score,
				excerpt: entry.text.slice(0, 200)
			})
		}

		return rankHits(hits, options.limit ?? 50)
	}

	/** Regex search over message text. */
	searchRegex(pattern: RegExp | string, options: SearchOptions = {}): SearchHit[] {
		let regex: RegExp
		try {
			regex = pattern instanceof RegExp ? pattern : new RegExp(pattern)
		} catch {
			throw new Error('[furina-search] regex tidak valid')
		}

		const hits: SearchHit[] = []
		for (const entry of this.baseFilter(options)) {
			const match = regex.exec(entry.text)
			if (!match) continue

			const index = match.index ?? 0
			hits.push({
				message: entry.message,
				score: 1,
				excerpt: entry.text.slice(Math.max(0, index - 40), index + 160)
			})
		}

		return rankHits(hits, options.limit ?? 50)
	}

	/** Counts matches for a query (same matching rules as `search`). */
	count(query: string, options: SearchOptions = {}): number {
		return this.search(query, { ...options, limit: Number.MAX_SAFE_INTEGER }).length
	}

	/** Rebuilds the index from a message list, replacing existing entries. */
	reindex(messages: WAMessage[]): void {
		this.clear()
		this.addMessages(messages)
	}

	/** Serialises the index (message payloads and keys) to JSON. */
	toJSON(): WAMessageKey[] {
		return this.entries.map(entry => entry.message.key).filter((key): key is WAMessageKey => !!key)
	}
}
