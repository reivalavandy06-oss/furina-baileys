import { proto } from '../../../../WAProto'
import {
	RichMessageBuilder,
	buildLatexImageUrl,
	readRichMessage,
	sendCodeBlock,
	sendLatexImage,
	sendList,
	sendMarkdown,
	sendRichMessage,
	sendTable
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
		builder.addTable(['Name', 'Age'], [['Alice', '30'], ['Bob', '25']])
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
						messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_GRID_IMAGE,
						gridImageMetadata: { imageUrls: [] }
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
