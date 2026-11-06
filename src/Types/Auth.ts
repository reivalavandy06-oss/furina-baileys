import type { proto } from '../../WAProto/index.js'
import type { Contact } from './Contact'
import type { MinimalMessage } from './Message'

export type KeyPair = { public: Uint8Array; private: Uint8Array }
export type SignedKeyPair = {
	keyPair: KeyPair
	signature: Uint8Array
	keyId: number
	timestampS?: number
}

export type ProtocolAddress = {
	name: string // jid
	deviceId: number
}
export type SignalIdentity = {
	identifier: ProtocolAddress
	identifierKey: Uint8Array
}

export type LIDMapping = {
	pn: string
	lid: string
}

export type LTHashState = {
	version: number
	hash: Buffer
	indexValueMap: {
		[indexMacBase64: string]: { valueMac: Uint8Array | Buffer }
	}
}

export type SignalCreds = {
	readonly signedIdentityKey: KeyPair
	readonly signedPreKey: SignedKeyPair
	readonly registrationId: number
}

export type AccountSettings = {
	/** unarchive chats when a new message is received */
	unarchiveChats: boolean
	/** the default mode to start new conversations with */
	defaultDisappearingMode?: Pick<proto.IConversation, 'ephemeralExpiration' | 'ephemeralSettingTimestamp'>
}

export type AuthenticationCreds = SignalCreds & {
	readonly noiseKey: KeyPair
	readonly pairingEphemeralKeyPair: KeyPair
	advSecretKey: string

	me?: Contact
	account?: proto.IADVSignedDeviceIdentity
	signalIdentities?: SignalIdentity[]
	myAppStateKeyId?: string
	firstUnuploadedPreKeyId: number
	nextPreKeyId: number

	lastAccountSyncTimestamp?: number
	platform?: string

	processedHistoryMessages: MinimalMessage[]
	/** number of times history & app state has been synced */
	accountSyncCounter: number
	accountSettings: AccountSettings
	registered: boolean
	pairingCode: string | undefined
	lastPropHash: string | undefined
	routingInfo: Buffer | undefined
	additionalData?: any | undefined
}

export type SignalDataTypeMap = {
	'pre-key': KeyPair
	session: Uint8Array
	'sender-key': Uint8Array
	'sender-key-memory': { [jid: string]: boolean }
	'app-state-sync-key': proto.Message.IAppStateSyncKeyData
	'app-state-sync-version': LTHashState
	'lid-mapping': string
	'device-list': string[]
	tctoken: { token: Buffer; timestamp?: string; senderTimestamp?: number }
	'identity-key': Uint8Array
}

export type SignalDataSet = { [T in keyof SignalDataTypeMap]?: { [id: string]: SignalDataTypeMap[T] | null } }

type Awaitable<T> = T | Promise<T>

export type SignalKeyStore = {
	get<T extends keyof SignalDataTypeMap>(type: T, ids: string[]): Awaitable<{ [id: string]: SignalDataTypeMap[T] }>
	set(data: SignalDataSet): Awaitable<void>
	/** clear all the data in the store */
	clear?(): Awaitable<void>
}

export type SignalKeyStoreWithTransaction = SignalKeyStore & {
	isInTransaction: () => boolean
	transaction<T>(exec: () => Promise<T>, key: string): Promise<T>
}

export type TransactionCapabilityOptions = {
	maxCommitRetries: number
	delayBetweenTriesMs: number
}

export type SignalAuthState = {
	creds: SignalCreds
	keys: SignalKeyStore | SignalKeyStoreWithTransaction
}

export type AuthenticationState = {
	creds: AuthenticationCreds
	keys: SignalKeyStore
}

/**
 * Persistence contract for auth state. Backends (file, SQLite, MongoDB, Redis)
 * implement this so `useXAuthState` can return the same shape regardless of the
 * storage underneath.
 */
export interface AuthStore {
	readonly backend: string

	/** Read a raw record. Resolves `null` when the key does not exist. */
	get(key: string): Promise<string | null>

	/** Read many records at once. Missing keys are omitted from the result. */
	getMany(keys: string[]): Promise<Record<string, string>>

	/** Write a single record. */
	set(key: string, value: string): Promise<void>

	/** Write many records at once. */
	setMany(entries: Record<string, string>): Promise<void>

	/** Delete a single record. Returns `true` when something was removed. */
	remove(key: string): Promise<boolean>

	/** List all keys known to the store. */
	keys(): Promise<string[]>

	/** Remove every record in the store. */
	clear?(): Promise<void>

	/** Flush/close any open handle. */
	close?(): Promise<void>
}

/** How an auth backend is instantiated (used by `useXAuthState`). */
export interface AuthStateOptions {
	/** folder/path passed to the backend */
	path?: string
	/** connection string, for networked backends */
	url?: string
	/** database/collection name, for networked backends */
	database?: string
	/** table name, for SQLite */
	table?: string
	/** additional backend-specific options */
	[key: string]: unknown
}

/** Records an auth backend must persist, mirroring the file layout. */
export const AUTH_STORE_KEYS = {
	CREDS: 'creds.json'
} as const
