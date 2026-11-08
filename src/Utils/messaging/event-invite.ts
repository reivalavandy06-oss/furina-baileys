// furina-baileys — event-invite.ts
// Event invites (WhatsApp group events).
//
// IMPORTANT — protocol reality check: this Wangelli proto bundle has no
// `eventInviteMessage` field. The event payload lives in `eventMessage`
// (`name`, `description`, `startTime`, `joinLink`, `location`, …), which is
// what the `event` content key in `generateWAMessageContent` already builds.
//
// `eventMessage` also has NO thumbnail field. `jpegThumbnail` is therefore
// carried on the `<meta>` node of the stanza (see `EVENT_INVITE_META`), which is
// mechanically valid but the exact attribute contract is NEEDS VERIFICATION
// against a live account.

import { proto } from '../../../WAProto/index.js'
import type { MessageRelayOptions, WAMessage } from '../../Types'
import { jidNormalizedUser } from '../../WABinary/jid-utils'
import type { FurinaSocket } from './types'

export interface EventInviteOptions {
	/** stable event identifier; defaults to the generated message id */
	eventId?: string
	eventTitle: string
	/** Date or unix seconds */
	startTime: Date | number
	description?: string
	/** jid of the group the event belongs to */
	groupJid?: string
	/** base64/hex thumbnail carried on the <meta> node (NEEDS VERIFICATION) */
	jpegThumbnail?: string | Buffer
	joinLink?: string
	location?: proto.Message.LocationMessage
	endTime?: Date | number
	extraGuestsAllowed?: boolean
	messageSecret?: Uint8Array
}

/** The `<meta>` marker attached to event-invite stanzas. */
export const EVENT_INVITE_META = { context_source: 'event_invitation' } as const

/** Normalises a Date | number into unix seconds. */
export const toUnixSeconds = (value: Date | number): number =>
	value instanceof Date ? Math.floor(value.getTime() / 1000) : Math.floor(value)

/**
 * Sends an event invite.
 *
 * `eventId` is used as the message id so the invite can be correlated later.
 */
export async function sendEventInvite(
	sock: FurinaSocket,
	jid: string,
	options: EventInviteOptions,
	sendOptions: MessageRelayOptions = {}
): Promise<WAMessage> {
	const normalizedJid = jidNormalizedUser(jid)
	if (!normalizedJid) {
		throw new Error(`Invalid JID: ${jid}`)
	}

	if (!options.eventTitle || options.eventTitle.trim().length === 0) {
		throw new Error('[furina-event] eventTitle wajib diisi')
	}

	const startTime = toUnixSeconds(options.startTime)
	if (!Number.isFinite(startTime) || startTime <= 0) {
		throw new Error('[furina-event] startTime tidak valid')
	}

	const eventMessage: proto.Message.IEventMessage = {
		name: options.eventTitle.trim(),
		description: options.description,
		startTime,
		endTime: options.endTime !== undefined ? toUnixSeconds(options.endTime) : undefined,
		joinLink: options.joinLink,
		location: options.location,
		extraGuestsAllowed: options.extraGuestsAllowed ?? undefined,
		isScheduleCall: false,
		isCanceled: false
	}

	const message: proto.IMessage = { eventMessage }

	if (options.messageSecret) {
		// `messageSecret` lives on messageContextInfo, matching the `event`
		// content path in generateWAMessageContent.
		message.messageContextInfo = { messageSecret: options.messageSecret }
	}

	// Thumbnail rides on the meta node; see the header note.
	const metaAttrs: Record<string, string> = { ...EVENT_INVITE_META }
	if (options.jpegThumbnail) {
		metaAttrs['jpeg_thumbnail'] = Buffer.isBuffer(options.jpegThumbnail)
			? options.jpegThumbnail.toString('base64')
			: options.jpegThumbnail
	}

	return sock.relayMessage(normalizedJid, message, {
		...sendOptions,
		...(options.eventId ? { messageId: options.eventId } : {}),
		additionalNodes: [...(sendOptions.additionalNodes ?? []), { tag: 'meta', attrs: metaAttrs, content: undefined }]
	})
}
