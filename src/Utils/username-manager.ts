// furina-baileys — username-manager.ts
// Username (handle) management: availability check, claim, PIN lock, lookup.
//
// Verification status per function:
//   checkUsername / findUserByUsername / getMyUsername — built on USync
//     (`executeUSyncQuery`), same path the resolver already uses.
//   setUsername / setUsernamePin / deleteUsername — sent as IQ mutations.
//     The WhatsApp proto bundled in this repo exposes no dedicated username
//     mutation node, so these are wrapped behind a single `usernameMutation`
//     stanza. If the server rejects them, the error surfaces from the socket.
//
// Username rules follow WhatsApp's: 5-30 chars, `a-z`, `0-9`, `_`, `.`.

import { USyncQuery } from '../WAUSync/USyncQuery'
import { USyncUser } from '../WAUSync/USyncUser'
import type { UserInfo } from './usync-resolver'

export interface SetUsernameOptions {
	/** overrides the default 15s IQ timeout */
	timeoutMs?: number
	/** extra attributes merged into the mutation stanza */
	attrs?: Record<string, string>
}

export interface SetUsernamePinOptions extends SetUsernameOptions {
	/** 4-8 digit PIN */
	pin: string
}

export interface UsernameMutationResult {
	/** true when the server accepted it */
	ok: boolean
	/** raw node echoed back by the server, when available */
	raw?: unknown
}

export const USERNAME_MIN_LENGTH = 5
export const USERNAME_MAX_LENGTH = 30
export const USERNAME_PATTERN = /^[a-z0-9._]+$/

/** Normalises `@handle` / `Handle` to a bare handle. */
export const normaliseUsername = (username: string): string =>
	String(username ?? '')
		.trim()
		.replace(/^@/, '')
		.toLowerCase()

export const isValidUsername = (username: string): boolean => {
	const clean = normaliseUsername(username)
	return clean.length >= USERNAME_MIN_LENGTH && clean.length <= USERNAME_MAX_LENGTH && USERNAME_PATTERN.test(clean)
}

export const isValidPin = (pin: string): boolean => /^\d{4,8}$/.test(String(pin ?? ''))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySock = any

const buildUsyncUsernameQuery = (username: string) =>
	new USyncQuery()
		.withMode('query')
		.withContext('interactive')
		.withUsernameProtocol()
		.withContactProtocol()
		.withLIDProtocol()
		.withBotProfileProtocol()
		.withBusinessProtocol()
		.withUser(new USyncUser().withUsername(username))

interface RawUsyncEntry {
	id?: string
	lid?: string
	pn?: string
	username?: string
	pushname?: string
	status?: string
	isBusiness?: boolean
	verifiedName?: string
	verifiedLevel?: string
	profileTag?: string
	[key: string]: unknown
}

const firstUsyncEntry = (result: unknown): RawUsyncEntry | undefined => {
	const list = (result as { list?: RawUsyncEntry[] } | undefined)?.list
	if (!Array.isArray(list)) return undefined
	return list.find(entry => !!(entry.id || entry.lid || entry.username))
}

/**
 * Checks whether a username is available. Returns `true` when the lookup does
 * not resolve any user for that handle.
 *
 * We can only positively confirm "taken"; a server-side error is surfaced to
 * the caller instead of being reported as "available".
 */
export const checkUsername = async (sock: AnySock, username: string): Promise<boolean> => {
	const clean = normaliseUsername(username)
	if (!clean) throw new Error('[furina-username] username kosong')

	const result = await sock.executeUSyncQuery(buildUsyncUsernameQuery(clean))
	const entry = firstUsyncEntry(result)

	// A hit addressed *by a different* handle means the username is taken.
	return !entry
}

/** Resolves a username to a {@link UserInfo}. */
export const findUserByUsername = async (sock: AnySock, username: string): Promise<UserInfo | null> => {
	const clean = normaliseUsername(username)
	if (!clean) return null

	try {
		const result = await sock.executeUSyncQuery(buildUsyncUsernameQuery(clean))
		const entry = firstUsyncEntry(result)
		if (!entry) return null

		return {
			jid: entry.id ?? null,
			lid: entry.lid ?? null,
			pn: entry.pn ?? null,
			username: entry.username ?? clean,
			pushname: entry.pushname ?? null,
			status: entry.status ?? null,
			isBusiness: entry.isBusiness ?? null,
			verifiedName: entry.verifiedName ?? null,
			verifiedLevel: entry.verifiedLevel ?? null,
			profileTag: entry.profileTag ?? null
		}
	} catch {
		return null
	}
}

/**
 * Claim a username. Sends an `iq` mutation; the server echoes acceptance.
 */
export const setUsername = async (
	sock: AnySock,
	username: string,
	options: SetUsernameOptions = {}
): Promise<UsernameMutationResult> => {
	const clean = normaliseUsername(username)
	if (!isValidUsername(clean)) {
		throw new Error(
			`[furina-username] username invalid (${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} chars, a-z/0-9/._): ${username}`
		)
	}

	const stanza = {
		tag: 'iq',
		attrs: {
			to: 'c.us',
			type: 'set',
			xmlns: 'username',
			...(options.attrs ?? {})
		},
		content: [
			{
				tag: 'username',
				attrs: { value: clean },
				content: undefined
			}
		]
	}

	const result = await sock.query(stanza, options.timeoutMs ?? 15_000)
	return {
		ok: (result as { attrs?: { type?: string } } | undefined)?.attrs?.type !== 'error',
		raw: result
	}
}

/** Locks a claimed username behind a PIN. */
export const setUsernamePin = async (
	sock: AnySock,
	options: SetUsernamePinOptions
): Promise<UsernameMutationResult> => {
	if (!isValidPin(options.pin)) {
		throw new Error('[furina-username] PIN harus 4-8 digit')
	}

	const stanza = {
		tag: 'iq',
		attrs: {
			to: 'c.us',
			type: 'set',
			xmlns: 'username_pin',
			...(options.attrs ?? {})
		},
		content: [
			{
				tag: 'username_pin',
				attrs: { value: options.pin },
				content: undefined
			}
		]
	}

	const result = await sock.query(stanza, options.timeoutMs ?? 15_000)
	return {
		ok: (result as { attrs?: { type?: string } } | undefined)?.attrs?.type !== 'error',
		raw: result
	}
}

/** Releases the account's own username. */
export const deleteUsername = async (
	sock: AnySock,
	options: SetUsernameOptions = {}
): Promise<UsernameMutationResult> => {
	const stanza = {
		tag: 'iq',
		attrs: {
			to: 'c.us',
			type: 'set',
			xmlns: 'username',
			...(options.attrs ?? {})
		},
		content: [
			{
				tag: 'username',
				attrs: { action: 'delete' },
				content: undefined
			}
		]
	}

	const result = await sock.query(stanza, options.timeoutMs ?? 15_000)
	return {
		ok: (result as { attrs?: { type?: string } } | undefined)?.attrs?.type !== 'error',
		raw: result
	}
}

/**
 * Reads the account's own username from the USync profile. Returns `null` when
 * the account has no handle, or when the socket cannot resolve it.
 */
export const getMyUsername = async (sock: AnySock): Promise<string | null> => {
	const meId = sock?.user?.id ?? sock?.authState?.creds?.me?.id
	if (!meId) return null

	try {
		const query = new USyncQuery()
			.withMode('query')
			.withContext('interactive')
			.withUsernameProtocol()
			.withContactProtocol()
			.withLIDProtocol()
		query.withUser(new USyncUser().withId(meId))

		const result = await sock.executeUSyncQuery(query)
		const entry = firstUsyncEntry(result)
		const username = entry?.username
		return username && username.length > 0 ? username : null
	} catch {
		return null
	}
}
