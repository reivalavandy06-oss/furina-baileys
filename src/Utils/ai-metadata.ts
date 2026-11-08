// furina-baileys — ai-metadata.ts
// Shared injection of the AI marker (`botMetadata`) onto an outgoing message.
//
// `sendMessage` reaches this through `generateWAMessageFromContent`, while
// `relayMessage` bypasses that path entirely — so both entry points call this
// helper to keep the `{ ai: true }` semantics identical.

import { proto } from '../../WAProto/index.js'
import { generateMessageIDV2 } from './generics'

/**
 * Stamps `messageContextInfo.botMetadata` onto a message in place.
 *
 * @param message  the outgoing proto message (mutated)
 * @param responseId  stable id for the response; generated when omitted
 */
export const applyAiMetadata = (message: proto.IMessage, responseId?: string): void => {
	if (!message) return

	const existing = message.messageContextInfo ?? {}
	const existingBot = existing.botMetadata ?? {}

	message.messageContextInfo = {
		...existing,
		botMetadata: {
			...existingBot,
			botResponseId: responseId && responseId.length > 0 ? responseId : generateMessageIDV2(),
			botModeSelectionMetadata: {
				...existingBot.botModeSelectionMetadata,
				mode: [proto.BotModeSelectionMetadata.BotUserSelectionMode.REASONING_MODE]
			}
		}
	}
}
