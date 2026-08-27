
import { DEFAULT_CONNECTION_CONFIG } from '../Defaults'
import type { SocketConfig } from '../Types'
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

	return makeCommunitiesSocket(merged)
}

export default makeWASocket