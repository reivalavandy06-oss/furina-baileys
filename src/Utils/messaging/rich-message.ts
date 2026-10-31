import { proto } from '../../../WAProto/index.js'
import type { WAMessage, MessageRelayOptions } from '../../Types'
import { jidNormalizedUser } from '../../WABinary/jid-utils'
import type { FurinaSocket } from './types'

export interface RichMessageOptions {
	text?: string
	footer?: string
}

interface RichContentBlock {
	type: 'text' | 'code' | 'table' | 'list'
	data: Record<string, unknown>
}

export class RichMessageBuilder {
	private blocks: RichContentBlock[] = []

	addText(text: string): this {
		this.blocks.push({
			type: 'text',
			data: { text }
		})
		return this
	}

	addCodeBlock(code: string, language: string): this {
		this.blocks.push({
			type: 'code',
			data: { code, language }
		})
		return this
	}

	addTable(headers: string[], rows: string[][]): this {
		this.blocks.push({
			type: 'table',
			data: { headers, rows }
		})
		return this
	}

	addList(items: string[]): this {
		const formattedList = items.map((item) => `• ${item}`).join('\n')
		this.blocks.push({
			type: 'list',
			data: { text: formattedList }
		})
		return this
	}

	build(): proto.IMessage {
		const submessages: proto.IAIRichResponseSubMessage[] = []

		for (const block of this.blocks) {
			if (block.type === 'text' || block.type === 'list') {
				const text = block.data.text as string
				submessages.push({
					messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT,
					messageText: text
				})
			} else if (block.type === 'code') {
				const code = block.data.code as string
				const language = block.data.language as string
				submessages.push({
					messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_CODE,
					codeMetadata: {
						codeLanguage: language,
						codeBlocks: [
							{
								codeContent: code
							}
						]
					}
				})
			} else if (block.type === 'table') {
				const headers = block.data.headers as string[]
				const rows = block.data.rows as string[][]

				const tableRows: proto.AIRichResponseTableMetadata.IAIRichResponseTableRow[] = []

				if (headers.length > 0) {
					tableRows.push({
						items: headers,
						isHeading: true
					})
				}

				for (const row of rows) {
					tableRows.push({
						items: row,
						isHeading: false
					})
				}

				submessages.push({
					messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TABLE,
					tableMetadata: {
						rows: tableRows
					}
				})
			}
		}

		const richResponse: proto.IAIRichResponseMessage = {
			messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
			submessages
		}

		return {
			richResponseMessage: richResponse
		}
	}
}

export async function sendRichMessage(
	sock: FurinaSocket,
	jid: string,
	builder: RichMessageBuilder,
	options: MessageRelayOptions = {}
): Promise<WAMessage> {
	const normalizedJid = jidNormalizedUser(jid)
	if (!normalizedJid) {
		throw new Error(`Invalid JID: ${jid}`)
	}

	const content = builder.build()
	return sock.relayMessage(normalizedJid, content, options)
}
