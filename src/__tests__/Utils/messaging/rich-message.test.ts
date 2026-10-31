import { proto } from '../../../../WAProto'
import { RichMessageBuilder } from '../../../Utils/messaging/rich-message'

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
		const sub = msg.richResponseMessage?.submessages?.[0]
		expect(sub).toBeDefined()
		expect(sub!.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT)
		expect(sub!.messageText).toBe('Hello world')
	})

	it('should add code block correctly', () => {
		const builder = new RichMessageBuilder()
		builder.addCodeBlock('console.log("test")', 'javascript')
		const msg = builder.build()

		expect(msg.richResponseMessage?.submessages).toHaveLength(1)
		const sub = msg.richResponseMessage?.submessages?.[0]
		expect(sub?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_CODE)
		expect(sub?.codeMetadata?.codeLanguage).toBe('javascript')
		expect(sub?.codeMetadata?.codeBlocks).toHaveLength(1)
		expect(sub?.codeMetadata?.codeBlocks?.[0]?.codeContent).toBe('console.log("test")')
	})

	it('should add table with headers correctly', () => {
		const builder = new RichMessageBuilder()
		builder.addTable(['Name', 'Age'], [['Alice', '30'], ['Bob', '25']])
		const msg = builder.build()

		expect(msg.richResponseMessage?.submessages).toHaveLength(1)
		const sub = msg.richResponseMessage?.submessages?.[0]
		expect(sub?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TABLE)
		expect(sub?.tableMetadata?.rows).toHaveLength(3)
		expect(sub?.tableMetadata?.rows?.[0]?.items).toEqual(['Name', 'Age'])
		expect(sub?.tableMetadata?.rows?.[0]?.isHeading).toBe(true)
		expect(sub?.tableMetadata?.rows?.[1]?.items).toEqual(['Alice', '30'])
		expect(sub?.tableMetadata?.rows?.[1]?.isHeading).toBe(false)
	})

	it('should add list correctly', () => {
		const builder = new RichMessageBuilder()
		builder.addList(['Item 1', 'Item 2', 'Item 3'])
		const msg = builder.build()

		expect(msg.richResponseMessage?.submessages).toHaveLength(1)
		const sub = msg.richResponseMessage?.submessages?.[0]
		expect(sub?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT)
		expect(sub?.messageText).toContain('• Item 1')
		expect(sub?.messageText).toContain('• Item 2')
		expect(sub?.messageText).toContain('• Item 3')
	})

	it('should chain multiple blocks', () => {
		const builder = new RichMessageBuilder()
		builder
			.addText('Introduction')
			.addCodeBlock('const x = 1', 'javascript')
			.addList(['Point 1', 'Point 2'])

		const msg = builder.build()
		expect(msg.richResponseMessage?.submessages).toHaveLength(3)
		expect(msg.richResponseMessage?.submessages?.[0]?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT)
		expect(msg.richResponseMessage?.submessages?.[1]?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_CODE)
		expect(msg.richResponseMessage?.submessages?.[2]?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT)
	})

	it('should handle empty table rows', () => {
		const builder = new RichMessageBuilder()
		builder.addTable(['Header'], [])
		const msg = builder.build()

		expect(msg.richResponseMessage?.submessages).toHaveLength(1)
		const sub = msg.richResponseMessage?.submessages?.[0]
		expect(sub?.tableMetadata?.rows).toHaveLength(1)
		expect(sub?.tableMetadata?.rows?.[0]?.isHeading).toBe(true)
	})

	it('should handle table without headers', () => {
		const builder = new RichMessageBuilder()
		builder.addTable([], [['Cell 1', 'Cell 2']])
		const msg = builder.build()

		expect(msg.richResponseMessage?.submessages).toHaveLength(1)
		const sub = msg.richResponseMessage?.submessages?.[0]
		expect(sub?.tableMetadata?.rows).toHaveLength(1)
		expect(sub?.tableMetadata?.rows?.[0]?.items).toEqual(['Cell 1', 'Cell 2'])
		expect(sub?.tableMetadata?.rows?.[0]?.isHeading).toBe(false)
	})

	it('should handle empty list', () => {
		const builder = new RichMessageBuilder()
		builder.addList([])
		const msg = builder.build()

		expect(msg.richResponseMessage?.submessages).toHaveLength(1)
		const sub = msg.richResponseMessage?.submessages?.[0]
		expect(sub?.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT)
		expect(sub?.messageText).toBe('')
	})
})
