import { proto } from '../../../WAProto/index.js'
import type { WAMessage, MessageRelayOptions } from '../../Types'
import { jidNormalizedUser } from '../../WABinary/jid-utils'
import { generateMessageIDV2 } from '../generics'
import { prepareWAMessageMedia } from '../messages'
import type { FurinaSocket } from './types'

export interface RichMessageSendOptions extends MessageRelayOptions {
	/** quote an existing message by injecting its contextInfo into the rich response */
	quoted?: WAMessage
}

// ── unified response (V2) ────────────────────────────────────────────────
export interface UnifiedSection {
	/** Optional: view models / primitives are identified by `__typename` only. */
	type?: string
	[key: string]: unknown
}

export interface UnifiedPayload {
	version: 2
	type?: string
	html?: string
	sections?: UnifiedSection[]
	viewModels?: UnifiedSection[]
	primitives?: UnifiedSection[]
	citations?: UnifiedSection[]
	inlineLinks?: UnifiedSection[]
	aiIcon?: string
	extras?: Record<string, unknown>
	[key: string]: unknown
}

const SECTION_TYPENAME = 'GenAIUnifiedResponseSection'
const VIEW_MODEL_TYPENAME = 'GenAISingleLayoutViewModel'

/** Maps the 3P widget kind to its WhatsApp `__typename`. */
export const ORICH_WIDGET_TYPENAMES = {
	cta: 'GenAI3PExtWidgetCTA',
	toast: 'GenAI3PExtWidgetToast',
	standard_header: 'GenAI3PExtWidgetStandardHeader',
	artifact_confirmation: 'GenAI3PExtWidgetArtifactConfirmation',
	connector_pending_tool_call: 'GenAI3PExtWidgetConnectorPendingToolCall',
	calendar_attendee: 'GenAI3PExtWidgetCalendarAttendee',
	calendar_date_section: 'GenAI3PExtWidgetCalendarDateSection',
	calendar_event_list: 'GenAI3PExtWidgetCalendarEventList',
	account_linking_bottomsheet: 'GenAI3PExtWidgetAccountLinkingBottomsheet'
} as const

export type ORichWidgetKind = keyof typeof ORICH_WIDGET_TYPENAMES

/** UX primitive `__typename`s recognised by the unified-response renderer. */
export const UX_PRIMITIVE_TYPENAMES = {
	markdown: 'GenAIMarkdownTextUXPrimitive',
	code: 'GenAICodeUXPrimitive',
	latex: 'GenAILatexUXPrimitive',
	table: 'GenATableUXPrimitive',
	divider: 'GenAIDividerPrimitive',
	spacer: 'GenAISpacerPrimitive',
	metadataText: 'GenAIMetadataTextPrimitive'
} as const

// ── code tokenizer ───────────────────────────────────────────────────────
export type CodeHighlightType = 'KEYWORD' | 'METHOD' | 'STRING' | 'NUMBER' | 'COMMENT' | 'DEFAULT'

export interface CodeToken {
	value: string
	type: CodeHighlightType
}

export const CODE_HIGHLIGHT_TO_PROTO: Record<
	CodeHighlightType,
	proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType
> = {
	KEYWORD: proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType.AI_RICH_RESPONSE_CODE_HIGHLIGHT_KEYWORD,
	METHOD: proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType.AI_RICH_RESPONSE_CODE_HIGHLIGHT_METHOD,
	STRING: proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType.AI_RICH_RESPONSE_CODE_HIGHLIGHT_STRING,
	NUMBER: proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType.AI_RICH_RESPONSE_CODE_HIGHLIGHT_NUMBER,
	COMMENT: proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType.AI_RICH_RESPONSE_CODE_HIGHLIGHT_COMMENT,
	DEFAULT: proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType.AI_RICH_RESPONSE_CODE_HIGHLIGHT_DEFAULT
}

const KEYWORDS: Record<string, string[]> = {
	javascript: [
		'const',
		'let',
		'var',
		'function',
		'return',
		'if',
		'else',
		'for',
		'while',
		'do',
		'switch',
		'case',
		'break',
		'continue',
		'new',
		'class',
		'extends',
		'super',
		'this',
		'import',
		'from',
		'export',
		'default',
		'async',
		'await',
		'try',
		'catch',
		'finally',
		'throw',
		'typeof',
		'instanceof',
		'in',
		'of',
		'yield',
		'delete',
		'void',
		'null',
		'undefined',
		'true',
		'false',
		'static',
		'get',
		'set'
	],
	typescript: [
		'const',
		'let',
		'var',
		'function',
		'return',
		'if',
		'else',
		'for',
		'while',
		'switch',
		'case',
		'break',
		'continue',
		'new',
		'class',
		'extends',
		'implements',
		'interface',
		'type',
		'enum',
		'namespace',
		'public',
		'private',
		'protected',
		'readonly',
		'super',
		'this',
		'import',
		'from',
		'export',
		'default',
		'async',
		'await',
		'try',
		'catch',
		'finally',
		'throw',
		'typeof',
		'keyof',
		'as',
		'declare',
		'abstract',
		'null',
		'undefined',
		'true',
		'false',
		'void',
		'never',
		'unknown',
		'any'
	],
	python: [
		'def',
		'class',
		'return',
		'if',
		'elif',
		'else',
		'for',
		'while',
		'break',
		'continue',
		'import',
		'from',
		'as',
		'with',
		'try',
		'except',
		'finally',
		'raise',
		'yield',
		'lambda',
		'pass',
		'global',
		'nonlocal',
		'assert',
		'del',
		'in',
		'is',
		'not',
		'and',
		'or',
		'None',
		'True',
		'False',
		'async',
		'await'
	],
	go: [
		'package',
		'import',
		'func',
		'return',
		'if',
		'else',
		'for',
		'range',
		'switch',
		'case',
		'break',
		'continue',
		'var',
		'const',
		'type',
		'struct',
		'interface',
		'map',
		'chan',
		'go',
		'defer',
		'select',
		'nil',
		'true',
		'false'
	],
	rust: [
		'fn',
		'let',
		'mut',
		'const',
		'struct',
		'enum',
		'impl',
		'trait',
		'use',
		'mod',
		'pub',
		'return',
		'if',
		'else',
		'for',
		'while',
		'loop',
		'match',
		'break',
		'continue',
		'move',
		'async',
		'await',
		'dyn',
		'where',
		'self',
		'Self',
		'true',
		'false',
		'None',
		'Some',
		'Ok',
		'Err'
	],
	java: [
		'class',
		'interface',
		'enum',
		'extends',
		'implements',
		'public',
		'private',
		'protected',
		'static',
		'final',
		'void',
		'return',
		'if',
		'else',
		'for',
		'while',
		'do',
		'switch',
		'case',
		'break',
		'continue',
		'new',
		'import',
		'package',
		'try',
		'catch',
		'finally',
		'throw',
		'throws',
		'null',
		'true',
		'false',
		'this',
		'super'
	]
}

const HASH_COMMENT_LANGUAGES = new Set(['python', 'ruby', 'shell', 'bash', 'sh', 'yaml', 'yml', 'perl', 'r'])
const SLASH_COMMENT_LANGUAGES = new Set(['javascript', 'typescript', 'java', 'go', 'rust', 'c', 'cpp', 'csharp', 'css'])

const keywordSetFor = (language: string): Set<string> => {
	const key = language.toLowerCase()
	const base = KEYWORDS[key] ?? KEYWORDS.javascript ?? []
	if (key === 'javascript' || key === 'js')
		return new Set([...(KEYWORDS.javascript ?? []), ...(KEYWORDS.typescript ?? [])])
	if (key === 'ts' || key === 'typescript')
		return new Set([...(KEYWORDS.typescript ?? []), ...(KEYWORDS.javascript ?? [])])
	if (key === 'py') return new Set(KEYWORDS.python ?? [])
	return new Set(base)
}

/**
 * Splits source code into highlight tokens. Comments, strings, numbers,
 * keywords and call-like identifiers (METHOD) are classified; everything
 * else is DEFAULT. Whitespace is preserved inside DEFAULT tokens so the
 * original source can be reconstructed by joining token values.
 */
export function tokenizeCode(code: string, language = 'text'): CodeToken[] {
	const lang = language.toLowerCase()
	const keywords = keywordSetFor(lang)
	const allowHash = HASH_COMMENT_LANGUAGES.has(lang)
	const allowSlash = SLASH_COMMENT_LANGUAGES.has(lang) || !allowHash

	const commentPattern = [
		...(allowSlash ? ['\\/\\/[^\\n]*', '\\/\\*[\\s\\S]*?\\*\\/'] : []),
		...(allowHash ? ['#[^\\n]*'] : [])
	].join('|')

	const pattern = new RegExp(
		`(${commentPattern})|("(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*'|\`(?:\\\\.|[^\`\\\\])*\`)|(\\b\\d+(?:\\.\\d+)?\\b)|([A-Za-z_$][\\w$]*)|([\\s\\S])`,
		'g'
	)

	const tokens: CodeToken[] = []
	let match: RegExpExecArray | null

	while ((match = pattern.exec(code)) !== null) {
		const [raw, comment, str, num, ident] = match
		if (comment !== undefined) {
			tokens.push({ value: raw, type: 'COMMENT' })
		} else if (str !== undefined) {
			tokens.push({ value: raw, type: 'STRING' })
		} else if (num !== undefined) {
			tokens.push({ value: raw, type: 'NUMBER' })
		} else if (ident !== undefined) {
			if (keywords.has(ident)) {
				tokens.push({ value: raw, type: 'KEYWORD' })
			} else {
				const rest = code.slice(pattern.lastIndex)
				const isCall = /^\s*\(/.test(rest)
				tokens.push({ value: raw, type: isCall ? 'METHOD' : 'DEFAULT' })
			}
		} else {
			tokens.push({ value: raw, type: 'DEFAULT' })
		}

		if (raw.length === 0) pattern.lastIndex++
	}

	return tokens
}

// ── blocks ───────────────────────────────────────────────────────────────
type RichContentBlock =
	| { type: 'text'; text: string }
	| { type: 'code'; code: string; language: string }
	| { type: 'table'; headers: string[]; rows: string[][] }
	| { type: 'list'; text: string }
	| { type: 'link'; url: string; title: string }
	| { type: 'image'; url: string; caption: string }
	| { type: 'latex'; formula: string }
	| { type: 'map'; latitude: number; longitude: number; delta: number }
	| { type: 'gridImage'; urls: string[] }
	| { type: 'reels'; items: { url: string; caption?: string }[] }
	| { type: 'video'; url: string; caption?: string }

export type ParsedRichBlock =
	| { type: 'text'; text: string }
	| { type: 'code'; code: string; language?: string }
	| { type: 'table'; headers: string[]; rows: string[][] }
	| { type: 'list'; items: string[] }
	| { type: 'link'; url: string; title?: string }
	| { type: 'image'; url?: string; caption?: string }
	| { type: 'latex'; formula: string }
	| { type: 'map'; latitude?: number; longitude?: number; latitudeDelta?: number; longitudeDelta?: number }
	| { type: 'gridImage'; urls: string[] }
	| { type: 'reels'; items: { url?: string; caption?: string }[] }
	| { type: 'video'; url?: string }
	| { type: 'unknown'; raw: proto.IAIRichResponseSubMessage }

export interface ParsedRichMessage {
	messageType: proto.AIRichResponseMessageType
	blocks: ParsedRichBlock[]
	/** flattened text of every text-like block, joined with a blank line */
	text: string
	/** suggested prompts carried in messageContextInfo.botMetadata */
	suggestions: string[]
	unifiedResponse?: Uint8Array
	/** decoded V2 payload when unifiedResponse holds JSON */
	unified?: UnifiedPayload
	/** assistant avatar url, when present */
	aiIcon?: string
	/** album envelope, when the message is an album */
	album?: {
		expectedImageCount?: number
		expectedVideoCount?: number
		albumMediaGroupId?: string
	}
	/** interactive buttons (native flow / template) */
	buttons: RichButton[]
	citations: string[]
	inlineLinks: { label: string; url: string }[]
	contextInfo?: proto.IContextInfo
}

const BULLET_RE = /^[•\-*]\s+/
const LINK_RE = /^\[([^\]]+)\]\(([^)]+)\)$/

const splitTableRow = (line: string): string[] =>
	line
		.replace(/^\|/, '')
		.replace(/\|$/, '')
		.split('|')
		.map(cell => cell.trim())

const isSeparatorRow = (cells: string[]): boolean => cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell))

const parseTextBlock = (text: string): ParsedRichBlock => {
	const trimmed = text.trim()
	const link = LINK_RE.exec(trimmed)
	if (link) {
		return { type: 'link', title: link[1] ?? '', url: link[2] ?? '' }
	}

	const lines = text.split('\n').filter(line => line.trim().length > 0)
	if (lines.length > 0 && lines.every(line => BULLET_RE.test(line.trim()))) {
		return { type: 'list', items: lines.map(line => line.trim().replace(BULLET_RE, '')) }
	}

	return { type: 'text', text }
}

const getRichResponse = (message: proto.IMessage): proto.IAIRichResponseMessage | undefined =>
	message.botForwardedMessage?.message?.richResponseMessage ?? message.richResponseMessage ?? undefined

const unwrapMessage = (message: proto.IMessage): proto.IMessage => {
	let current = message
	for (let depth = 0; depth < 5; depth++) {
		const next =
			current.botForwardedMessage?.message ??
			current.ephemeralMessage?.message ??
			current.viewOnceMessage?.message ??
			current.viewOnceMessageV2?.message ??
			current.documentWithCaptionMessage?.message ??
			undefined
		if (!next) break
		current = next
	}

	return current
}

const applyQuotedContext = (content: proto.IMessage, quoted?: WAMessage) => {
	if (!quoted) return

	const rich = getRichResponse(content)
	if (!rich) return

	const participant = quoted.key.fromMe
		? quoted.key.remoteJid
		: (quoted.participant ?? quoted.key.participant ?? quoted.key.remoteJid)

	rich.contextInfo = {
		...rich.contextInfo,
		stanzaId: quoted.key.id ?? undefined,
		participant: participant ? jidNormalizedUser(participant) : undefined,
		quotedMessage: quoted.message ?? undefined
	}
}

const encodeUnified = (payload: UnifiedPayload): Uint8Array => new TextEncoder().encode(JSON.stringify(payload))

const decodeUnified = (data?: Uint8Array | null): UnifiedPayload | undefined => {
	if (!data || data.length === 0) return undefined

	try {
		const parsed: unknown = JSON.parse(new TextDecoder().decode(data))
		if (parsed && typeof parsed === 'object' && (parsed as UnifiedPayload).version === 2) {
			return parsed as UnifiedPayload
		}
	} catch {
		// not our JSON envelope; treat as opaque bytes
	}

	return undefined
}

const imageUrl = (url: string): proto.IAIRichResponseImageURL => ({
	imagePreviewUrl: url,
	imageHighResUrl: url,
	sourceUrl: url
})

/** Protocols a rich-message URL may use. Anything else is rejected outright. */
const SAFE_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Validates a URL before it is embedded in a rich message.
 *
 * Mitigation for CVE-2026-23866: rich responses (Reels/Image/Link) render
 * attacker-controlled URLs on the client, so `javascript:`, `data:`, `file:`
 * and other non-HTTP schemes must never reach the proto. Relative URLs (no
 * protocol) are rejected too — they resolve against the renderer origin.
 *
 * Throws a plain `Error` with a `[furina-rich]` prefix; callers in builder
 * methods rely on the throw to abort the message being composed.
 */
export function assertSafeUrl(url: string): string {
	if (typeof url !== 'string' || url.trim().length === 0) {
		throw new Error('[furina-rich] URL kosong/tidak valid')
	}

	const raw = url.trim()

	// Reject whitespace/control chars: browsers strip them, so `java\nscript:`
	// can otherwise slip past a naive scheme check.
	if (/[\u0000-\u0020\u007f]/.test(raw)) {
		throw new Error('[furina-rich] URL mengandung karakter kontrol/whitespace')
	}

	let parsed: URL
	try {
		parsed = new URL(raw)
	} catch {
		throw new Error(`[furina-rich] URL tidak valid atau tanpa protokol: ${raw}`)
	}

	if (!SAFE_PROTOCOLS.has(parsed.protocol.toLowerCase())) {
		throw new Error(`[furina-rich] protokol tidak diizinkan: ${parsed.protocol}`)
	}

	// Return the original (trimmed) URL rather than the normalised form so
	// callers keep byte-for-byte control of what they send.
	return raw
}

export const isSafeUrl = (url: string): boolean => {
	try {
		assertSafeUrl(url)
		return true
	} catch {
		return false
	}
}

export class RichMessageBuilder {
	protected blocks: RichContentBlock[] = []
	protected suggestions: string[] = []
	protected unifiedResponse?: Uint8Array
	protected botForwarded = false
	protected aiIcon?: string

	addText(text: string): this {
		this.blocks.push({ type: 'text', text })
		return this
	}

	addCodeBlock(code: string, language: string): this {
		this.blocks.push({ type: 'code', code, language })
		return this
	}

	addTable(headers: string[], rows: string[][]): this {
		this.blocks.push({ type: 'table', headers, rows })
		return this
	}

	addList(items: string[]): this {
		const text = items.map(item => `• ${item}`).join('\n')
		this.blocks.push({ type: 'list', text })
		return this
	}

	addLatex(formula: string): this {
		this.blocks.push({ type: 'latex', formula })
		return this
	}

	/**
	 * LaTeX rendered through a remote image service (CodeCogs). Kept separate
	 * from addLatex so callers that only need the expression don't hit the
	 * network renderer.
	 */
	addLatexInlineImage(formula: string): this {
		this.blocks.push({ type: 'latex', formula })
		this.blocks.push({ type: 'image', url: buildLatexImageUrl(formula), caption: formula })
		return this
	}

	addImage(url: string, caption: string): this {
		this.blocks.push({ type: 'image', url: assertSafeUrl(url), caption })
		return this
	}

	addInlineImage(url: string, caption = ''): this {
		this.blocks.push({ type: 'image', url: assertSafeUrl(url), caption })
		return this
	}

	addGridImage(urls: string[]): this {
		this.blocks.push({ type: 'gridImage', urls: urls.map(assertSafeUrl) })
		return this
	}

	addReels(items: { url: string; caption?: string }[]): this {
		this.blocks.push({
			type: 'reels',
			items: items.map(item => ({ ...item, url: assertSafeUrl(item.url) }))
		})
		return this
	}

	addVideo(url: string, caption?: string): this {
		this.blocks.push({ type: 'video', url: assertSafeUrl(url), caption })
		return this
	}

	addMap(lat: number, lng: number, zoom: number): this {
		const clampedZoom = Math.min(20, Math.max(0, zoom))
		const delta = 360 / Math.pow(2, clampedZoom)
		this.blocks.push({ type: 'map', latitude: lat, longitude: lng, delta })
		return this
	}

	addLink(url: string, title: string): this {
		this.blocks.push({ type: 'link', url: assertSafeUrl(url), title })
		return this
	}

	addSuggestions(items: string[]): this {
		this.suggestions.push(...items)
		return this
	}

	setUnifiedResponse(data: Uint8Array | string | UnifiedPayload): this {
		this.unifiedResponse =
			typeof data === 'string'
				? new TextEncoder().encode(data)
				: data instanceof Uint8Array
					? data
					: encodeUnified(data)
		return this
	}

	// ── V2 unified sections & view models ────────────────────────────────
	/** Appends a section to the unified payload, merging with any existing one. */
	addSection(section: Record<string, unknown>): this {
		this.mergeUnified(unified => {
			const sections = (Array.isArray(unified.sections) ? unified.sections : []).slice()
			sections.push({ __typename: SECTION_TYPENAME, ...section })
			return { ...unified, sections }
		})
		return this
	}

	/**
	 * Adds a layout view model (single/grid/hscroll/action-row). Escape hatch:
	 * the shape is forwarded to WhatsApp verbatim apart from the default
	 * `__typename`.
	 */
	addViewModel(viewModel: Record<string, unknown>): this {
		this.mergeUnified(unified => {
			const viewModels = (Array.isArray(unified.viewModels) ? unified.viewModels : []).slice()
			viewModels.push({ __typename: VIEW_MODEL_TYPENAME, ...viewModel })
			return { ...unified, viewModels }
		})
		return this
	}

	/** Adds a raw UX primitive without any type normalisation. */
	addRawPrimitive(primitive: Record<string, unknown>): this {
		this.mergeUnified(unified => {
			const primitives = (Array.isArray(unified.primitives) ? unified.primitives : []).slice()
			primitives.push(primitive)
			return { ...unified, primitives }
		})
		return this
	}

	addDivider(): this {
		return this.addRawPrimitive({ __typename: 'GenAIDividerPrimitive' })
	}

	addSpacer(height: number): this {
		return this.addRawPrimitive({ __typename: 'GenAISpacerPrimitive', height })
	}

	addMetadataText(text: string): this {
		return this.addRawPrimitive({ __typename: 'GenAIMetadataTextPrimitive', text })
	}

	/** Suggestion chips rendered as an action-row layout. */
	addActionRow(items: (string | { text: string; [key: string]: unknown })[]): this {
		const actions = items.map(item =>
			typeof item === 'string'
				? { __typename: 'GenAIActionPrimitive', text: item, label: item }
				: { __typename: 'GenAIActionPrimitive', ...item }
		)
		return this.addViewModel({ __typename: 'GenAIActionRowLayoutViewModel', actions })
	}

	// ── layout stacks (Elaina / zaileys style) ───────────────────────────
	addHStack(viewModels: Record<string, unknown>[]): this {
		return this.addViewModel({
			__typename: 'GenAIHStackLayoutViewModel',
			children: this.sanitizeViewModels(viewModels)
		})
	}

	addVStack(viewModels: Record<string, unknown>[]): this {
		return this.addViewModel({
			__typename: 'GenAIVStackLayoutViewModel',
			children: this.sanitizeViewModels(viewModels)
		})
	}

	/** Validates every `url`-bearing field inside a view model tree. */
	private sanitizeViewModels(viewModels: Record<string, unknown>[]): Record<string, unknown>[] {
		return viewModels.map(vm => {
			const next: Record<string, unknown> = { ...vm }
			for (const key of ['url', 'imageUrl', 'icon', 'iconUrl'] as const) {
				const value = next[key]
				if (typeof value === 'string' && value.length > 0) {
					next[key] = assertSafeUrl(value)
				}
			}

			if (Array.isArray(next.children)) {
				next.children = this.sanitizeViewModels(next.children as Record<string, unknown>[])
			}

			return next
		})
	}

	// ── section shortcuts ────────────────────────────────────────────────
	addTaskSection(task: { taskId: string; title: string; subtitle?: string; status?: string }): this {
		return this.addRawPrimitive({ __typename: 'GenAITaskPrimitive', ...task })
	}

	addThinkingSection(
		title: string,
		options: {
			icon?: string
			isInProgress?: boolean
			metaSearchApps?: string[]
			thoughtDurationSec?: number
		} = {}
	): this {
		const { icon, ...rest } = options
		return this.addRawPrimitive({
			__typename: 'GenAIBotThinkingStatusPrimitive',
			title,
			...(icon ? { icon: assertSafeUrl(icon) } : {}),
			...rest
		})
	}

	addProgressSection(title: string, options: { inProgress?: boolean } = {}): this {
		return this.addRawPrimitive({
			__typename: 'GenAIBotProgressStatusPrimitive',
			title,
			...options
		})
	}

	addImageSection(url: string, options: { fallbackUrl?: string } = {}): this {
		const fallbackUrl = options.fallbackUrl ? assertSafeUrl(options.fallbackUrl) : undefined
		return this.addRawPrimitive({
			__typename: 'GenAIImagePrimitive',
			url: assertSafeUrl(url),
			...(fallbackUrl ? { fallbackUrl } : {})
		})
	}

	addLatexSection(formula: string): this {
		return this.addRawPrimitive({ __typename: 'GenAILatexUXPrimitive', formula })
	}

	addDividerSection(): this {
		return this.addRawPrimitive({ __typename: 'GenAIDividerPrimitive' })
	}

	addSpacerSection(spacing: number): this {
		return this.addRawPrimitive({ __typename: 'GenAISpacerPrimitive', height: spacing, spacing })
	}

	// ── citation / inline link ───────────────────────────────────────────
	addCitation(url: string): this {
		const safeUrl = assertSafeUrl(url)
		this.mergeUnified(unified => {
			const citations = (Array.isArray(unified.citations) ? unified.citations : []).slice()
			citations.push({ __typename: 'GenAISearchCitationItem', url: safeUrl })
			return { ...unified, citations }
		})
		return this
	}

	addInlineLink(label: string, url: string): this {
		const safeUrl = assertSafeUrl(url)
		this.mergeUnified(unified => {
			const inlineLinks = (Array.isArray(unified.inlineLinks) ? unified.inlineLinks : []).slice()
			inlineLinks.push({ __typename: 'GenAIInlineLinkItem', label, url: safeUrl })
			return { ...unified, inlineLinks }
		})
		return this
	}

	// ── AI icon ──────────────────────────────────────────────────────────
	/**
	 * Sets the assistant avatar shown next to the response. WhatsApp has no
	 * dedicated `aiIcon` proto field, so it is carried in the unified payload
	 * (and mirrored into `botMetadata` for forks that read it there).
	 */
	setAiIcon(iconUrl?: string): this {
		const safeUrl = iconUrl ? assertSafeUrl(iconUrl) : undefined
		this.aiIcon = safeUrl
		this.mergeUnified(unified => {
			if (!safeUrl) {
				const { aiIcon: _dropped, ...rest } = unified
				return { ...rest, version: 2 }
			}

			return { ...unified, aiIcon: safeUrl }
		})
		return this
	}

	protected mergeUnified(updater: (unified: UnifiedPayload) => UnifiedPayload): void {
		const existing = this.unifiedResponse ? decodeUnified(this.unifiedResponse) : undefined
		this.unifiedResponse = encodeUnified(updater(existing ?? { version: 2 }))
	}

	wrapInBotForwarded(enabled = true): this {
		this.botForwarded = enabled
		return this
	}

	addMarkdown(markdown: string): this {
		const lines = markdown.split(/\r?\n/)
		let i = 0

		while (i < lines.length) {
			const line = lines[i] ?? ''
			const trimmed = line.trim()

			const fence = /^(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/.exec(trimmed)
			if (fence) {
				const token = (fence[1] ?? '```').slice(0, 3)
				const language = fence[2] || 'text'
				const body: string[] = []
				i++
				while (i < lines.length) {
					const current = (lines[i] ?? '').trim()
					if (current.startsWith(token)) {
						i++
						break
					}

					body.push(lines[i] ?? '')
					i++
				}

				this.addCodeBlock(body.join('\n'), language)
				continue
			}

			if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
				const tableLines: string[] = []
				while (i < lines.length) {
					const current = (lines[i] ?? '').trim()
					if (!(current.startsWith('|') && current.endsWith('|'))) break
					tableLines.push(current)
					i++
				}

				const cells = tableLines.map(splitTableRow)
				let headers: string[] = []
				let rows: string[][] = []
				if (cells.length >= 2 && isSeparatorRow(cells[1] ?? [])) {
					headers = cells[0] ?? []
					rows = cells.slice(2)
				} else {
					rows = cells
				}

				this.addTable(headers, rows)
				continue
			}

			const listMatch = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line)
			if (listMatch) {
				const items: string[] = []
				while (i < lines.length) {
					const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i] ?? '')
					if (!item) break
					items.push(item[3] ?? '')
					i++
				}

				this.addList(items)
				continue
			}

			const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
			if (heading) {
				this.addText(heading[2] ?? '')
				i++
				continue
			}

			if (trimmed === '') {
				i++
				continue
			}

			const paragraph: string[] = []
			while (i < lines.length) {
				const current = (lines[i] ?? '').trim()
				if (current === '') break
				if (/^(`{3,}|~{3,})/.test(current)) break
				if (current.startsWith('|') && current.endsWith('|')) break
				if (/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i] ?? '')) break
				if (/^#{1,6}\s+/.test(current)) break
				paragraph.push(current)
				i++
			}

			if (paragraph.length > 0) {
				this.addText(paragraph.join('\n'))
			}
		}

		return this
	}

	build(): proto.IMessage {
		const submessages: proto.IAIRichResponseSubMessage[] = []

		for (const block of this.blocks) {
			switch (block.type) {
				case 'text':
				case 'list':
					submessages.push({
						messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT,
						messageText: block.text
					})
					break
				case 'link':
					submessages.push({
						messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT,
						messageText: `[${block.title}](${block.url})`
					})
					break
				case 'code':
					submessages.push({
						messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_CODE,
						codeMetadata: {
							codeLanguage: block.language,
							codeBlocks: [{ codeContent: block.code }]
						}
					})
					break
				case 'table': {
					const rows: proto.AIRichResponseTableMetadata.IAIRichResponseTableRow[] = []
					if (block.headers.length > 0) {
						rows.push({ items: block.headers, isHeading: true })
					}

					for (const row of block.rows) {
						rows.push({ items: row, isHeading: false })
					}

					submessages.push({
						messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TABLE,
						tableMetadata: { rows }
					})
					break
				}
				case 'image':
					submessages.push({
						messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_INLINE_IMAGE,
						imageMetadata: {
							imageUrl: imageUrl(block.url),
							imageText: block.caption,
							alignment:
								proto.AIRichResponseInlineImageMetadata.AIRichResponseImageAlignment
									.AI_RICH_RESPONSE_IMAGE_LAYOUT_CENTER_ALIGNED
						}
					})
					break
				case 'gridImage':
					submessages.push({
						messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_GRID_IMAGE,
						gridImageMetadata: {
							gridImageUrl: block.urls[0] ? imageUrl(block.urls[0]) : undefined,
							imageUrls: block.urls.map(imageUrl)
						}
					})
					break
				case 'reels':
					submessages.push({
						messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_CONTENT_ITEMS,
						contentItemsMetadata: {
							contentType: proto.AIRichResponseContentItemsMetadata.ContentType.DEFAULT,
							itemsMetadata: block.items.map(item => ({
								reelItem: {
									videoUrl: item.url,
									title: item.caption ?? '',
									thumbnailUrl: item.url
								}
							}))
						}
					})
					break
				case 'video':
					submessages.push({
						messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_DYNAMIC,
						dynamicMetadata: {
							type: proto.AIRichResponseDynamicMetadata.AIRichResponseDynamicMetadataType
								.AI_RICH_RESPONSE_DYNAMIC_METADATA_TYPE_GIF,
							url: block.url,
							version: 1
						}
					})
					if (block.caption) {
						submessages.push({
							messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT,
							messageText: block.caption
						})
					}
					break
				case 'latex':
					submessages.push({
						messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_LATEX,
						latexMetadata: {
							text: block.formula,
							expressions: [{ latexExpression: block.formula }]
						}
					})
					break
				case 'map':
					submessages.push({
						messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_MAP,
						mapMetadata: {
							centerLatitude: block.latitude,
							centerLongitude: block.longitude,
							latitudeDelta: block.delta,
							longitudeDelta: block.delta,
							showInfoList: true
						}
					})
					break
			}
		}

		const richResponse: proto.IAIRichResponseMessage = {
			messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
			submessages
		}

		if (this.unifiedResponse) {
			richResponse.unifiedResponse = { data: this.unifiedResponse }
		}

		const content: proto.IMessage = this.botForwarded
			? { botForwardedMessage: { message: { richResponseMessage: richResponse } } }
			: { richResponseMessage: richResponse }

		if (this.suggestions.length > 0) {
			content.messageContextInfo = {
				...(content.messageContextInfo ?? {}),
				botMetadata: {
					...(content.messageContextInfo?.botMetadata ?? {}),
					suggestedPromptMetadata: { suggestedPrompts: this.suggestions }
				}
			}
		}

		if (this.aiIcon) {
			content.messageContextInfo = {
				...(content.messageContextInfo ?? {}),
				botMetadata: {
					...(content.messageContextInfo?.botMetadata ?? {}),
					// Mirrored for forks that read a scalar avatar URL from botMetadata.
					aiIcon: this.aiIcon
				} as proto.IBotMetadata
			}
		}

		return content
	}
}

// ── ORich: rich builder + sources / products / widgets / footer actions ──
export interface ORichSource {
	title: string
	url: string
	thumbnailUrl?: string
	faviconUrl?: string
	query?: string
	citationNumber?: number
	/** source provider label; falls back to OTHER */
	provider?: keyof typeof proto.BotSourcesMetadata.BotSourceItem.SourceProvider
}

export interface ORichProduct {
	id?: string
	title: string
	price?: number | string
	currency?: string
	url?: string
	thumbnailUrl?: string
}

export interface ORichPost {
	title: string
	url: string
	author?: string
	thumbnailUrl?: string
}

export interface ORichWidget {
	title: string
	url?: string
	type?: string
	/** 3P widget sub-type; selects the `__typename` written to the payload. */
	kind?: ORichWidgetKind
	data?: Record<string, unknown>
}

export interface ORichFooterAction {
	label: string
	url: string
}

export interface ORichTipOptions {
	title?: string
}

export interface RichButton {
	type: 'reply' | 'url' | 'call'
	id: string
	text: string
	url?: string
	phone?: string
}

/** Converts a RichButton into a `nativeFlowMessage` button entry. */
export const toNativeFlowButton = (button: RichButton): { name: string; buttonParamsJson: string } => {
	switch (button.type) {
		case 'url':
			return {
				name: 'cta_url',
				buttonParamsJson: JSON.stringify({
					display_text: button.text,
					url: button.url,
					merchant_url: button.url,
					id: button.id
				})
			}
		case 'call':
			return {
				name: 'cta_call',
				buttonParamsJson: JSON.stringify({
					display_text: button.text,
					phone_number: button.phone,
					id: button.id
				})
			}
		case 'reply':
		default:
			return {
				name: 'quick_reply',
				buttonParamsJson: JSON.stringify({ display_text: button.text, id: button.id })
			}
	}
}

export const buildButtonsContent = (buttons: RichButton[]): proto.IMessage => ({
	interactiveMessage: {
		body: { text: '' },
		nativeFlowMessage: {
			messageVersion: 1,
			buttons: buttons.map(toNativeFlowButton)
		}
	}
})

export class ORich extends RichMessageBuilder {
	private sources: ORichSource[] = []
	private metadata: Partial<proto.IBotMetadata> = {}
	private extras: Record<string, unknown> = {}
	private buttons: RichButton[] = []

	setAiIcon(iconUrl?: string): this {
		super.setAiIcon(iconUrl)
		return this
	}

	addHStack(viewModels: Record<string, unknown>[]): this {
		super.addHStack(viewModels)
		return this
	}

	addVStack(viewModels: Record<string, unknown>[]): this {
		super.addVStack(viewModels)
		return this
	}

	addFOABloksSection(bloksData: Record<string, unknown> | string): this {
		const data = typeof bloksData === 'string' ? bloksData : JSON.stringify(bloksData)
		return this.addRawPrimitive({ __typename: 'FOABloksPrimitive', data })
	}

	/**
	 * Adds a native-flow button. `richResponseMessage` cannot host an
	 * `interactiveMessage`, so buttons are emitted as a quoted follow-up
	 * message by `sendORichMessage()`.
	 */
	addButton(button: RichButton): this {
		if (button.type === 'url' && !button.url) {
			throw new Error('[furina-rich] button url wajib untuk type "url"')
		}

		if (button.type === 'call' && !button.phone) {
			throw new Error('[furina-rich] button phone wajib untuk type "call"')
		}

		this.buttons.push({
			...button,
			...(button.url ? { url: assertSafeUrl(button.url) } : {})
		})
		return this
	}

	getButtons(): RichButton[] {
		return [...this.buttons]
	}

	addSource(...sources: ORichSource[]): this
	addSource(url: string, title: string): this
	addSource(...args: (string | ORichSource)[]): this {
		// Accept both `addSource({ url, title })` and `addSource(url, title)`.
		const sources: ORichSource[] =
			typeof args[0] === 'string'
				? [{ url: args[0], title: typeof args[1] === 'string' ? args[1] : '' }]
				: (args as ORichSource[])

		this.sources.push(
			...sources.map(source => ({
				...source,
				url: assertSafeUrl(source.url),
				thumbnailUrl: source.thumbnailUrl ? assertSafeUrl(source.thumbnailUrl) : undefined,
				faviconUrl: source.faviconUrl ? assertSafeUrl(source.faviconUrl) : undefined
			}))
		)
		return this
	}

	addVideo(url: string, caption?: string): this {
		super.addVideo(url, caption)
		this.extras.videos = [...((this.extras.videos as unknown[]) ?? []), { url, caption }]
		return this
	}

	addProduct(product: ORichProduct): this {
		const parts = [product.title]
		if (product.price !== undefined) {
			parts.push(`${product.price}${product.currency ? ` ${product.currency}` : ''}`)
		}

		if (product.thumbnailUrl) {
			super.addInlineImage(product.thumbnailUrl, product.title)
		}

		if (product.url) {
			super.addLink(product.url, parts.join(' — '))
		} else {
			super.addText(parts.join(' — '))
		}

		this.extras.products = [...((this.extras.products as unknown[]) ?? []), product]
		return this
	}

	addPost(post: ORichPost): this {
		if (post.thumbnailUrl) {
			super.addInlineImage(post.thumbnailUrl, post.title)
		}

		super.addLink(post.url, post.author ? `${post.title} — ${post.author}` : post.title)
		this.extras.posts = [...((this.extras.posts as unknown[]) ?? []), post]
		return this
	}

	addMetadata(meta: Partial<proto.IBotMetadata>): this {
		this.metadata = { ...this.metadata, ...meta }
		return this
	}

	addTip(text: string, options: ORichTipOptions = {}): this {
		super.addText(options.title ? `${options.title}\n${text}` : `Tip: ${text}`)
		this.extras.tips = [...((this.extras.tips as unknown[]) ?? []), { text, ...options }]
		return this
	}

	addSection(section: Record<string, unknown>): this {
		super.addSection(section)
		return this
	}

	addWidget(widget: ORichWidget): this {
		if (widget.url) {
			super.addLink(widget.url, widget.title)
		} else {
			super.addText(widget.title)
		}

		const typename = widget.kind ? ORICH_WIDGET_TYPENAMES[widget.kind] : undefined
		this.extras.widgets = [
			...((this.extras.widgets as unknown[]) ?? []),
			typename ? { __typename: typename, ...widget } : widget
		]
		return this
	}

	addFooterAction(action: ORichFooterAction): this {
		super.addLink(action.url, action.label)
		this.extras.footerActions = [...((this.extras.footerActions as unknown[]) ?? []), action]
		return this
	}

	addSuggest(...items: (string | string[])[]): this {
		const flat = items.flat()
		this.addSuggestions(flat)
		this.extras.suggests = [...((this.extras.suggests as unknown[]) ?? []), ...flat]
		return this
	}

	build(): proto.IMessage {
		const content = super.build()

		const hasExtras = Object.keys(this.extras).length > 0
		if (hasExtras) {
			const rich = getRichResponse(content)
			if (rich) {
				const existing = decodeUnified(rich.unifiedResponse?.data)
				const merged: UnifiedPayload = {
					...(existing ?? { version: 2 }),
					version: 2,
					extras: { ...(existing?.extras ?? {}), ...this.extras }
				}
				rich.unifiedResponse = { data: encodeUnified(merged) }
			}
		}

		if (this.sources.length > 0 || Object.keys(this.metadata).length > 0) {
			const existing = content.messageContextInfo ?? {}
			const sourcesMetadata: proto.IBotSourcesMetadata | undefined =
				this.sources.length > 0
					? {
							sources: this.sources.map(source => ({
								provider:
									proto.BotSourcesMetadata.BotSourceItem.SourceProvider[source.provider ?? 'OTHER'] ??
									proto.BotSourcesMetadata.BotSourceItem.SourceProvider.OTHER,
								sourceProviderUrl: source.url,
								sourceQuery: source.query,
								thumbnailCdnUrl: source.thumbnailUrl,
								faviconCdnUrl: source.faviconUrl,
								citationNumber: source.citationNumber,
								sourceTitle: source.title
							}))
						}
					: undefined

			content.messageContextInfo = {
				...existing,
				botMetadata: {
					...(existing.botMetadata ?? {}),
					...this.metadata,
					...(sourcesMetadata ? { richResponseSourcesMetadata: sourcesMetadata } : {})
				}
			}
		}

		return content
	}
}

// ── senders ──────────────────────────────────────────────────────────────
export const buildLatexImageUrl = (formula: string, dpi = 150): string =>
	`https://latex.codecogs.com/png.image?%5Cdpi%7B${dpi}%7D%20${encodeURIComponent(formula)}`

const normalizeJidOrThrow = (jid: string): string => {
	const normalized = jidNormalizedUser(jid)
	if (!normalized) {
		throw new Error(`Invalid JID: ${jid}`)
	}

	return normalized
}

export async function sendRichMessage(
	sock: FurinaSocket,
	jid: string,
	builder: RichMessageBuilder,
	options: RichMessageSendOptions = {}
): Promise<WAMessage> {
	const normalizedJid = normalizeJidOrThrow(jid)
	const content = builder.build()
	applyQuotedContext(content, options.quoted)
	return sock.relayMessage(normalizedJid, content, options)
}

/**
 * Sends an `ORich` builder. Buttons cannot live inside `richResponseMessage`,
 * so the rich body is relayed first and the buttons follow as a quoted
 * `nativeFlowMessage` referencing it.
 */
export async function sendORichMessage(
	sock: FurinaSocket,
	jid: string,
	builder: ORich,
	options: RichMessageSendOptions = {}
): Promise<WAMessage> {
	const normalizedJid = normalizeJidOrThrow(jid)
	const richMessage = await sendRichMessage(sock, jid, builder, options)

	const buttons = builder.getButtons()
	if (buttons.length === 0) return richMessage

	return sock.relayMessage(normalizedJid, buildButtonsContent(buttons), {
		...options,
		additionalAttributes: options.additionalAttributes
	})
}

export function sendTable(
	sock: FurinaSocket,
	jid: string,
	title: string,
	headers: string[],
	rows: string[][],
	quoted?: WAMessage,
	opts?: RichMessageSendOptions
): Promise<WAMessage> {
	const builder = new RichMessageBuilder()
	if (title) builder.addText(title)
	builder.addTable(headers, rows)
	return sendRichMessage(sock, jid, builder, { ...(opts ?? {}), quoted })
}

export function sendList(
	sock: FurinaSocket,
	jid: string,
	title: string,
	items: string[],
	quoted?: WAMessage,
	opts?: RichMessageSendOptions
): Promise<WAMessage> {
	const builder = new RichMessageBuilder()
	if (title) builder.addText(title)
	builder.addList(items)
	return sendRichMessage(sock, jid, builder, { ...(opts ?? {}), quoted })
}

export function sendCodeBlock(
	sock: FurinaSocket,
	jid: string,
	code: string,
	language: string,
	quoted?: WAMessage,
	opts?: RichMessageSendOptions
): Promise<WAMessage> {
	const builder = new RichMessageBuilder().addCodeBlock(code, language)
	return sendRichMessage(sock, jid, builder, { ...(opts ?? {}), quoted })
}

export function sendLatexImage(
	sock: FurinaSocket,
	jid: string,
	formula: string,
	quoted?: WAMessage,
	opts?: RichMessageSendOptions
): Promise<WAMessage> {
	const builder = new RichMessageBuilder().addLatex(formula).addImage(buildLatexImageUrl(formula), formula)
	return sendRichMessage(sock, jid, builder, { ...(opts ?? {}), quoted })
}

export function sendLatex(
	sock: FurinaSocket,
	jid: string,
	formula: string,
	quoted?: WAMessage,
	opts?: RichMessageSendOptions
): Promise<WAMessage> {
	const builder = new RichMessageBuilder().addLatex(formula)
	return sendRichMessage(sock, jid, builder, { ...(opts ?? {}), quoted })
}

export function sendLatexInlineImage(
	sock: FurinaSocket,
	jid: string,
	formula: string,
	quoted?: WAMessage,
	opts?: RichMessageSendOptions
): Promise<WAMessage> {
	const builder = new RichMessageBuilder().addLatexInlineImage(formula)
	return sendRichMessage(sock, jid, builder, { ...(opts ?? {}), quoted })
}

export function sendMarkdown(
	sock: FurinaSocket,
	jid: string,
	markdown: string,
	quoted?: WAMessage,
	opts?: RichMessageSendOptions
): Promise<WAMessage> {
	const builder = new RichMessageBuilder().addMarkdown(markdown)
	return sendRichMessage(sock, jid, builder, { ...(opts ?? {}), quoted })
}

// ── V2 (unified sections) senders ────────────────────────────────────────
export function generateUnifiedContent(payload: UnifiedPayload): proto.IMessage {
	return {
		richResponseMessage: {
			messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
			submessages: [],
			unifiedResponse: { data: encodeUnified(payload) }
		}
	}
}

/**
 * Serialises the unified response payload embedded in a message (or a builder
 * that produces one) back to its JSON string. Handy for logging/round-tripping
 * V2 content. Returns an empty string when there is no unified payload.
 */
export function captureUnifiedResponse(source: proto.IMessage | RichMessageBuilder): string {
	const content = source instanceof RichMessageBuilder ? source.build() : source
	const data = getRichResponse(content)?.unifiedResponse?.data
	if (!data || data.length === 0) return ''

	return new TextDecoder().decode(data)
}

// ── UX primitive encoding ────────────────────────────────────────────────
export interface TableUXItem {
	__typename: typeof UX_PRIMITIVE_TYPENAMES.table
	title?: string
	headers: string[]
	rows: string[][]
	[key: string]: unknown
}

export interface CodeUXItem {
	__typename: typeof UX_PRIMITIVE_TYPENAMES.code
	language: string
	code: string
	blocks?: CodeToken[]
	[key: string]: unknown
}

export interface MarkdownUXItem {
	__typename: typeof UX_PRIMITIVE_TYPENAMES.markdown
	text: string
	[key: string]: unknown
}

export interface LatexUXItem {
	__typename: typeof UX_PRIMITIVE_TYPENAMES.latex
	formula: string
	[key: string]: unknown
}

export type UXPrimitiveItem = TableUXItem | CodeUXItem | MarkdownUXItem | LatexUXItem

const encodeBase64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64')

const decodeBase64 = (text: string): string => {
	try {
		const decoded = Buffer.from(text, 'base64').toString('utf8')
		// `from(..., 'base64')` is lenient; re-encode and compare to reject junk.
		return Buffer.from(decoded, 'utf8').toString('base64') === text.replace(/\s+/g, '') ? decoded : text
	} catch {
		return text
	}
}

/**
 * Wraps a UX primitive in a `{ base64: ... }` envelope. WhatsApp's unified
 * renderer expects the primitive body base64-encoded.
 */
export const toBase64Primitive = <T extends Record<string, unknown>>(item: T): T & { base64: string } => ({
	...item,
	base64: encodeBase64(JSON.stringify(item))
})

const unwrapPrimitive = (primitive: Record<string, unknown>): Record<string, unknown> => {
	const encoded = primitive.base64
	if (typeof encoded !== 'string' || encoded.length === 0) return primitive

	try {
		const parsed: unknown = JSON.parse(decodeBase64(encoded))
		if (parsed && typeof parsed === 'object') {
			return parsed as Record<string, unknown>
		}
	} catch {
		// not base64 JSON; fall through to the raw object
	}

	return primitive
}

const textFromTableItem = (item: Record<string, unknown>): string => {
	const headers = Array.isArray(item.headers) ? (item.headers as string[]) : []
	const rows = Array.isArray(item.rows) ? (item.rows as string[][]) : []
	const lines: string[] = []
	if (headers.length > 0) lines.push(headers.join(' | '))

	for (const row of rows) {
		lines.push((Array.isArray(row) ? row : []).join(' | '))
	}

	return lines.join('\n')
}

/**
 * Extracts plain text from a unified-response payload. Handles markdown, code,
 * latex and table UX primitives (including base64-wrapped bodies) and falls
 * back to section text so callers always get something readable.
 */
export function getPlainTextFromUnifiedResponse(payload: UnifiedPayload | string | Uint8Array): string {
	let unified: UnifiedPayload | undefined

	if (typeof payload === 'string') {
		try {
			unified = JSON.parse(payload) as UnifiedPayload
		} catch {
			return payload
		}
	} else if (payload instanceof Uint8Array) {
		unified = decodeUnified(payload) ?? (JSON.parse(new TextDecoder().decode(payload)) as UnifiedPayload)
	} else {
		unified = payload
	}

	if (!unified || typeof unified !== 'object') return ''

	const chunks: string[] = []
	const push = (value: unknown) => {
		if (typeof value === 'string' && value.length > 0) chunks.push(value)
	}

	const collectPrimitive = (raw: Record<string, unknown>) => {
		const primitive = unwrapPrimitive(raw)
		const typename = typeof primitive.__typename === 'string' ? primitive.__typename : ''

		switch (typename) {
			case UX_PRIMITIVE_TYPENAMES.markdown:
				push(primitive.text)
				break
			case UX_PRIMITIVE_TYPENAMES.code:
				push(primitive.code)
				break
			case UX_PRIMITIVE_TYPENAMES.latex:
				push(primitive.formula ?? primitive.text)
				break
			case UX_PRIMITIVE_TYPENAMES.table:
				push(textFromTableItem(primitive))
				break
			case UX_PRIMITIVE_TYPENAMES.metadataText:
				push(primitive.text)
				break
			default:
				push(primitive.text)
				break
		}
	}

	if (Array.isArray(unified.primitives)) {
		for (const primitive of unified.primitives) {
			if (primitive && typeof primitive === 'object') collectPrimitive(primitive)
		}
	}

	for (const section of unified.sections ?? []) {
		if (!section || typeof section !== 'object') continue
		if ('text' in section) push(section.text)
	}

	if (typeof unified.html === 'string') push(unified.html)

	return chunks.join('\n').trim()
}

export async function sendUnifiedResponse(
	sock: FurinaSocket,
	jid: string,
	data: UnifiedPayload | string | Uint8Array,
	options: RichMessageSendOptions = {}
): Promise<WAMessage> {
	const normalizedJid = normalizeJidOrThrow(jid)

	let bytes: Uint8Array
	if (typeof data === 'string') {
		bytes = new TextEncoder().encode(data)
	} else if (data instanceof Uint8Array) {
		bytes = data
	} else {
		bytes = encodeUnified({ ...data, version: 2 })
	}

	const content: proto.IMessage = {
		richResponseMessage: {
			messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
			submessages: [],
			unifiedResponse: { data: bytes }
		}
	}

	applyQuotedContext(content, options.quoted)
	return sock.relayMessage(normalizedJid, content, options)
}

export function sendTableV2(
	sock: FurinaSocket,
	jid: string,
	title: string,
	headers: string[],
	rows: string[][],
	options: RichMessageSendOptions = {}
): Promise<WAMessage> {
	const builder = new RichMessageBuilder()
	if (title) builder.addText(title)
	builder.addTable(headers, rows)

	const tableItems: TableUXItem = { __typename: UX_PRIMITIVE_TYPENAMES.table, title, headers, rows }
	builder.setUnifiedResponse({
		version: 2,
		sections: [{ __typename: SECTION_TYPENAME, type: 'table', title, headers, rows }],
		primitives: [toBase64Primitive(tableItems)]
	})
	return sendRichMessage(sock, jid, builder, options)
}

export function sendCodeBlockV2(
	sock: FurinaSocket,
	jid: string,
	code: string,
	language: string,
	options: RichMessageSendOptions = {}
): Promise<WAMessage> {
	const builder = new RichMessageBuilder()
	builder.addCodeBlock(code, language)

	const codeItems: CodeUXItem = {
		__typename: UX_PRIMITIVE_TYPENAMES.code,
		language,
		code,
		blocks: tokenizeCode(code, language)
	}
	builder.setUnifiedResponse({
		version: 2,
		sections: [{ __typename: SECTION_TYPENAME, type: 'code', language, code }],
		primitives: [toBase64Primitive(codeItems)]
	})
	return sendRichMessage(sock, jid, builder, options)
}

export function sendLinkV2(
	sock: FurinaSocket,
	jid: string,
	url: string,
	title: string,
	options: RichMessageSendOptions = {}
): Promise<WAMessage> {
	const builder = new RichMessageBuilder()
	builder.addLink(url, title)
	builder.setUnifiedResponse({
		version: 2,
		sections: [{ type: 'link', url, title }]
	})
	return sendRichMessage(sock, jid, builder, options)
}

// ── rich HTML mini-app ───────────────────────────────────────────────────
export function generateRichHtmlContent(html: string): proto.IMessage {
	return generateUnifiedContent({ version: 2, type: 'html', html })
}

export function sendRichHtml(
	sock: FurinaSocket,
	jid: string,
	html: string,
	options: RichMessageSendOptions = {}
): Promise<WAMessage> {
	const normalizedJid = normalizeJidOrThrow(jid)
	const content = generateRichHtmlContent(html)
	applyQuotedContext(content, options.quoted)
	return sock.relayMessage(normalizedJid, content, options)
}

// ── status mentions ──────────────────────────────────────────────────────
export async function sendStatusMentions(
	sock: FurinaSocket,
	content: proto.IMessage | RichMessageBuilder | string,
	jids: string[],
	options: RichMessageSendOptions = {}
): Promise<WAMessage> {
	const normalized = jids.map(jid => jidNormalizedUser(jid)).filter((jid): jid is string => jid.length > 0)

	let message: proto.IMessage
	if (typeof content === 'string') {
		message = { conversation: content }
	} else if (content instanceof RichMessageBuilder) {
		message = content.build()
		applyQuotedContext(message, options.quoted)
	} else {
		message = content
	}

	return sock.relayMessage('status@broadcast', message, {
		...options,
		statusJidList: normalized
	})
}

// ── album messages ───────────────────────────────────────────────────────
export interface AlbumMessageContent {
	albumMessage: proto.Message.IAlbumMessage
	albumMediaGroupId: string
}

const isVideoMedia = (media: string | Buffer): boolean => {
	if (Buffer.isBuffer(media)) {
		// ISO-BMFF / QuickTime / Matroska magic bytes.
		if (media.length < 12) return false
		const ftyp = media.subarray(4, 8).toString('ascii')
		if (ftyp === 'ftyp' || ftyp === 'moov' || ftyp === 'mdat') return true
		if (media[0] === 0x1a && media[1] === 0x45 && media[2] === 0xdf && media[3] === 0xa3) return true
		return false
	}

	const clean = media.split('?')[0]?.toLowerCase() ?? ''
	return /\.(mp4|mov|webm|mkv|avi|3gp)$/.test(clean)
}

/**
 * Builds the album envelope. WhatsApp's proto has no `albumMediaGroupId`
 * field, so the id is returned alongside it and attached to every media
 * stanza (as the `mediagroup` attribute + `MEDIA_ALBUM` association) so the
 * client groups them into a single album.
 */
export function buildAlbumMessage(
	medias: (string | Buffer)[],
	caption?: string,
	groupMessageId?: string
): AlbumMessageContent {
	if (medias.length === 0) {
		throw new Error('[furina-rich] album butuh minimal 1 media')
	}

	const expectedVideoCount = medias.filter(isVideoMedia).length

	return {
		albumMessage: {
			expectedImageCount: medias.length - expectedVideoCount,
			expectedVideoCount,
			...(caption ? { contextInfo: { forwardingScore: 0 } } : {})
		},
		albumMediaGroupId: groupMessageId ?? generateMessageIDV2()
	}
}

const toMediaContent = async (
	sock: FurinaSocket,
	media: string | Buffer,
	caption?: string
): Promise<proto.IMessage> => {
	const isVideo = isVideoMedia(media)
	const source = Buffer.isBuffer(media) ? media : { url: media }
	const prepared = await prepareWAMessageMedia(isVideo ? { video: source, caption } : { image: source, caption }, {
		upload: sock.waUploadToServer
	})

	return isVideo ? { videoMessage: prepared.videoMessage } : { imageMessage: prepared.imageMessage }
}

/**
 * Relays each media with the same album group id + `MEDIA_ALBUM` association.
 * Returns the relayed messages (one per media), in input order.
 */
export async function sendAlbum(
	sock: FurinaSocket,
	jid: string,
	medias: (string | Buffer)[],
	caption?: string,
	options: RichMessageSendOptions = {}
): Promise<WAMessage[]> {
	const normalizedJid = normalizeJidOrThrow(jid)
	const album = buildAlbumMessage(medias, caption)
	const results: WAMessage[] = []

	for (const [index, media] of medias.entries()) {
		const content = await toMediaContent(sock, media, index === 0 ? caption : undefined)

		// `relayMessage` does not understand `albumParentKey`; the association is
		// conveyed via the mediagroup stanza attribute.
		const message = await sock.relayMessage(normalizedJid, content, {
			...options,
			additionalAttributes: {
				...(options.additionalAttributes ?? {}),
				mediagroup: album.albumMediaGroupId
			}
		})
		results.push(message)
	}

	return results
}

// ── parser ───────────────────────────────────────────────────────────────
export function readRichMessage(message: proto.IMessage): ParsedRichMessage | null {
	const inner = unwrapMessage(message)
	const album = parseAlbumMessage(message)

	// Album envelopes carry no richResponseMessage; surface them anyway so
	// callers can inspect counts, and plain interactive/button messages too.
	if (!inner.richResponseMessage) {
		if (!album && !inner.interactiveMessage) return null

		return {
			messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_UNKNOWN,
			blocks: [],
			text: '',
			suggestions: [],
			aiIcon: undefined,
			album,
			buttons: parseButtons(inner),
			citations: [],
			inlineLinks: [],
			contextInfo: undefined
		}
	}

	const rich = inner.richResponseMessage

	const blocks: ParsedRichBlock[] = []

	for (const sub of rich.submessages ?? []) {
		switch (sub.messageType) {
			case proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT:
				blocks.push(parseTextBlock(sub.messageText ?? ''))
				break
			case proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_CODE: {
				const code = (sub.codeMetadata?.codeBlocks ?? []).map(block => block.codeContent ?? '').join('\n')
				blocks.push({
					type: 'code',
					code,
					language: sub.codeMetadata?.codeLanguage ?? undefined
				})
				break
			}
			case proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TABLE: {
				const rows = sub.tableMetadata?.rows ?? []
				const heading = rows[0]?.isHeading === true
				blocks.push({
					type: 'table',
					headers: heading ? (rows[0]?.items ?? []) : [],
					rows: (heading ? rows.slice(1) : rows).map(row => row.items ?? [])
				})
				break
			}
			case proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_INLINE_IMAGE:
				blocks.push({
					type: 'image',
					url:
						sub.imageMetadata?.imageUrl?.imageHighResUrl ??
						sub.imageMetadata?.imageUrl?.imagePreviewUrl ??
						sub.imageMetadata?.imageUrl?.sourceUrl ??
						undefined,
					caption: sub.imageMetadata?.imageText ?? undefined
				})
				break
			case proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_GRID_IMAGE:
				blocks.push({
					type: 'gridImage',
					urls: (sub.gridImageMetadata?.imageUrls ?? [])
						.map(url => url.imageHighResUrl ?? url.imagePreviewUrl ?? url.sourceUrl ?? '')
						.filter(url => url.length > 0)
				})
				break
			case proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_CONTENT_ITEMS:
				blocks.push({
					type: 'reels',
					items: (sub.contentItemsMetadata?.itemsMetadata ?? []).map(item => ({
						url: item.reelItem?.videoUrl ?? undefined,
						caption: item.reelItem?.title ?? undefined
					}))
				})
				break
			case proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_DYNAMIC:
				blocks.push({
					type: 'video',
					url: sub.dynamicMetadata?.url ?? undefined
				})
				break
			case proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_LATEX:
				blocks.push({
					type: 'latex',
					formula: sub.latexMetadata?.text ?? sub.latexMetadata?.expressions?.[0]?.latexExpression ?? ''
				})
				break
			case proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_MAP:
				blocks.push({
					type: 'map',
					latitude: sub.mapMetadata?.centerLatitude ?? undefined,
					longitude: sub.mapMetadata?.centerLongitude ?? undefined,
					latitudeDelta: sub.mapMetadata?.latitudeDelta ?? undefined,
					longitudeDelta: sub.mapMetadata?.longitudeDelta ?? undefined
				})
				break
			default:
				blocks.push({ type: 'unknown', raw: sub })
				break
		}
	}

	const unified = decodeUnified(rich.unifiedResponse?.data)

	// V2 payloads may carry sections without matching submessages; surface them
	// as blocks so a V2-only message is still readable. Skip sections whose data
	// is already represented by a submessage (V2 senders emit both).
	const covered = new Set<ParsedRichBlock['type']>(
		blocks.map(block => block.type).filter(type => type === 'table' || type === 'code' || type === 'link')
	)

	if (unified?.sections) {
		for (const section of unified.sections) {
			const block = unifiedSectionToBlock(section)
			if (!block) continue
			if (covered.has(block.type)) continue
			blocks.push(block)
			if (block.type === 'table' || block.type === 'code' || block.type === 'link') covered.add(block.type)
		}
	}

	if (unified?.primitives) {
		for (const primitive of unified.primitives) {
			if (!primitive || typeof primitive !== 'object') continue
			const block = unifiedPrimitiveToBlock(primitive)
			if (!block) continue
			// Skip structural primitives already emitted as submessages/sections.
			if ((block.type === 'table' || block.type === 'code') && covered.has(block.type)) continue
			blocks.push(block)
			if (block.type === 'table' || block.type === 'code') covered.add(block.type)
		}
	}

	const text = blocks
		.filter((block): block is { type: 'text'; text: string } => block.type === 'text')
		.map(block => block.text)
		.join('\n\n')

	// suggestions live next to the (possibly wrapped) rich response, so check
	// both the outer envelope and the unwrapped inner message.
	const suggestedPrompts =
		message.messageContextInfo?.botMetadata?.suggestedPromptMetadata?.suggestedPrompts ??
		inner.messageContextInfo?.botMetadata?.suggestedPromptMetadata?.suggestedPrompts ??
		[]

	// WhatsApp has no native `aiIcon` field; we stored it in the unified payload
	// and optionally mirrored it into botMetadata for forks that read it there.
	const readAiIcon = (source: proto.IMessage): string | undefined => {
		const value = (source.messageContextInfo?.botMetadata as { aiIcon?: unknown } | undefined)?.aiIcon
		return typeof value === 'string' ? value : undefined
	}
	const aiIcon = unified?.aiIcon ?? readAiIcon(inner) ?? readAiIcon(message)

	return {
		messageType: rich.messageType ?? proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_UNKNOWN,
		blocks,
		text,
		suggestions: suggestedPrompts,
		unifiedResponse: rich.unifiedResponse?.data ?? undefined,
		unified,
		aiIcon,
		album,
		buttons: parseButtons(inner),
		citations: (unified?.citations ?? [])
			.map(citation => (typeof citation.url === 'string' ? citation.url : ''))
			.filter(url => url.length > 0),
		inlineLinks: (unified?.inlineLinks ?? [])
			.map(link => ({
				label: typeof link.label === 'string' ? link.label : '',
				url: typeof link.url === 'string' ? link.url : ''
			}))
			.filter(link => link.url.length > 0),
		contextInfo: rich.contextInfo ?? undefined
	}
}

const parseAlbumMessage = (message: proto.IMessage): ParsedRichMessage['album'] => {
	const album = message.albumMessage ?? unwrapMessage(message).albumMessage
	if (!album) return undefined

	const groupId = (message as { albumMediaGroupId?: unknown }).albumMediaGroupId

	return {
		expectedImageCount: album.expectedImageCount ?? undefined,
		expectedVideoCount: album.expectedVideoCount ?? undefined,
		albumMediaGroupId: typeof groupId === 'string' ? groupId : undefined
	}
}

const parseButtons = (message: proto.IMessage): RichButton[] => {
	const interactive = message.interactiveMessage
	if (!interactive) return []

	const buttons: RichButton[] = []
	const native = interactive.nativeFlowMessage?.buttons ?? []

	for (const [index, button] of native.entries()) {
		const name = button.name ?? ''
		let params: Record<string, unknown> = {}
		try {
			params = button.buttonParamsJson ? (JSON.parse(button.buttonParamsJson) as Record<string, unknown>) : {}
		} catch {
			params = {}
		}

		const text = typeof params.display_text === 'string' ? params.display_text : ''
		const id = typeof params.id === 'string' ? params.id : `${name}-${index}`

		if (name === 'cta_url') {
			buttons.push({
				type: 'url',
				id,
				text,
				url: typeof params.url === 'string' ? params.url : undefined
			})
		} else if (name === 'cta_call') {
			buttons.push({
				type: 'call',
				id,
				text,
				phone: typeof params.phone_number === 'string' ? params.phone_number : undefined
			})
		} else if (name === 'quick_reply' || name === '') {
			buttons.push({ type: 'reply', id, text })
		}
	}

	return buttons
}

const unifiedSectionToBlock = (section: UnifiedSection): ParsedRichBlock | null => {
	switch (section.type) {
		case 'table': {
			const headers = Array.isArray(section.headers) ? (section.headers as string[]) : []
			const rows = Array.isArray(section.rows) ? (section.rows as string[][]) : []
			return { type: 'table', headers, rows }
		}
		case 'code':
			return {
				type: 'code',
				code: typeof section.code === 'string' ? section.code : '',
				language: typeof section.language === 'string' ? section.language : undefined
			}
		case 'link':
			return {
				type: 'link',
				url: typeof section.url === 'string' ? section.url : '',
				title: typeof section.title === 'string' ? section.title : undefined
			}
		case 'text':
			return { type: 'text', text: typeof section.text === 'string' ? section.text : '' }
		default:
			return null
	}
}

const unifiedPrimitiveToBlock = (raw: Record<string, unknown>): ParsedRichBlock | null => {
	const primitive = unwrapPrimitive(raw)
	const typename = typeof primitive.__typename === 'string' ? primitive.__typename : ''

	switch (typename) {
		case UX_PRIMITIVE_TYPENAMES.markdown:
			return typeof primitive.text === 'string' ? parseTextBlock(primitive.text) : null
		case UX_PRIMITIVE_TYPENAMES.code:
			return {
				type: 'code',
				code: typeof primitive.code === 'string' ? primitive.code : '',
				language: typeof primitive.language === 'string' ? primitive.language : undefined
			}
		case UX_PRIMITIVE_TYPENAMES.latex:
			return {
				type: 'latex',
				formula:
					typeof primitive.formula === 'string'
						? primitive.formula
						: typeof primitive.text === 'string'
							? primitive.text
							: ''
			}
		case UX_PRIMITIVE_TYPENAMES.table:
			return {
				type: 'table',
				headers: Array.isArray(primitive.headers) ? (primitive.headers as string[]) : [],
				rows: Array.isArray(primitive.rows) ? (primitive.rows as string[][]) : []
			}
		case UX_PRIMITIVE_TYPENAMES.metadataText:
			return typeof primitive.text === 'string' ? { type: 'text', text: primitive.text } : null
		default:
			return null
	}
}
