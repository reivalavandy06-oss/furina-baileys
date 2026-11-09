// furina-baileys — integrations/types.ts
// Shared types for optional donation WebSocket integrations.

/** Minimal socket surface the donation listeners need. */
export interface IntegrationSocket {
	sendMessage: (jid: string, content: unknown, options?: Record<string, unknown>) => Promise<unknown>
}

/** Handle returned by every `listen*Donations` helper. */
export interface DonationListener {
	/** Disconnect the WebSocket and remove listeners. Idempotent. */
	close: () => Promise<void>
	/** Whether the underlying client is still connected (best effort). */
	isConnected: () => boolean
}

/** A donation can be delivered to one target or many. */
export type MultiTarget = string | string[]

/** Normalises `string | string[]` into a de-duplicated, non-empty JID list. */
export const normalizeTargetJids = (targetJid: MultiTarget): string[] => {
	const list = Array.isArray(targetJid) ? targetJid : [targetJid]
	const seen = new Set<string>()

	for (const raw of list) {
		const jid = String(raw ?? '').trim()
		if (jid.length > 0) seen.add(jid)
	}

	return [...seen]
}

/**
 * Sends the same content to every target JID, sequentially so a failing target
 * does not abort the rest. Returns the per-target outcomes.
 */
export const sendToTargets = async (
	sock: IntegrationSocket,
	jids: string[],
	content: unknown,
	options?: Record<string, unknown>
): Promise<{ jid: string; ok: boolean; error?: unknown }[]> => {
	const results: { jid: string; ok: boolean; error?: unknown }[] = []

	for (const jid of jids) {
		try {
			await sock.sendMessage(jid, content, options)
			results.push({ jid, ok: true })
		} catch (error) {
			results.push({ jid, ok: false, error })
		}
	}

	return results
}

/** Context passed to the optional `onDonation` hook. */
export interface DonationContext<TDonation> {
	sock: IntegrationSocket
	donation: TDonation
	targetJids: string[]
	/** Send arbitrary content to every target JID. */
	sendMessage: (content: unknown, options?: Record<string, unknown>) => Promise<unknown[]>
}

/** Marks a listener as "optional dependency not installed" for a friendlier error. */
export const missingPeerError = (pkg: string): Error =>
	new Error(`[furina-integrations] peer dependency "${pkg}" belum terpasang. Jalankan: npm install ${pkg}`)

/** Loads a module from a variable specifier so TS never hard-requires it. */
export const loadOptionalModule = async (specifier: string): Promise<Record<string, unknown>> => {
	try {
		return (await import(/* webpackIgnore: true */ specifier)) as Record<string, unknown>
	} catch {
		throw missingPeerError(specifier)
	}
}

/**
 * Test seam: lets unit tests inject a fake module without installing the peer
 * dependency. Not part of the public API.
 */
export type ModuleLoader = (specifier: string) => Promise<Record<string, unknown>>

let moduleLoader: ModuleLoader = loadOptionalModule

export const __setIntegrationModuleLoader = (loader: ModuleLoader | null): void => {
	moduleLoader = loader ?? loadOptionalModule
}

export const getIntegrationModule = async (specifier: string): Promise<Record<string, unknown>> => {
	try {
		return await moduleLoader(specifier)
	} catch {
		// Normalise any loader failure into the actionable install hint, so tests
		// and real runs behave identically.
		throw missingPeerError(specifier)
	}
}
