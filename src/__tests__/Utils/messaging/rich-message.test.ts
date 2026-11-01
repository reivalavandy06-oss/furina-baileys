import { proto } from '../../../../WAProto'
import {
	ORich,
	RichMessageBuilder,
	buildLatexImageUrl,
	generateRichHtmlContent,
	generateUnifiedContent,
	readRichMessage,
	sendCodeBlock,
	sendCodeBlockV2,
	sendLatexImage,
	sendLinkV2,
	sendList,
	sendMarkdown,
	sendRichHtml,
	sendRichMessage,
	sendLatex,
	sendLatexInlineImage,
	captureUnifiedResponse,
	assertSafeUrl,
	isSafeUrl,
	sendStatusMentions,
	sendTable,
	sendTableV2,
	sendUnifiedResponse,
	tokenizeCode
} from '../../../Utils/messaging/rich-message'
import type { FurinaSocket } from '../../../Utils/messaging/types'
import type { WAMessage } from '../../../Types'

const makeMockSock = () => {
	const calls: { jid: string; content: proto.IMessage; options?: unknown }[] = []
	const sock = {
		relayMessage: async (jid: string, content: proto.IMessage, options?: unknown) => {
			calls.push({ jid, content, options })
			return { key: { id: 'MOCK', remoteJid: jid } } as WAMessage
		}
	} as unknown as FurinaSocket

	return { sock, calls }
}

const decodeText = (data?: Uint8Array | null) => new TextDecoder().decode(data ?? new Uint8Array())

const sub = (msg: proto.IMessage, index = 0) => msg.richResponseMessage?.submessages?.[index]

describe('RichMessageBuilder', () => {
	it('should build an empty message', () => {
		const builder = new RichMessageBuilder()
		const msg = builder.build()

		expect(msg.richResponseMessage).toBeDefined()
		expect(msg.richResponseMessage?.submessages).toEqual([])
		expect(msg.richResponseMessage?.messageType).toBe(proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD)
	})

	it('should add text block correctly', () => {
		const builder = new RichMessageBuilder()
		builder.addText('Hello world')
		const msg = builder.build()

		expect(msg.richResponseMessage?.submessages).toHaveLength(1)
		const block = sub(msg)
		expect(block?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT)
		expect(block?.messageText).toBe('Hello world')
	})

	it('should add code block correctly', () => {
		const builder = new RichMessageBuilder()
		builder.addCodeBlock('console.log("test")', 'javascript')
		const msg = builder.build()

		const block = sub(msg)
		expect(block?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_CODE)
		expect(block?.codeMetadata?.codeLanguage).toBe('javascript')
		expect(block?.codeMetadata?.codeBlocks?.[0]?.codeContent).toBe('console.log("test")')
	})

	it('should add table with headers correctly', () => {
		const builder = new RichMessageBuilder()
		builder.addTable(
			['Name', 'Age'],
			[
				['Alice', '30'],
				['Bob', '25']
			]
		)
		const msg = builder.build()

		const block = sub(msg)
		expect(block?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TABLE)
		expect(block?.tableMetadata?.rows).toHaveLength(3)
		expect(block?.tableMetadata?.rows?.[0]).toEqual({ items: ['Name', 'Age'], isHeading: true })
		expect(block?.tableMetadata?.rows?.[1]).toEqual({ items: ['Alice', '30'], isHeading: false })
	})

	it('should add list correctly', () => {
		const builder = new RichMessageBuilder()
		builder.addList(['Item 1', 'Item 2', 'Item 3'])
		const msg = builder.build()

		const block = sub(msg)
		expect(block?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT)
		expect(block?.messageText).toBe('• Item 1\n• Item 2\n• Item 3')
	})

	it('should add latex block correctly', () => {
		const builder = new RichMessageBuilder()
		builder.addLatex('E = mc^2')
		const msg = builder.build()

		const block = sub(msg)
		expect(block?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_LATEX)
		expect(block?.latexMetadata?.text).toBe('E = mc^2')
		expect(block?.latexMetadata?.expressions?.[0]?.latexExpression).toBe('E = mc^2')
	})

	it('should add image block correctly', () => {
		const builder = new RichMessageBuilder()
		builder.addImage('https://example.com/a.png', 'a caption')
		const msg = builder.build()

		const block = sub(msg)
		expect(block?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_INLINE_IMAGE)
		expect(block?.imageMetadata?.imageUrl?.imageHighResUrl).toBe('https://example.com/a.png')
		expect(block?.imageMetadata?.imageText).toBe('a caption')
		expect(block?.imageMetadata?.alignment).toBe(
			proto.AIRichResponseInlineImageMetadata.AIRichResponseImageAlignment.AI_RICH_RESPONSE_IMAGE_LAYOUT_CENTER_ALIGNED
		)
	})

	it('should add map block with zoom-derived delta', () => {
		const builder = new RichMessageBuilder()
		builder.addMap(-6.2, 106.8, 10)
		const msg = builder.build()

		const block = sub(msg)
		expect(block?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_MAP)
		expect(block?.mapMetadata?.centerLatitude).toBe(-6.2)
		expect(block?.mapMetadata?.centerLongitude).toBe(106.8)
		expect(block?.mapMetadata?.latitudeDelta).toBeCloseTo(360 / Math.pow(2, 10))
		expect(block?.mapMetadata?.showInfoList).toBe(true)
	})

	it('should clamp map zoom to valid range', () => {
		const low = new RichMessageBuilder().addMap(0, 0, -5).build()
		const high = new RichMessageBuilder().addMap(0, 0, 99).build()

		expect(sub(low)?.mapMetadata?.latitudeDelta).toBe(360)
		expect(sub(high)?.mapMetadata?.latitudeDelta).toBeCloseTo(360 / Math.pow(2, 20))
	})

	it('should render link as markdown text', () => {
		const builder = new RichMessageBuilder()
		builder.addLink('https://example.com', 'Example')
		const msg = builder.build()

		const block = sub(msg)
		expect(block?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT)
		expect(block?.messageText).toBe('[Example](https://example.com)')
	})

	it('should attach suggestions to messageContextInfo.botMetadata', () => {
		const builder = new RichMessageBuilder()
		builder.addText('hi').addSuggestions(['Tell me more', 'Another one'])
		const msg = builder.build()

		expect(msg.messageContextInfo?.botMetadata?.suggestedPromptMetadata?.suggestedPrompts).toEqual([
			'Tell me more',
			'Another one'
		])
	})

	it('should not emit messageContextInfo when there are no suggestions', () => {
		const msg = new RichMessageBuilder().addText('hi').build()
		expect(msg.messageContextInfo).toBeUndefined()
	})

	it('should support unifiedResponse (V2)', () => {
		const builder = new RichMessageBuilder().addText('v2').setUnifiedResponse('payload')
		const msg = builder.build()

		expect(msg.richResponseMessage?.unifiedResponse?.data).toEqual(new TextEncoder().encode('payload'))
	})

	it('should wrap in botForwardedMessage when requested', () => {
		const builder = new RichMessageBuilder().addText('wrapped').wrapInBotForwarded()
		const msg = builder.build()

		expect(msg.botForwardedMessage?.message?.richResponseMessage?.submessages).toHaveLength(1)
		expect(msg.richResponseMessage).toBeUndefined()
	})

	it('should chain multiple blocks', () => {
		const builder = new RichMessageBuilder()
		builder.addText('Introduction').addCodeBlock('const x = 1', 'javascript').addList(['Point 1', 'Point 2'])

		const msg = builder.build()
		expect(msg.richResponseMessage?.submessages).toHaveLength(3)
		expect(sub(msg, 0)?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT)
		expect(sub(msg, 1)?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_CODE)
		expect(sub(msg, 2)?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT)
	})

	it('should parse markdown into blocks', () => {
		const md = [
			'# Title',
			'',
			'Some intro paragraph.',
			'',
			'```js',
			'const a = 1',
			'```',
			'',
			'| Name | Age |',
			'| --- | --- |',
			'| Alice | 30 |',
			'',
			'- one',
			'- two'
		].join('\n')

		const msg = new RichMessageBuilder().addMarkdown(md).build()
		const blocks = msg.richResponseMessage?.submessages ?? []

		expect(blocks).toHaveLength(5)
		expect(blocks[0]?.messageText).toBe('Title')
		expect(blocks[1]?.messageText).toBe('Some intro paragraph.')
		expect(blocks[2]?.codeMetadata?.codeLanguage).toBe('js')
		expect(blocks[3]?.tableMetadata?.rows).toHaveLength(2)
		expect(blocks[4]?.messageText).toBe('• one\n• two')
	})

	it('should handle empty table rows', () => {
		const msg = new RichMessageBuilder().addTable(['Header'], []).build()
		const rows = sub(msg)?.tableMetadata?.rows
		expect(rows).toHaveLength(1)
		expect(rows?.[0]?.isHeading).toBe(true)
	})

	it('should handle table without headers', () => {
		const msg = new RichMessageBuilder().addTable([], [['Cell 1', 'Cell 2']]).build()
		const rows = sub(msg)?.tableMetadata?.rows
		expect(rows).toHaveLength(1)
		expect(rows?.[0]).toEqual({ items: ['Cell 1', 'Cell 2'], isHeading: false })
	})

	it('should handle empty list', () => {
		const msg = new RichMessageBuilder().addList([]).build()
		expect(sub(msg)?.messageText).toBe('')
	})
})

describe('sendRichMessage helpers', () => {
	const QUOTED = {
		key: { id: 'QUOTED_ID', remoteJid: '628111@s.whatsapp.net', fromMe: false },
		message: { conversation: 'quoted' }
	} as WAMessage

	it('should normalize the jid before relaying', async () => {
		const { sock, calls } = makeMockSock()
		await sendRichMessage(sock, '6281234567890:12@s.whatsapp.net', new RichMessageBuilder().addText('x'))

		expect(calls).toHaveLength(1)
		expect(calls[0]!.jid).toBe('6281234567890@s.whatsapp.net')
	})

	it('should throw on an invalid jid', async () => {
		const { sock } = makeMockSock()
		await expect(sendRichMessage(sock, '', new RichMessageBuilder())).rejects.toThrow(/Invalid JID/)
	})

	it('should inject quoted contextInfo', async () => {
		const { sock, calls } = makeMockSock()
		await sendRichMessage(sock, '6281234567890@s.whatsapp.net', new RichMessageBuilder().addText('x'), {
			quoted: QUOTED
		})

		const ctx = calls[0]!.content.richResponseMessage?.contextInfo
		expect(ctx?.stanzaId).toBe('QUOTED_ID')
		expect(ctx?.participant).toBe('628111@s.whatsapp.net')
		expect(ctx?.quotedMessage).toEqual({ conversation: 'quoted' })
	})

	it('should inject quoted contextInfo through the botForwarded wrapper', async () => {
		const { sock, calls } = makeMockSock()
		await sendRichMessage(
			sock,
			'6281234567890@s.whatsapp.net',
			new RichMessageBuilder().addText('x').wrapInBotForwarded(),
			{ quoted: QUOTED }
		)

		const ctx = calls[0]!.content.botForwardedMessage?.message?.richResponseMessage?.contextInfo
		expect(ctx?.stanzaId).toBe('QUOTED_ID')
	})

	it('should not mutate content when no quote is given', async () => {
		const { sock, calls } = makeMockSock()
		await sendRichMessage(sock, '6281234567890@s.whatsapp.net', new RichMessageBuilder().addText('x'))

		expect(calls[0]!.content.richResponseMessage?.contextInfo).toBeUndefined()
	})

	it('sendTable builds a title + table message', async () => {
		const { sock, calls } = makeMockSock()
		await sendTable(sock, '6281234567890@s.whatsapp.net', 'Judul', ['A'], [['1']], QUOTED)

		const subs = calls[0]!.content.richResponseMessage?.submessages ?? []
		expect(subs).toHaveLength(2)
		expect(subs[0]?.messageText).toBe('Judul')
		expect(subs[1]?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TABLE)
		expect(calls[0]!.content.richResponseMessage?.contextInfo?.stanzaId).toBe('QUOTED_ID')
	})

	it('sendList builds a title + list message', async () => {
		const { sock, calls } = makeMockSock()
		await sendList(sock, '6281234567890@s.whatsapp.net', 'Judul', ['a', 'b'])

		const subs = calls[0]!.content.richResponseMessage?.submessages ?? []
		expect(subs).toHaveLength(2)
		expect(subs[1]?.messageText).toBe('• a\n• b')
	})

	it('sendCodeBlock builds a code message', async () => {
		const { sock, calls } = makeMockSock()
		await sendCodeBlock(sock, '6281234567890@s.whatsapp.net', 'let x = 1', 'ts')

		const subs = calls[0]!.content.richResponseMessage?.submessages ?? []
		expect(subs).toHaveLength(1)
		expect(subs[0]?.codeMetadata?.codeLanguage).toBe('ts')
	})

	it('sendLatexImage emits latex + rendered image', async () => {
		const { sock, calls } = makeMockSock()
		await sendLatexImage(sock, '6281234567890@s.whatsapp.net', 'x^2')

		const subs = calls[0]!.content.richResponseMessage?.submessages ?? []
		expect(subs).toHaveLength(2)
		expect(subs[0]?.latexMetadata?.text).toBe('x^2')
		expect(subs[1]?.imageMetadata?.imageUrl?.imageHighResUrl).toBe(buildLatexImageUrl('x^2'))
	})

	it('sendMarkdown parses and sends', async () => {
		const { sock, calls } = makeMockSock()
		await sendMarkdown(sock, '6281234567890@s.whatsapp.net', '**not parsed** but text')

		const subs = calls[0]!.content.richResponseMessage?.submessages ?? []
		expect(subs).toHaveLength(1)
		expect(subs[0]?.messageText).toBe('**not parsed** but text')
	})
})

describe('readRichMessage', () => {
	it('returns null for non-rich messages', () => {
		expect(readRichMessage({ conversation: 'hello' })).toBeNull()
	})

	it('parses a standard rich message back into blocks', () => {
		const builder = new RichMessageBuilder()
			.addText('intro')
			.addCodeBlock('const a = 1', 'js')
			.addTable(['H'], [['v']])
			.addList(['a', 'b'])
			.addLatex('a^2+b^2')
			.addImage('https://example.com/x.png', 'cap')
			.addMap(1, 2, 5)
			.addSuggestions(['s1'])

		const parsed = readRichMessage(builder.build())
		expect(parsed).not.toBeNull()
		expect(parsed?.messageType).toBe(proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD)
		expect(parsed?.blocks.map(b => b.type)).toEqual(['text', 'code', 'table', 'list', 'latex', 'image', 'map'])
		expect(parsed?.text).toBe('intro')
		expect(parsed?.blocks[1]).toEqual({ type: 'code', code: 'const a = 1', language: 'js' })
		expect(parsed?.blocks[2]).toEqual({ type: 'table', headers: ['H'], rows: [['v']] })
		expect(parsed?.blocks[3]).toEqual({ type: 'list', items: ['a', 'b'] })
		expect(parsed?.blocks[4]).toEqual({ type: 'latex', formula: 'a^2+b^2' })
		expect(parsed?.suggestions).toEqual(['s1'])
	})

	it('detects markdown-style links inside text blocks', () => {
		const builder = new RichMessageBuilder().addText('[Docs](https://example.com/docs)')
		const parsed = readRichMessage(builder.build())
		expect(parsed?.blocks[0]).toEqual({ type: 'link', title: 'Docs', url: 'https://example.com/docs' })
	})

	it('parses messages wrapped in botForwardedMessage', () => {
		const builder = new RichMessageBuilder().addText('wrapped').wrapInBotForwarded()
		const parsed = readRichMessage(builder.build())
		expect(parsed?.text).toBe('wrapped')
	})

	it('keeps suggestions that live on the outer envelope', () => {
		const builder = new RichMessageBuilder().addText('wrapped').wrapInBotForwarded().addSuggestions(['outer'])
		const parsed = readRichMessage(builder.build())
		expect(parsed?.suggestions).toEqual(['outer'])
	})

	it('exposes unifiedResponse payload', () => {
		const builder = new RichMessageBuilder().addText('v2').setUnifiedResponse(new Uint8Array([1, 2, 3]))
		const parsed = readRichMessage(builder.build())
		expect(parsed?.unifiedResponse).toEqual(new Uint8Array([1, 2, 3]))
	})

	it('preserves unknown submessages', () => {
		const message: proto.IMessage = {
			richResponseMessage: {
				messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
				submessages: [
					{
						messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_UNKNOWN
					}
				]
			}
		}

		const parsed = readRichMessage(message)
		expect(parsed?.blocks[0]?.type).toBe('unknown')
	})

	it('joins multiple text blocks into the text field', () => {
		const builder = new RichMessageBuilder().addText('one').addText('two')
		expect(readRichMessage(builder.build())?.text).toBe('one\n\ntwo')
	})
})

describe('RichMessageBuilder Phase 3', () => {
	it('addGridImage emits GRID_IMAGE with all urls', () => {
		const msg = new RichMessageBuilder()
			.addGridImage(['https://cdn/a.png', 'https://cdn/b.png', 'https://cdn/c.png'])
			.build()
		const block = sub(msg)

		expect(block?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_GRID_IMAGE)
		expect(block?.gridImageMetadata?.imageUrls).toHaveLength(3)
		expect(block?.gridImageMetadata?.gridImageUrl?.imageHighResUrl).toBe('https://cdn/a.png')
		expect(block?.gridImageMetadata?.imageUrls?.[2]?.sourceUrl).toBe('https://cdn/c.png')
	})

	it('addGridImage handles an empty url list', () => {
		const msg = new RichMessageBuilder().addGridImage([]).build()
		const block = sub(msg)

		expect(block?.gridImageMetadata?.imageUrls).toEqual([])
		expect(block?.gridImageMetadata?.gridImageUrl).toBeUndefined()
	})

	it('addInlineImage emits INLINE_IMAGE with optional caption', () => {
		const withCaption = new RichMessageBuilder().addInlineImage('https://cdn/x.png', 'cap').build()
		const withoutCaption = new RichMessageBuilder().addInlineImage('https://cdn/y.png').build()

		expect(sub(withCaption)?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_INLINE_IMAGE)
		expect(sub(withCaption)?.imageMetadata?.imageText).toBe('cap')
		expect(sub(withoutCaption)?.imageMetadata?.imageText).toBe('')
		expect(sub(withoutCaption)?.imageMetadata?.imageUrl?.imageHighResUrl).toBe('https://cdn/y.png')
	})

	it('addReels emits CONTENT_ITEMS with reel items', () => {
		const reels = [{ url: 'https://v/1.mp4', caption: 'first' }, { url: 'https://v/2.mp4' }]
		const msg = new RichMessageBuilder().addReels(reels).build()
		const block = sub(msg)

		expect(block?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_CONTENT_ITEMS)
		expect(block?.contentItemsMetadata?.contentType).toBe(proto.AIRichResponseContentItemsMetadata.ContentType.DEFAULT)
		expect(block?.contentItemsMetadata?.itemsMetadata).toHaveLength(2)
		expect(block?.contentItemsMetadata?.itemsMetadata?.[0]?.reelItem?.videoUrl).toBe('https://v/1.mp4')
		expect(block?.contentItemsMetadata?.itemsMetadata?.[0]?.reelItem?.title).toBe('first')
		expect(block?.contentItemsMetadata?.itemsMetadata?.[1]?.reelItem?.title).toBe('')
	})

	it('addVideo emits a DYNAMIC block plus caption text', () => {
		const msg = new RichMessageBuilder().addVideo('https://v/g.mp4', 'look').build()

		expect(sub(msg, 0)?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_DYNAMIC)
		expect(sub(msg, 0)?.dynamicMetadata?.url).toBe('https://v/g.mp4')
		expect(sub(msg, 0)?.dynamicMetadata?.type).toBe(
			proto.AIRichResponseDynamicMetadata.AIRichResponseDynamicMetadataType.AI_RICH_RESPONSE_DYNAMIC_METADATA_TYPE_GIF
		)
		expect(sub(msg, 1)?.messageText).toBe('look')
	})

	it('setUnifiedResponse accepts a V2 payload object', () => {
		const msg = new RichMessageBuilder().addText('t').setUnifiedResponse({ version: 2, sections: [] }).build()
		const decoded = JSON.parse(decodeText(msg.richResponseMessage?.unifiedResponse?.data))

		expect(decoded).toEqual({ version: 2, sections: [] })
	})
})

describe('tokenizeCode', () => {
	const types = (tokens: { type: string }[]) => tokens.map(token => token.type)

	it('round-trips the original source', () => {
		const code = 'const x = 42 // note\nconsole.log("hi")'
		expect(
			tokenizeCode(code, 'javascript')
				.map(token => token.value)
				.join('')
		).toBe(code)
	})

	it('classifies keywords, strings, numbers, comments and methods', () => {
		const tokens = tokenizeCode('const a = foo(1, "s") // c', 'javascript')
		const byType = new Map<string, string[]>()

		for (const token of tokens) {
			byType.set(token.type, [...(byType.get(token.type) ?? []), token.value])
		}

		expect(byType.get('KEYWORD')).toEqual(['const'])
		expect(byType.get('METHOD')).toEqual(['foo'])
		expect(byType.get('NUMBER')).toEqual(['1'])
		expect(byType.get('STRING')).toEqual(['"s"'])
		expect(byType.get('COMMENT')).toEqual(['// c'])
	})

	it('supports hash comments for python', () => {
		const tokens = tokenizeCode('def f():\n    return 1  # done', 'python')
		expect(tokens.find(token => token.type === 'COMMENT')?.value).toBe('# done')
		expect(tokens.find(token => token.value === 'def')?.type).toBe('KEYWORD')
	})

	it('does not treat hash as a comment in javascript', () => {
		const tokens = tokenizeCode('const t = "#notcomment"', 'javascript')
		expect(tokens.some(token => token.type === 'COMMENT')).toBe(false)
		expect(tokens.find(token => token.value === '"#notcomment"')?.type).toBe('STRING')
	})

	it('handles block comments', () => {
		const tokens = tokenizeCode('/* multi\nline */ let y = 2', 'javascript')
		expect(tokens[0]?.type).toBe('COMMENT')
		expect(tokens[0]?.value).toBe('/* multi\nline */')
		expect(tokens.find(token => token.value === 'let')?.type).toBe('KEYWORD')
	})

	it('returns only DEFAULT tokens for plain text', () => {
		const tokens = tokenizeCode('hello world', 'text')
		expect(new Set(types(tokens))).toEqual(new Set(['DEFAULT']))
	})
})

describe('V2 unified senders', () => {
	it('sendUnifiedResponse writes a JSON v2 payload', async () => {
		const { sock, calls } = makeMockSock()
		await sendUnifiedResponse(sock, '6281234567890@s.whatsapp.net', {
			version: 2,
			sections: [{ type: 'text', text: 'hi' }]
		})

		const data = calls[0]!.content.richResponseMessage?.unifiedResponse?.data
		expect(JSON.parse(decodeText(data))).toEqual({
			version: 2,
			sections: [{ type: 'text', text: 'hi' }]
		})
	})

	it('sendUnifiedResponse normalizes the jid and quotes', async () => {
		const { sock, calls } = makeMockSock()
		const quoted = { key: { id: 'Q1', remoteJid: '628@s.whatsapp.net', fromMe: false } } as WAMessage
		await sendUnifiedResponse(sock, '6281234567890:3@s.whatsapp.net', 'raw-body', { quoted })

		expect(calls[0]!.jid).toBe('6281234567890@s.whatsapp.net')
		expect(calls[0]!.content.richResponseMessage?.contextInfo?.stanzaId).toBe('Q1')
	})

	it('sendTableV2 emits both submessages and a v2 section', async () => {
		const { sock, calls } = makeMockSock()
		await sendTableV2(sock, '628@s.whatsapp.net', 'T', ['H'], [['1']])

		const rich = calls[0]!.content.richResponseMessage
		expect(rich?.submessages).toHaveLength(2)
		const unified = JSON.parse(decodeText(rich?.unifiedResponse?.data))
		expect(unified.sections[0]).toEqual({ type: 'table', title: 'T', headers: ['H'], rows: [['1']] })
	})

	it('sendCodeBlockV2 emits a v2 code section', async () => {
		const { sock, calls } = makeMockSock()
		await sendCodeBlockV2(sock, '628@s.whatsapp.net', 'let a = 1', 'ts')

		const unified = JSON.parse(decodeText(calls[0]!.content.richResponseMessage?.unifiedResponse?.data))
		expect(unified.sections[0]).toEqual({ type: 'code', language: 'ts', code: 'let a = 1' })
	})

	it('sendLinkV2 emits a v2 link section', async () => {
		const { sock, calls } = makeMockSock()
		await sendLinkV2(sock, '628@s.whatsapp.net', 'https://a', 'A')

		const unified = JSON.parse(decodeText(calls[0]!.content.richResponseMessage?.unifiedResponse?.data))
		expect(unified.sections[0]).toEqual({ type: 'link', url: 'https://a', title: 'A' })
	})

	it('generateUnifiedContent returns a richResponseMessage envelope', () => {
		const content = generateUnifiedContent({ version: 2, html: '<b>x</b>' })
		expect(content.richResponseMessage?.messageType).toBe(
			proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD
		)
	})
})

describe('rich HTML', () => {
	it('generateRichHtmlContent encodes an html v2 payload', () => {
		const content = generateRichHtmlContent('<h1>hi</h1>')
		const decoded = JSON.parse(decodeText(content.richResponseMessage?.unifiedResponse?.data))
		expect(decoded).toEqual({ version: 2, type: 'html', html: '<h1>hi</h1>' })
	})

	it('sendRichHtml relays to the normalized jid', async () => {
		const { sock, calls } = makeMockSock()
		await sendRichHtml(sock, '6281234567890:9@s.whatsapp.net', '<p>x</p>')

		expect(calls[0]!.jid).toBe('6281234567890@s.whatsapp.net')
		const decoded = JSON.parse(decodeText(calls[0]!.content.richResponseMessage?.unifiedResponse?.data))
		expect(decoded.html).toBe('<p>x</p>')
	})
})

describe('ORich builder', () => {
	it('is a RichMessageBuilder subclass', () => {
		expect(new ORich()).toBeInstanceOf(RichMessageBuilder)
	})

	it('addSource writes richResponseSourcesMetadata', () => {
		const msg = new ORich()
			.addText('answer')
			.addSource({ title: 'Wikipedia', url: 'https://w', citationNumber: 1 })
			.build()

		const sources = msg.messageContextInfo?.botMetadata?.richResponseSourcesMetadata?.sources
		expect(sources).toHaveLength(1)
		expect(sources?.[0]?.sourceTitle).toBe('Wikipedia')
		expect(sources?.[0]?.sourceProviderUrl).toBe('https://w')
		expect(sources?.[0]?.citationNumber).toBe(1)
	})

	it('addMetadata merges into botMetadata', () => {
		const msg = new ORich().addMetadata({ personaId: 'p1', timezone: 'Asia/Jakarta' }).build()
		expect(msg.messageContextInfo?.botMetadata?.personaId).toBe('p1')
		expect(msg.messageContextInfo?.botMetadata?.timezone).toBe('Asia/Jakarta')
	})

	it('addProduct renders image + link and records extras', () => {
		const msg = new ORich()
			.addProduct({
				title: 'Kopi',
				price: 25000,
				currency: 'IDR',
				url: 'https://shop/1',
				thumbnailUrl: 'https://cdn/p.png'
			})
			.build()

		const subs = msg.richResponseMessage?.submessages ?? []
		expect(subs[0]?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_INLINE_IMAGE)
		expect(subs[1]?.messageText).toBe('[Kopi — 25000 IDR](https://shop/1)')

		const unified = JSON.parse(decodeText(msg.richResponseMessage?.unifiedResponse?.data))
		expect(unified.extras.products[0].title).toBe('Kopi')
	})

	it('addPost renders a link with author', () => {
		const msg = new ORich().addPost({ title: 'Post', url: 'https://p', author: 'Ann' }).build()
		expect(sub(msg)?.messageText).toBe('[Post — Ann](https://p)')
	})

	it('addTip prefixes with Tip and records metadata', () => {
		const msg = new ORich().addTip('keep it short').build()
		expect(sub(msg)?.messageText).toBe('Tip: keep it short')

		const unified = JSON.parse(decodeText(msg.richResponseMessage?.unifiedResponse?.data))
		expect(unified.extras.tips[0].text).toBe('keep it short')
	})

	it('addTip honours a custom title', () => {
		const msg = new ORich().addTip('body', { title: 'Pro tip' }).build()
		expect(sub(msg)?.messageText).toBe('Pro tip\nbody')
	})

	it('addWidget renders a link and records the widget', () => {
		const msg = new ORich().addWidget({ title: 'Weather', url: 'https://w/x' }).build()
		expect(sub(msg)?.messageText).toBe('[Weather](https://w/x)')

		const unified = JSON.parse(decodeText(msg.richResponseMessage?.unifiedResponse?.data))
		expect(unified.extras.widgets[0].title).toBe('Weather')
	})

	it('addFooterAction renders a link', () => {
		const msg = new ORich().addFooterAction({ label: 'Open', url: 'https://o' }).build()
		expect(sub(msg)?.messageText).toBe('[Open](https://o)')
	})

	it('addSuggest appends prompts and keeps them in unified extras', () => {
		const msg = new ORich().addSuggest(['a', 'b'], 'c').build()
		expect(msg.messageContextInfo?.botMetadata?.suggestedPromptMetadata?.suggestedPrompts).toEqual(['a', 'b', 'c'])

		const unified = JSON.parse(decodeText(msg.richResponseMessage?.unifiedResponse?.data))
		expect(unified.extras.suggests).toEqual(['a', 'b', 'c'])
	})

	it('merges with an existing unified payload', () => {
		const msg = new ORich()
			.addText('t')
			.setUnifiedResponse({ version: 2, sections: [{ type: 'text', text: 'x' }] })
			.addTip('y')
			.build()

		const unified = JSON.parse(decodeText(msg.richResponseMessage?.unifiedResponse?.data))
		expect(unified.sections).toEqual([{ type: 'text', text: 'x' }])
		expect(unified.extras.tips[0].text).toBe('y')
	})

	it('does not add a unified payload when there are no extras', () => {
		const msg = new ORich().addText('just text').build()
		expect(msg.richResponseMessage?.unifiedResponse).toBeUndefined()
	})
})

describe('sendStatusMentions', () => {
	it('relays to status@broadcast with a normalized jid list', async () => {
		const { sock, calls } = makeMockSock()
		await sendStatusMentions(sock, 'hello status', ['628111:2@s.whatsapp.net', '628222@s.whatsapp.net'])

		expect(calls[0]!.jid).toBe('status@broadcast')
		expect(calls[0]!.content).toEqual({ conversation: 'hello status' })
		expect((calls[0]!.options as { statusJidList?: string[] }).statusJidList).toEqual([
			'628111@s.whatsapp.net',
			'628222@s.whatsapp.net'
		])
	})

	it('accepts a builder and injects quoted context', async () => {
		const { sock, calls } = makeMockSock()
		const quoted = { key: { id: 'QS', remoteJid: '628@s.whatsapp.net', fromMe: false } } as WAMessage
		await sendStatusMentions(sock, new RichMessageBuilder().addText('s'), ['628111@s.whatsapp.net'], { quoted })

		expect(calls[0]!.content.richResponseMessage?.contextInfo?.stanzaId).toBe('QS')
	})

	it('drops invalid jids from the list', async () => {
		const { sock, calls } = makeMockSock()
		await sendStatusMentions(sock, 'x', ['', '628111@s.whatsapp.net'])
		expect((calls[0]!.options as { statusJidList?: string[] }).statusJidList).toEqual(['628111@s.whatsapp.net'])
	})
})

describe('readRichMessage Phase 3', () => {
	it('parses GRID_IMAGE blocks', () => {
		const msg = new RichMessageBuilder().addGridImage(['https://cdn/a', 'https://cdn/b']).build()
		const parsed = readRichMessage(msg)
		expect(parsed?.blocks[0]).toEqual({ type: 'gridImage', urls: ['https://cdn/a', 'https://cdn/b'] })
	})

	it('parses CONTENT_ITEMS reels', () => {
		const msg = new RichMessageBuilder().addReels([{ url: 'https://v/1', caption: 'one' }]).build()
		const parsed = readRichMessage(msg)
		expect(parsed?.blocks[0]).toEqual({ type: 'reels', items: [{ url: 'https://v/1', caption: 'one' }] })
	})

	it('parses DYNAMIC video blocks', () => {
		const msg = new RichMessageBuilder().addVideo('https://v/g').build()
		const parsed = readRichMessage(msg)
		expect(parsed?.blocks[0]).toEqual({ type: 'video', url: 'https://v/g' })
	})

	it('decodes unifiedResponse v2 payloads', () => {
		const msg = new RichMessageBuilder().addText('t').setUnifiedResponse({ version: 2, html: '<b>x</b>' }).build()
		const parsed = readRichMessage(msg)
		expect(parsed?.unified?.html).toBe('<b>x</b>')
	})

	it('surfaces v2 sections as blocks even without submessages', () => {
		const parsed = readRichMessage(
			generateUnifiedContent({
				version: 2,
				sections: [
					{ type: 'text', text: 'hello' },
					{ type: 'code', code: 'x', language: 'js' }
				]
			})
		)

		expect(parsed?.blocks).toEqual([
			{ type: 'text', text: 'hello' },
			{ type: 'code', code: 'x', language: 'js' }
		])
		expect(parsed?.text).toBe('hello')
	})

	it('leaves unified undefined for non-JSON payloads', () => {
		const msg = new RichMessageBuilder()
			.addText('t')
			.setUnifiedResponse(new Uint8Array([1, 2, 3]))
			.build()
		const parsed = readRichMessage(msg)
		expect(parsed?.unifiedResponse).toEqual(new Uint8Array([1, 2, 3]))
		expect(parsed?.unified).toBeUndefined()
	})

	it('ignores JSON payloads without version 2', () => {
		const msg = new RichMessageBuilder().addText('t').setUnifiedResponse('{"version":1}').build()
		expect(readRichMessage(msg)?.unified).toBeUndefined()
	})
})

describe('assertSafeUrl (CVE-2026-23866 mitigation)', () => {
	it('accepts http and https urls', () => {
		expect(assertSafeUrl('https://example.com/a.png')).toBe('https://example.com/a.png')
		expect(assertSafeUrl('http://example.com')).toBe('http://example.com')
		expect(isSafeUrl('https://example.com/x?y=1#z')).toBe(true)
	})

	it('trims surrounding whitespace before returning', () => {
		expect(assertSafeUrl('  https://example.com  ')).toBe('https://example.com')
	})

	it('rejects javascript: urls', () => {
		expect(() => assertSafeUrl('javascript:alert(1)')).toThrow(/protokol tidak diizinkan/)
		expect(isSafeUrl('javascript:alert(1)')).toBe(false)
	})

	it('rejects data: urls', () => {
		expect(() => assertSafeUrl('data:text/html,<script>alert(1)</script>')).toThrow(/protokol tidak diizinkan/)
		expect(isSafeUrl('data:image/png;base64,AAAA')).toBe(false)
	})

	it('rejects file: urls', () => {
		expect(() => assertSafeUrl('file:///etc/passwd')).toThrow(/protokol tidak diizinkan/)
	})

	it('rejects protocol-relative and protocol-less urls', () => {
		expect(() => assertSafeUrl('//evil.com/x')).toThrow(/tidak valid atau tanpa protokol/)
		expect(() => assertSafeUrl('example.com/x')).toThrow(/tidak valid atau tanpa protokol/)
		expect(() => assertSafeUrl('/relative/path.png')).toThrow(/tidak valid atau tanpa protokol/)
	})

	it('rejects empty and non-string input', () => {
		expect(() => assertSafeUrl('')).toThrow(/kosong/)
		expect(() => assertSafeUrl('   ')).toThrow(/kosong/)
		expect(() => assertSafeUrl(undefined as unknown as string)).toThrow(/kosong/)
	})

	it('rejects urls with control characters or embedded whitespace', () => {
		expect(() => assertSafeUrl('java\nscript:alert(1)')).toThrow(/karakter kontrol/)
		expect(() => assertSafeUrl('https://exa mple.com')).toThrow(/karakter kontrol/)
		expect(() => assertSafeUrl('https://example.com/\u0000')).toThrow(/karakter kontrol/)
	})

	it('rejects other non-http schemes', () => {
		expect(() => assertSafeUrl('ftp://example.com/x')).toThrow(/protokol tidak diizinkan/)
		expect(() => assertSafeUrl('blob:https://example.com/uuid')).toThrow(/protokol tidak diizinkan/)
		expect(() => assertSafeUrl('vbscript:msgbox(1)')).toThrow(/protokol tidak diizinkan/)
	})
})

describe('builder URL validation wiring', () => {
	it('addImage rejects dangerous urls', () => {
		expect(() => new RichMessageBuilder().addImage('javascript:alert(1)', 'x')).toThrow(/protokol tidak diizinkan/)
	})

	it('addInlineImage rejects dangerous urls', () => {
		expect(() => new RichMessageBuilder().addInlineImage('data:text/html,x')).toThrow(/protokol tidak diizinkan/)
	})

	it('addGridImage rejects when any url is unsafe', () => {
		expect(() => new RichMessageBuilder().addGridImage(['https://ok', 'file:///etc/passwd'])).toThrow(
			/protokol tidak diizinkan/
		)
	})

	it('addReels rejects dangerous urls', () => {
		expect(() => new RichMessageBuilder().addReels([{ url: 'javascript:alert(1)' }])).toThrow(
			/protokol tidak diizinkan/
		)
	})

	it('addVideo rejects dangerous urls', () => {
		expect(() => new RichMessageBuilder().addVideo('data:video/mp4;base64,AAAA')).toThrow(/protokol tidak diizinkan/)
	})

	it('addLink rejects dangerous urls', () => {
		expect(() => new RichMessageBuilder().addLink('file:///etc/passwd', 'x')).toThrow(/protokol tidak diizinkan/)
	})

	it('ORich.addSource rejects dangerous urls', () => {
		expect(() => new ORich().addSource({ title: 'x', url: 'javascript:alert(1)' })).toThrow(/protokol tidak diizinkan/)
	})

	it('ORich.addSource validates thumbnail and favicon urls', () => {
		expect(() => new ORich().addSource({ title: 'x', url: 'https://ok', thumbnailUrl: 'data:text/html,x' })).toThrow(
			/protokol tidak diizinkan/
		)
		expect(() => new ORich().addSource({ title: 'x', url: 'https://ok', faviconUrl: 'javascript:alert(1)' })).toThrow(
			/protokol tidak diizinkan/
		)
	})

	it('ORich.addProduct rejects a dangerous product url', () => {
		expect(() => new ORich().addProduct({ title: 'x', url: 'javascript:alert(1)' })).toThrow(/protokol tidak diizinkan/)
	})

	it('ORich.addPost rejects a dangerous post url', () => {
		expect(() => new ORich().addPost({ title: 'x', url: 'javascript:alert(1)' })).toThrow(/protokol tidak diizinkan/)
	})

	it('ORich.addWidget rejects a dangerous widget url', () => {
		expect(() => new ORich().addWidget({ title: 'x', url: 'javascript:alert(1)' })).toThrow(/protokol tidak diizinkan/)
	})

	it('ORich.addFooterAction rejects a dangerous footer url', () => {
		expect(() => new ORich().addFooterAction({ label: 'x', url: 'javascript:alert(1)' })).toThrow(
			/protokol tidak diizinkan/
		)
	})
})

describe('LaTeX helpers (Phase 4)', () => {
	it('addLatexInlineImage emits latex + rendered image', () => {
		const msg = new RichMessageBuilder().addLatexInlineImage('a^2 + b^2').build()
		const subs = msg.richResponseMessage?.submessages ?? []

		expect(subs).toHaveLength(2)
		expect(subs[0]?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_LATEX)
		expect(subs[0]?.latexMetadata?.text).toBe('a^2 + b^2')
		expect(subs[1]?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_INLINE_IMAGE)
		expect(subs[1]?.imageMetadata?.imageUrl?.imageHighResUrl).toBe(buildLatexImageUrl('a^2 + b^2'))
	})

	it('addLatex only emits the expression (no image)', () => {
		const msg = new RichMessageBuilder().addLatex('x = 1').build()
		const subs = msg.richResponseMessage?.submessages ?? []
		expect(subs).toHaveLength(1)
		expect(subs[0]?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_LATEX)
	})

	it('sendLatex relays only the latex block', async () => {
		const { sock, calls } = makeMockSock()
		await sendLatex(sock, '6281234567890@s.whatsapp.net', 'E = mc^2')

		const subs = calls[0]!.content.richResponseMessage?.submessages ?? []
		expect(subs).toHaveLength(1)
		expect(subs[0]?.latexMetadata?.text).toBe('E = mc^2')
	})

	it('sendLatexInlineImage relays latex + image', async () => {
		const { sock, calls } = makeMockSock()
		await sendLatexInlineImage(sock, '6281234567890:1@s.whatsapp.net', 'y = mx + b', undefined, {})

		expect(calls[0]!.jid).toBe('6281234567890@s.whatsapp.net')
		const subs = calls[0]!.content.richResponseMessage?.submessages ?? []
		expect(subs).toHaveLength(2)
		expect(subs[1]?.imageMetadata?.imageUrl?.imageHighResUrl).toBe(buildLatexImageUrl('y = mx + b'))
	})

	it('sendLatexInlineImage injects quoted context', async () => {
		const { sock, calls } = makeMockSock()
		const quoted = { key: { id: 'Q', remoteJid: '628@s.whatsapp.net', fromMe: false } } as WAMessage
		await sendLatexInlineImage(sock, '6281234567890@s.whatsapp.net', 'z', quoted)

		expect(calls[0]!.content.richResponseMessage?.contextInfo?.stanzaId).toBe('Q')
	})
})

describe('captureUnifiedResponse', () => {
	it('returns "" when there is no unified payload', () => {
		expect(captureUnifiedResponse(new RichMessageBuilder().addText('x').build())).toBe('')
		expect(captureUnifiedResponse(new RichMessageBuilder())).toBe('')
	})

	it('serialises the unified payload from a message', () => {
		const msg = new RichMessageBuilder().addText('x').setUnifiedResponse({ version: 2, html: '<b>x</b>' }).build()

		expect(JSON.parse(captureUnifiedResponse(msg))).toEqual({ version: 2, html: '<b>x</b>' })
	})

	it('accepts a builder and unwraps botForwarded messages', () => {
		const builder = new RichMessageBuilder()
			.addText('x')
			.wrapInBotForwarded()
			.setUnifiedResponse({ version: 2, sections: [{ type: 'text', text: 'a' }] })

		expect(JSON.parse(captureUnifiedResponse(builder))).toEqual({
			version: 2,
			sections: [{ type: 'text', text: 'a' }]
		})
	})

	it('round-trips parsed unified payloads', () => {
		const builder = new ORich().addText('t').addTip('hint')
		const json = captureUnifiedResponse(builder)
		expect(JSON.parse(json).extras.tips[0].text).toBe('hint')
	})
})

describe('ORich.addSource overloads', () => {
	it('accepts (url, title)', () => {
		const msg = new ORich().addSource('https://example.com/src', 'Example').build()
		const sources = msg.messageContextInfo?.botMetadata?.richResponseSourcesMetadata?.sources
		expect(sources).toHaveLength(1)
		expect(sources?.[0]?.sourceTitle).toBe('Example')
		expect(sources?.[0]?.sourceProviderUrl).toBe('https://example.com/src')
	})

	it('still accepts an object list', () => {
		const msg = new ORich().addSource({ title: 'A', url: 'https://a' }, { title: 'B', url: 'https://b' }).build()
		expect(msg.messageContextInfo?.botMetadata?.richResponseSourcesMetadata?.sources).toHaveLength(2)
	})

	it('maps provider to the proto enum', () => {
		const msg = new ORich().addSource({ title: 'G', url: 'https://g', provider: 'GOOGLE' }).build()
		expect(msg.messageContextInfo?.botMetadata?.richResponseSourcesMetadata?.sources?.[0]?.provider).toBe(
			proto.BotSourcesMetadata.BotSourceItem.SourceProvider.GOOGLE
		)
	})
})
