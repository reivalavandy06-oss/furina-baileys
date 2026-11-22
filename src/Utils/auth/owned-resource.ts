/// <reference lib="es2021.promise" />
import type { AuthenticationState, SignalKeyStore } from '../../Types'

export interface AuthenticationStateResult {
	state: AuthenticationState
	saveCreds: () => Promise<void>
}

export interface ManagedAuthenticationState extends AuthenticationStateResult {
	close: () => Promise<void>
}

/** Associates the legacy wrapper object with its internal lifecycle without
 * adding enumerable fields that existing consumers compare by key. */
const closeHandles = new WeakMap<AuthenticationStateResult, () => Promise<void>>()

/**
 * Closes an internally owned resource associated with a wrapper returned by
 * `useSQLiteAuthState`, `useRedisAuthState`, or `useMongoDBAuthState`.
 * Borrowed wrappers have no owned resource and are rejected.
 */
export const closeAuthState = (auth: AuthenticationStateResult): Promise<void> => {
	const close = closeHandles.get(auth)
	if (!close) {
		return Promise.reject(new Error('Authentication state does not own a closable resource'))
	}

	return close()
}

/** Preserves the historical `{ state, saveCreds }` runtime shape and return
 * type while keeping the managed lifecycle reachable through `closeAuthState`. */
export const exposeLegacyAuthenticationState = (
	managed: ManagedAuthenticationState
): AuthenticationStateResult => {
	const legacy: AuthenticationStateResult = {
		state: managed.state,
		saveCreds: managed.saveCreds
	}
	closeHandles.set(legacy, managed.close)

	return legacy
}

export const closeOnce = (close: () => void | Promise<void>): (() => Promise<void>) => {
	let completion: Promise<void> | undefined
	return () => (completion ??= Promise.resolve().then(close))
}

/** Tracks only operations admitted through this result; never takes ownership of external work. */
export const manageAuthenticationState = (
	auth: Omit<ManagedAuthenticationState, 'close'>,
	close: () => void | Promise<void>
): ManagedAuthenticationState => {
	const pending = new Set<Promise<unknown>>()
	let closing = false
	const run = <T>(work: () => Promise<T>): Promise<T> => {
		if (closing) return Promise.reject(new Error('Authentication state is closing'))
		const operation = Promise.resolve().then(work)
		pending.add(operation)
		void operation.then(
			() => pending.delete(operation),
			() => pending.delete(operation)
		)
		return operation
	}
	const keys: SignalKeyStore = {
		get: (type, ids) => run(async () => auth.state.keys.get(type, ids)),
		set: data =>
			run(async () => {
				await auth.state.keys.set(data)
			})
	}
	if (auth.state.keys.clear)
		keys.clear = () =>
			run(async () => {
				await auth.state.keys.clear?.()
			})
	const dispose = closeOnce(async () => {
		const errors: unknown[] = []
		for (const result of await Promise.allSettled([...pending])) {
			if (result.status === 'rejected') errors.push(result.reason)
		}
		try {
			await close()
		} catch (error) {
			errors.push(error)
		}
		if (errors.length) {
			const error = new AggregateError(errors, 'Authentication resource cleanup failed')
			Object.defineProperty(error, 'cause', { value: errors[0] })
			throw error
		}
	})
	return {
		state: { ...auth.state, keys },
		saveCreds: () => run(auth.saveCreds),
		close: () => {
			closing = true
			return dispose()
		}
	}
}

/** Initialization must release internally owned clients without replacing its original failure. */
export const closeAfterFailedInitialization = async <T>(
	initialize: () => Promise<T>,
	close: () => void | Promise<void>
): Promise<T> => {
	try {
		return await initialize()
	} catch (cause) {
		try {
			await close()
		} catch (cleanupError) {
			const error = new AggregateError([cause, cleanupError], 'Auth initialization and resource cleanup failed')
			Object.defineProperty(error, 'cause', { value: cause })
			throw error
		}
		throw cause
	}
}
