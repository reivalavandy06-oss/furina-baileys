// src/Socket/index.ts
// Furina-baileys socket factory.
// Merge user config → panggil makeCommunitiesSocket → attach stability layer.

import { DEFAULT_CONNECTION_CONFIG } from '../Defaults'
import type { SocketConfig } from '../Types'
import { StabilityManager } from '../Utils/stability'
import { makeCommunitiesSocket } from './communities'

export * from './chats'
export * from './groups'
export * from './messages-send'
export * from './messages-recv'
export * from './socket'
export * from './newsletter'
export * from './business'
export * from './mex'
export * from './communities'

// wrap the raw socket factory so user config gets merged with our defaults.
// without this, every makeWASocket call crashes on missing shouldSyncHistoryMessage
const makeWASocket = (config: Partial<SocketConfig>) => {
	const merged = {
		...DEFAULT_CONNECTION_CONFIG,
		...config // user config always wins
	} as SocketConfig

	const sock = makeCommunitiesSocket(merged)

	// ===== FURINA: STABILITY LAYER =====
	// Default ON. User opt-out dengan `stability: false`.
	// Config custom via `stability: { autoRecovery: false, maxRetries: 10 }`.
	//
	// Layer ini ngasih:
	//   - auto-pause reconnect setelah N error
	//   - exponential backoff delay
	//   - stats (sock.stability.getStats())
	//   - log terstruktur via FurinaLogger
	//
	// Catatan: TIDAK auto-reconnect sendiri. User tetap yang panggil
	// makeWASocket ulang berdasarkan `sock.stability.getStats()`.
	if (config.stability !== false) {
		const stabilityConfig = typeof config.stability === 'object' ? config.stability : {}
		;(sock as any).stability = new StabilityManager(sock, stabilityConfig)
	}

	return sock
}

export default makeWASocket
