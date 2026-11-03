// furina-baileys — voip.ts
// FONDASI VoIP (eksperimental).
//
// Implementasi panggilan penuh (WASM + WebRTC) TIDAK disertakan di sini: itu
// membutuhkan dependensi opsional `@roamhq/wrtc` dan worker threads. Modul ini
// hanya menyediakan tipe + helper ringan untuk mendeteksi dan menolak call.
//
// Lihat docs/voip.md untuk batasan dan rencana pengembangan.

import type { WACallEvent, WACallUpdateType } from '../Types/Call'
import type { BinaryNode } from '../WABinary/types'

export type { WACallEvent, WACallUpdateType }

/** Lifecycle phase a call goes through (mirrors the server's status values). */
export type CallPhase = WACallUpdateType

/** Incoming or ongoing call, as surfaced by the `call` socket event. */
export interface ActiveCall extends WACallEvent {
	/** peer JID the call belongs to (chat id, may be a group) */
	peerJid: string
}

/** A VoIP client is the abstraction a WASM/WebRTC implementation would fill. */
export interface VoipClient {
	/** whether a full media stack (WASM/WebRTC) is available */
	readonly available: boolean
	/** start an outgoing call (stub in this build) */
	startCall(peerJid: string, opts?: { video?: boolean }): Promise<never>
	/** reject an incoming call */
	rejectCall(call: Pick<ActiveCall, 'id' | 'from'> | { id: string; from: string }): Promise<void>
	/** tear down any local resources */
	dispose(): void
}

/** Normalises a raw `call` event into an `ActiveCall`. */
export const toActiveCall = (call: WACallEvent): ActiveCall => ({
	...call,
	peerJid: call.chatId || call.from
})

/** Filters call updates down to the phases a bot usually cares about. */
export const CALL_PHASES: readonly CallPhase[] = [
	'offer',
	'ringing',
	'accept',
	'reject',
	'timeout',
	'terminate'
] as const

export interface VoipSocketLike {
	rejectCall?: (callId: string, callFrom: string) => Promise<void>
	sendNode?: (node: BinaryNode) => Promise<void>
	query?: (node: BinaryNode, timeoutMs?: number) => Promise<unknown>
	user?: { id?: string } | null
}

const buildRejectStanza = (callId: string, callFrom: string, from: string): BinaryNode => ({
	tag: 'call',
	attrs: { from, to: callFrom },
	content: [
		{
			tag: 'reject',
			attrs: { 'call-id': callId, 'call-creator': callFrom, 'count': '0' }
		}
	]
})

/**
 * Rejects an incoming call. Prefers the socket's built-in `rejectCall`; when it
 * is not exposed, sends the equivalent `call`/`reject` stanza directly.
 */
export async function rejectCall(sock: VoipSocketLike, callId: string, callFrom: string): Promise<void> {
	if (typeof sock.rejectCall === 'function') {
		return sock.rejectCall(callId, callFrom)
	}

	const stanza = buildRejectStanza(callId, callFrom, sock.user?.id ?? '')

	if (typeof sock.query === 'function') {
		await sock.query(stanza, 15_000)
		return
	}

	if (typeof sock.sendNode === 'function') {
		await sock.sendNode(stanza)
		return
	}

	throw new Error('[furina-voip] socket tidak mendukung rejectCall/query/sendNode')
}

/** The stanza `rejectCall` would send (exported for testing/advanced use). */
export const buildRejectCallStanza = buildRejectStanza

/**
 * Creates a stub `VoipClient`. Media (WASM/WebRTC) is intentionally unavailable
 * in this build; `startCall` throws a descriptive error.
 */
export function createVoipClient(sock: VoipSocketLike): VoipClient {
	return {
		available: false,
		async startCall(): Promise<never> {
			throw new Error('[furina-voip] startCall tidak tersedia: implementasi WASM/WebRTC penuh membutuhkan @roamhq/wrtc')
		},
		async rejectCall(call: Pick<ActiveCall, 'id' | 'from'> | { id: string; from: string }): Promise<void> {
			await rejectCall(sock, call.id, call.from)
		},
		dispose() {
			// no local resources in the stub implementation
		}
	}
}
