// furina-baileys — auto-reply.ts
// Rule-based auto-reply.
//
// Rules are matched in the order they were added, and only the first match
// fires per message (unless `stopOnMatch: false`). Patterns can be plain
// substrings, globs (`*`), or RegExp, with an optional case toggle.

import type { WAMessage } from '../Types'

export interface AutoReplyRule {
	/** caller-supplied id; generated when omitted */
	id?: string
	/** matcher: substring, glob with `*`, or RegExp */
	pattern: string | RegExp
	/**
	 * Response content. May be a plain value, or a function of the incoming
	 * message that returns the content.
	 */
	response: unknown
	/** case-sensitive matching; default false */
	caseSensitive?: boolean
	/** continue checking later rules after a match; default false */
	stopOnMatch?: boolean
	/** only apply to these jids (exact match) */
	chatIds?: string[]
	/** never reply in these jids */
	ignoredChatIds?: string[]
	/** ignore messages sent by the account itself; default true */
	ignoreFromMe?: boolean
	/** reply after this delay (ms); default 0 */
	delayMs?: number
	/** optional label for debugging */
	name?: string
	/** relay options forwarded to `sock.relayMessage` */
	options?: Record<string, unknown>
}

export interface AutoReplyDecision {
	matched: boolean
	rule?: AutoReplyRule
	response?: unknown
	reason?: 'no-rule' | 'from-me' | 'no-text' | 'ignored-chat'
}

/** Socket surface used to send the reply. */
export interface AutoReplySocket {
	relayMessage: (jid: string, message: unknown, options?: Record<string, unknown>) => Promise<WAMessage>
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const globToRegExp = (glob: string): RegExp => {
	const escaped = glob
		.split('*')
		.map(part => escapeRegExp(part))
		.join('[\\s\\S]*')
	return new RegExp(escaped)
}

export class AutoReplyEngine {
	private rules: AutoReplyRule[] = []

	/** Adds a rule and returns it (with id resolved). */
	addRule(
		pattern: AutoReplyRule['pattern'],
		response: AutoReplyRule['response'],
		options: Omit<AutoReplyRule, 'pattern' | 'response'> = {}
	): AutoReplyRule {
		const rule: AutoReplyRule = {
			...options,
			pattern,
			response,
			id: options.id ?? `rule_${this.rules.length + 1}_${Math.random().toString(36).slice(2, 6)}`
		}
		this.rules.push(rule)
		return rule
	}

	/** Removes a rule by id. */
	removeRule(id: string): boolean {
		const before = this.rules.length
		this.rules = this.rules.filter(rule => rule.id !== id)
		return this.rules.length !== before
	}

	/** Removes every rule. */
	clear(): void {
		this.rules = []
	}

	/** All registered rules (copy). */
	list(): AutoReplyRule[] {
		return [...this.rules]
	}

	/**
	 * Resolves which rule (if any) should answer this message.
	 * Pure — no sending, so it is easy to unit test.
	 */
	match(message: WAMessage): AutoReplyDecision {
		const jid = message?.key?.remoteJid ?? ''
		if (message?.key?.fromMe) {
			const ignoreFromMe = this.rules.every(rule => rule.ignoreFromMe !== false)
			if (ignoreFromMe) return { matched: false, reason: 'from-me' }
		}

		const text = textOf(message)
		if (!text) return { matched: false, reason: 'no-text' }

		for (const rule of this.rules) {
			if (rule.ignoredChatIds?.includes(jid)) continue
			if (rule.chatIds && !rule.chatIds.includes(jid)) continue

			if (matches(text, rule.pattern, rule.caseSensitive === true)) {
				const response = typeof rule.response === 'function' ? rule.response(message) : rule.response
				return { matched: true, rule, response }
			}

			if (rule.stopOnMatch === false) continue
		}

		return { matched: false, reason: 'no-rule' }
	}

	/**
	 * Checks the message and sends the reply when a rule matches.
	 * Returns the send result, or `null` when nothing matched.
	 */
	async processMessage(
		sock: AutoReplySocket,
		message: WAMessage,
		options: Record<string, unknown> = {}
	): Promise<WAMessage | null> {
		const decision = this.match(message)
		if (!decision.matched || !decision.rule) return null

		if (decision.rule.delayMs && decision.rule.delayMs > 0) {
			await new Promise<void>(resolve => setTimeout(resolve, decision.rule!.delayMs))
		}

		return sock.relayMessage(message.key.remoteJid!, decision.response, {
			...(decision.rule.options ?? {}),
			...options
		})
	}
}

const matches = (text: string, pattern: string | RegExp, caseSensitive: boolean): boolean => {
	if (pattern instanceof RegExp) return pattern.test(text)
	const haystack = caseSensitive ? text : text.toLowerCase()
	const needle = caseSensitive ? pattern : pattern.toLowerCase()
	if (needle.includes('*')) return globToRegExp(needle).test(haystack)
	return haystack.includes(needle)
}

const textOf = (message: WAMessage | undefined): string => {
	const m = message?.message
	if (!m) return ''
	return (m.conversation as string | undefined) ?? (m.extendedTextMessage?.text as string | undefined) ?? ''
}
