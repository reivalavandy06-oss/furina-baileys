import { proto } from '../../../WAProto/index.js'
import type { WAMessage, MessageRelayOptions } from '../../Types'
import { jidNormalizedUser } from '../../WABinary/jid-utils'
import type { FurinaSocket } from './types'

export interface RichMessageSendOptions extends MessageRelayOptions {
	/** quote an existing message by injecting its contextInfo into the rich response */
	quoted?: WAMessage
}

type RichContentBlock =
	| { type: 'text'; text: string }
	| { type: 'code'; code: string; language: string }
	| { type: 'table'; headers: string[]; rows: string[][] }
	| { type: 'list'; text: string }
	| { type: 'link'; url: string; title: string }
	| { type: 'image'; url: string; caption: string }
	| { type: 'latex'; formula: string }
	| { type: 'map'; latitude: number; longitude: number; delta: number }

export type ParsedRichBlock =
	| { type: 'text'; text: string }
	| { type: 'code'; code: string; language?: string }
	| { type: 'table'; headers: string[]; rows: string[][] }
	| { type: 'list'; items: string[] }
	| { type: 'link'; url: string; title?: string }
	| { type: 'image'; url?: string; caption?: string }
	| { type: 'latex'; formula: string }
	| { type: 'map'; latitude?: number; longitude?: number; latitudeDelta?: number; longitudeDelta?: number }
	| { type: 'unknown'; raw: proto.IAIRichResponseSubMessage }

export interface ParsedRichMessage {
	messageType: proto.AIRichResponseMessageType
	blocks: ParsedRichBlock[]
	/** flattened text of every text-like block, joined with a blank line */
	text: string
	/** suggested prompts carried in messageContextInfo.botMetadata */
	suggestions: string[]
	unifiedResponse?: Uint8Array
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

const isSeparatorRow = (cells: string[]): boolean =>
	cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell))

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

export class RichMessageBuilder {
	private blocks: RichContentBlock[] = []
	private suggestions: string[] = []
	private unifiedResponse?: Uint8Array
	private botForwarded = false

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

	addImage(url: string, caption: string): this {
		this.blocks.push({ type: 'image', url, caption })
		return this
	}

	addMap(lat: number, lng: number, zoom: number): this {
		const clampedZoom = Math.min(20, Math.max(0, zoom))
		const delta = 360 / Math.pow(2, clampedZoom)
		this.blocks.push({ type: 'map', latitude: lat, longitude: lng, delta })
		return this
	}

	addLink(url: string, title: string): this {
		this.blocks.push({ type: 'link', url, title })
		return this
	}

	addSuggestions(items: string[]): this {
		this.suggestions.push(...items)
		return this
	}

	setUnifiedResponse(data: Uint8Array | string): this {
		this.unifiedResponse = typeof data === 'string' ? new TextEncoder().encode(data) : data
		return this
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
							imageUrl: {
								imagePreviewUrl: block.url,
								imageHighResUrl: block.url,
								sourceUrl: block.url
							},
							imageText: block.caption,
							alignment:
								proto.AIRichResponseInlineImageMetadata.AIRichResponseImageAlignment
									.AI_RICH_RESPONSE_IMAGE_LAYOUT_CENTER_ALIGNED
						}
					})
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

		return content
	}
}

export const buildLatexImageUrl = (formula: string, dpi = 150): string =>
	`https://latex.codecogs.com/png.image?%5Cdpi%7B${dpi}%7D%20${encodeURIComponent(formula)}`

export async function sendRichMessage(
	sock: FurinaSocket,
	jid: string,
	builder: RichMessageBuilder,
	options: RichMessageSendOptions = {}
): Promise<WAMessage> {
	const normalizedJid = jidNormalizedUser(jid)
	if (!normalizedJid) {
		throw new Error(`Invalid JID: ${jid}`)
	}

	const content = builder.build()
	applyQuotedContext(content, options.quoted)
	return sock.relayMessage(normalizedJid, content, options)
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

export function readRichMessage(message: proto.IMessage): ParsedRichMessage | null {
	const inner = unwrapMessage(message)
	const rich = inner.richResponseMessage
	if (!rich) return null

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
			case proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_LATEX:
				blocks.push({
					type: 'latex',
					formula:
						sub.latexMetadata?.text ?? sub.latexMetadata?.expressions?.[0]?.latexExpression ?? ''
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

	return {
		messageType: rich.messageType ?? proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_UNKNOWN,
		blocks,
		text,
		suggestions: suggestedPrompts,
		unifiedResponse: rich.unifiedResponse?.data ?? undefined,
		contextInfo: rich.contextInfo ?? undefined
	}
}
