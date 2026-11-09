// furina-baileys — integrations/trakteer.ts
// Optional Trakteer donation listener (WebSocket).
//
// Peer dependency: `trakteerjs` (OPTIONAL — install it yourself).
// Real API (verified against trakteerjs@2.3.x):
//   import { streamAPI } from 'trakteerjs'
//   new streamAPI(pageID, streamKey, hash, proxy?, userAgent?, testMode?)
//   client.on('donation', (donation) => {})
//
// Trakteer requires a page ID, a `trstream-…` stream key and a hash; `channelId`
// in the options maps to the page ID.

import { getIntegrationModule, missingPeerError } from './types'
import type { DonationContext, DonationListener, IntegrationSocket, MultiTarget } from './types'
import { normalizeTargetJids, sendToTargets } from './types'

const TRAKTEER_PKG = 'trakteerjs'

/** Shape of a `donation` event payload (subset we render). */
export interface TrakteerDonation {
	tip_id?: string
	id?: string
	created_at?: string
	creator_name?: string
	supporter_name?: string
	supporter_message?: string | null
	supporter_avatar?: string
	price?: string
	price_number?: number
	quantity?: string
	unit?: string
	type?: string
	[key: string]: unknown
}

export interface ListenTrakteerOptions {
	/** Trakteer page ID (from Manage → My Page → Settings). Historically `channelId`. */
	channelId: string
	/** `trstream-…` stream key (Manage → Stream Settings). */
	streamKey: string
	/** Hash from the "new tip" stream-settings URL. */
	hash: string
	/** one JID or an array (group / newsletter / personal chat). */
	targetJid: MultiTarget
	/** Custom handler. When omitted a default text message is broadcast. */
	onDonation?: (donation: TrakteerDonation, ctx: DonationContext<TrakteerDonation>) => unknown
	/** Optional HTTP proxy for the websocket. */
	proxy?: string
	/** Optional User-Agent override. */
	userAgent?: string
	/** Trakteer test mode. */
	testMode?: boolean
	/** Builds the default text message. */
	formatMessage?: (donation: TrakteerDonation) => unknown
	/** Pino-style logger. */
	logger?: {
		info?: (...args: unknown[]) => void
		warn?: (...args: unknown[]) => void
		error?: (...args: unknown[]) => void
		debug?: (...args: unknown[]) => void
	}
}

/** Default donation text. */
export const formatTrakteerDonation = (donation: TrakteerDonation): { text: string } => {
	const name = donation.supporter_name ?? 'Seseorang'
	const amount = donation.price ?? (donation.price_number ? `Rp ${donation.price_number}` : 'donasi')
	const message = donation.supporter_message ? `\n"${donation.supporter_message}"` : ''

	return { text: `🎁 Donasi Trakteer dari ${name}: ${amount}${message}` }
}

type EventEmitterLike = {
	on: (event: string, listener: (...args: never[]) => unknown) => unknown
	removeAllListeners?: () => unknown
	autoReconnect?: boolean
	client?: { removeAllListeners?: () => unknown; terminate?: () => unknown; close?: () => unknown }
}

type StreamAPIClass = new (
	pageID: string,
	streamKey: string,
	hash: string,
	proxy?: string,
	userAgent?: string,
	testMode?: boolean
) => EventEmitterLike

/**
 * Connects to Trakteer's donation stream and forwards each donation to every
 * target JID.
 *
 * @returns a {@link DonationListener} whose `close()` disconnects the socket.
 */
export async function listenTrakteerDonations(
	sock: IntegrationSocket,
	options: ListenTrakteerOptions
): Promise<DonationListener> {
	const { channelId, streamKey, hash, targetJid, onDonation, formatMessage, logger } = options

	if (!channelId) throw new Error('[furina-integrations] channelId (Trakteer page ID) wajib diisi')
	if (!streamKey) throw new Error('[furina-integrations] streamKey wajib diisi (trstream-…)')
	if (!hash) throw new Error('[furina-integrations] hash wajib diisi')

	const jids = normalizeTargetJids(targetJid)
	if (jids.length === 0) throw new Error('[furina-integrations] targetJid tidak boleh kosong')

	const mod = await getIntegrationModule(TRAKTEER_PKG)
	const StreamAPI = (mod['streamAPI'] ?? (mod['default'] as Record<string, unknown> | undefined)?.['streamAPI']) as
		StreamAPIClass | undefined

	if (typeof StreamAPI !== 'function') {
		throw missingPeerError(TRAKTEER_PKG)
	}

	const client = new StreamAPI(channelId, streamKey, hash, options.proxy, options.userAgent, options.testMode)
	let closed = false

	const handler = async (donation: TrakteerDonation) => {
		if (closed) return

		const ctx: DonationContext<TrakteerDonation> = {
			sock,
			donation,
			targetJids: jids,
			sendMessage: async (content, sendOptions) => {
				const results = await sendToTargets(sock, jids, content, sendOptions)
				return results
			}
		}

		try {
			if (onDonation) {
				const returned = await onDonation(donation, ctx)
				// If the hook returns content, broadcast it; `undefined` means handled.
				if (returned !== undefined) {
					await sendToTargets(sock, jids, returned)
				}
				return
			}

			const content = (formatMessage ?? formatTrakteerDonation)(donation)
			await sendToTargets(sock, jids, content)
		} catch (error) {
			logger?.error?.({ error, donation }, 'trakteer donation handler failed')
		}
	}

	client.on('donation', handler)
	logger?.info?.({ targets: jids.length }, 'trakteer listener connected')

	return {
		close: async () => {
			if (closed) return
			closed = true
			try {
				if (client.autoReconnect !== undefined) client.autoReconnect = false
				client.removeAllListeners?.()
				client.client?.removeAllListeners?.()
				if (typeof client.client?.terminate === 'function') client.client.terminate()
				else if (typeof client.client?.close === 'function') client.client.close()
			} catch (error) {
				logger?.warn?.({ error }, 'trakteer close failed')
			}
		},
		isConnected: () => !closed
	}
}
