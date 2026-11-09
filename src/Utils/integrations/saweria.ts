// furina-baileys — integrations/saweria.ts
// Optional Saweria donation listener (WebSocket).
//
// Peer dependency: `saweria` (OPTIONAL — install it yourself).
// IMPORTANT: this requires saweria v2. saweria@1.x is an HTTP-only wrapper with
// no WebSocket / donation events, so `^1.0.0` cannot power a live listener.
//
// Real API (verified against saweria@2.x):
//   const { Client } = require('saweria')
//   const client = new Client()
//   await client.setStreamKey(streamKey)   // connects the websocket
//   client.on('donations', (donations) => {})
//   client.on('donation', (donation) => {})

import { getIntegrationModule, missingPeerError } from './types'
import type { DonationContext, DonationListener, IntegrationSocket, MultiTarget } from './types'
import { normalizeTargetJids, sendToTargets } from './types'

const SAWERIA_PKG = 'saweria'

/** Shape of a Saweria emitted donation (subset we render). */
export interface SaweriaDonation {
	amount?: number
	donator?: string
	message?: string
	type?: string
	media?: { src?: string[]; tag?: string }
	[key: string]: unknown
}

export type SaweriaEmitted = SaweriaDonation | { media?: { src?: string[]; tag?: string } }

export interface ListenSaweriaOptions {
	/** Saweria stream key (Dashboard → Stream Key / donasi). */
	streamKey: string
	/** one JID or an array (group / newsletter / personal chat). */
	targetJid: MultiTarget
	/** Custom handler. When omitted a default text message is broadcast. */
	onDonation?: (donation: SaweriaDonation, ctx: DonationContext<SaweriaDonation>) => unknown
	/** Builds the default text message. */
	formatMessage?: (donation: SaweriaDonation) => unknown
	/** Pino-style logger. */
	logger?: {
		info?: (...args: unknown[]) => void
		warn?: (...args: unknown[]) => void
		error?: (...args: unknown[]) => void
		debug?: (...args: unknown[]) => void
	}
}

/** Default donation text. */
export const formatSaweriaDonation = (donation: SaweriaDonation): { text: string } => {
	const name = donation.donator ?? 'Seseorang'
	const amount = typeof donation.amount === 'number' ? `Rp ${donation.amount.toLocaleString('id-ID')}` : 'donasi'
	const message = donation.message ? `\n"${donation.message}"` : ''

	return { text: `💸 Donasi Saweria dari ${name}: ${amount}${message}` }
}

type SaweriaClientLike = {
	on: (event: string, listener: (...args: never[]) => unknown) => unknown
	setStreamKey: (streamKey: string) => unknown
	removeAllListeners?: () => unknown
	webSocket?: { close?: () => unknown; terminate?: () => unknown; removeAllListeners?: () => unknown }
}

type SaweriaClientClass = new () => SaweriaClientLike

/**
 * Connects to Saweria's donation stream and forwards each donation to every
 * target JID.
 *
 * @returns a {@link DonationListener} whose `close()` disconnects the socket.
 */
export async function listenSaweriaDonations(
	sock: IntegrationSocket,
	options: ListenSaweriaOptions
): Promise<DonationListener> {
	const { streamKey, targetJid, onDonation, formatMessage, logger } = options

	if (!streamKey) throw new Error('[furina-integrations] streamKey wajib diisi')

	const jids = normalizeTargetJids(targetJid)
	if (jids.length === 0) throw new Error('[furina-integrations] targetJid tidak boleh kosong')

	const mod = await getIntegrationModule(SAWERIA_PKG)
	const Client = (mod['Client'] ?? mod['default']) as SaweriaClientClass | undefined

	if (typeof Client !== 'function') {
		throw missingPeerError(SAWERIA_PKG)
	}

	const client = new Client()
	await client.setStreamKey(streamKey)
	let closed = false

	const handler = async (payload: SaweriaEmitted | SaweriaEmitted[]) => {
		if (closed) return

		// The `donations` event emits an array; `donation` emits a single item.
		const raw: SaweriaEmitted[] = Array.isArray(payload) ? payload : [payload]
		const items: SaweriaDonation[] = raw.filter(Boolean)

		for (const donation of items) {
			const ctx: DonationContext<SaweriaDonation> = {
				sock,
				donation,
				targetJids: jids,
				sendMessage: async (content, sendOptions) => {
					return await sendToTargets(sock, jids, content, sendOptions)
				}
			}

			try {
				if (onDonation) {
					const returned = await onDonation(donation, ctx)
					if (returned !== undefined) {
						await sendToTargets(sock, jids, returned)
					}
					continue
				}

				const content = (formatMessage ?? formatSaweriaDonation)(donation)
				await sendToTargets(sock, jids, content)
			} catch (error) {
				logger?.error?.({ error, donation }, 'saweria donation handler failed')
			}
		}
	}

	client.on('donations', handler)
	client.on('donation', handler)
	logger?.info?.({ targets: jids.length }, 'saweria listener connected')

	return {
		close: async () => {
			if (closed) return
			closed = true
			try {
				client.removeAllListeners?.()
				client.webSocket?.removeAllListeners?.()
				if (typeof client.webSocket?.close === 'function') client.webSocket.close()
				else if (typeof client.webSocket?.terminate === 'function') client.webSocket.terminate()
			} catch (error) {
				logger?.warn?.({ error }, 'saweria close failed')
			}
		},
		isConnected: () => !closed
	}
}
