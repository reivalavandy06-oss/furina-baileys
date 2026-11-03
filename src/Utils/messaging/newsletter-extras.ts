import { jidNormalizedUser } from '../../WABinary/jid-utils'

/** Minimal shape of the newsletter methods exposed on the socket. */
export interface NewsletterSocketLike {
	newsletterFollow?: (jid: string) => Promise<unknown>
	newsletterUnfollow?: (jid: string) => Promise<unknown>
	newsletterMetadata?: (type: 'invite' | 'jid', key: string) => Promise<unknown>
	newsletterDemote?: (jid: string, userJid: string) => Promise<unknown>
	newsletterAdminCount?: (jid: string) => Promise<number>
}

export interface BulkFollowOptions {
	/** delay between follows; defaults to 4s to stay under rate limits */
	delayMs?: number
	/** stop the batch on the first error instead of continuing */
	stopOnError?: boolean
	/** called after each successful follow */
	onProgress?: (jid: string, index: number) => void
	/** callback for failures (when stopOnError is false) */
	onError?: (jid: string, error: unknown, index: number) => void
	/** injectable sleep, for tests */
	sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export const DEFAULT_FOLLOW_DELAY_MS = 4000

export interface BulkFollowResult {
	followed: string[]
	failed: { jid: string; error: unknown }[]
}

/**
 * Follows several newsletters with a safe delay between requests to avoid
 * tripping anti-spam heuristics.
 */
export async function bulkFollowNewsletter(
	sock: NewsletterSocketLike,
	jids: string[],
	options: BulkFollowOptions = {}
): Promise<BulkFollowResult> {
	if (typeof sock.newsletterFollow !== 'function') {
		throw new Error('[furina-newsletter] socket tidak mendukung newsletterFollow')
	}

	const delayMs = options.delayMs ?? DEFAULT_FOLLOW_DELAY_MS
	const sleep = options.sleep ?? defaultSleep
	const followed: string[] = []
	const failed: BulkFollowResult['failed'] = []

	for (const [index, rawJid] of jids.entries()) {
		const jid = jidNormalizedUser(rawJid)
		if (!jid) {
			failed.push({ jid: rawJid, error: new Error('invalid jid') })
			continue
		}

		try {
			await sock.newsletterFollow(jid)
			followed.push(jid)
			options.onProgress?.(jid, index)
		} catch (error) {
			failed.push({ jid, error })
			options.onError?.(jid, error, index)
			if (options.stopOnError) break
		}

		if (index < jids.length - 1) {
			await sleep(delayMs)
		}
	}

	return { followed, failed }
}

export interface NewsletterAdminRole {
	jid: string
	role: 'ADMIN' | 'OWNER'
}

/**
 * Newsletter admin utilities.
 *
 * WhatsApp exposes `newsletterDemote` (verified in the proto/Mex paths) but has
 * no `promote` endpoint in this build — `promoteAdmin` therefore throws with a
 * clear "unsupported" message rather than silently failing.
 */
export function newsletterAdminUtils(sock: NewsletterSocketLike) {
	return {
		/** Admin list is derived from newsletter metadata; empty if unknown. */
		async getAdminList(jid: string): Promise<NewsletterAdminRole[]> {
			if (typeof sock.newsletterMetadata !== 'function') {
				throw new Error('[furina-newsletter] socket tidak mendukung newsletterMetadata')
			}

			const metadata = (await sock.newsletterMetadata('jid', jid)) as
				{ admins?: { jid: string; role?: 'ADMIN' | 'OWNER' }[] } | undefined

			return (metadata?.admins ?? []).map(admin => ({
				jid: admin.jid,
				role: admin.role ?? 'ADMIN'
			}))
		},

		async promoteAdmin(_jid: string, _userJid: string): Promise<never> {
			throw new Error('[furina-newsletter] promoteAdmin unsupported: this WhatsApp proto exposes no promote endpoint')
		},

		async demoteAdmin(jid: string, userJid: string): Promise<unknown> {
			if (typeof sock.newsletterDemote !== 'function') {
				throw new Error('[furina-newsletter] socket tidak mendukung newsletterDemote')
			}

			return sock.newsletterDemote(jidNormalizedUser(jid), jidNormalizedUser(userJid))
		}
	}
}
