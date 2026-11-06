// furina-baileys — signal-noise-filter.ts
// Scoped suppression of libsignal console noise.
//
// libsignal logs a lot of routine churn ("Closing session:", "Bad MAC", …) that
// is not actionable for a bot operator. This filter silences only those three
// prefixes, and only on console.info/warn/error.
//
// It NEVER touches process.stdout / process.stderr, and it never swallows other
// messages: anything not matching a pattern passes through untouched.

export interface SignalNoiseOptions {
	/** extra prefixes to suppress (matched case-insensitively, "starts with") */
	extraPatterns?: (string | RegExp)[]
	/** set false to skip installing console.info suppression */
	suppressInfo?: boolean
	/** set false to skip console.warn suppression */
	suppressWarn?: boolean
	/** set false to skip console.error suppression */
	suppressError?: boolean
}

const DEFAULT_PATTERNS = ['Closing session:', 'Bad MAC', 'Session error:'] as const

type ConsoleMethod = 'info' | 'warn' | 'error'

const patternMatches = (pattern: string | RegExp, text: string): boolean =>
	pattern instanceof RegExp ? pattern.test(text) : text.startsWith(pattern)

/**
 * Installs console filters for libsignal noise. Returns a `restore()` that puts
 * the original methods back, so the patch is always reversible.
 */
export const suppressSignalNoise = (options: SignalNoiseOptions = {}) => {
	const patterns: (string | RegExp)[] = [...DEFAULT_PATTERNS, ...(options.extraPatterns ?? [])]

	const enabled: ConsoleMethod[] = []
	if (options.suppressInfo !== false) enabled.push('info')
	if (options.suppressWarn !== false) enabled.push('warn')
	if (options.suppressError !== false) enabled.push('error')

	const target = console as Record<ConsoleMethod, (...args: unknown[]) => void>
	const saved = new Map<ConsoleMethod, (...args: unknown[]) => void>()

	for (const method of enabled) {
		saved.set(method, target[method])
		const original = target[method]
		target[method] = (...args: unknown[]) => {
			const first = args[0]
			const text =
				typeof first === 'string'
					? first
					: first instanceof Error
						? first.message
						: first && typeof first === 'object'
							? ((first as { msg?: unknown }).msg ?? JSON.stringify(first))
							: String(first)

			if (typeof text === 'string' && patterns.some(pattern => patternMatches(pattern, text))) {
				return
			}

			return original.apply(console, args)
		}
	}

	/** True when a message would be suppressed by these patterns. */
	const isNoise = (message: unknown): boolean => {
		const text =
			typeof message === 'string'
				? message
				: message instanceof Error
					? message.message
					: message && typeof message === 'object'
						? ((message as { msg?: unknown }).msg ?? JSON.stringify(message))
						: String(message)
		return typeof text === 'string' && patterns.some(pattern => patternMatches(pattern, text))
	}

	return {
		/** undo the patch */
		restore: () => {
			for (const [method, original] of saved) {
				target[method] = original
			}
			saved.clear()
		},
		/** whether every patched method is restored (for tests) */
		isRestored: () => saved.size === 0,
		/** ids of patched console methods (for tests) */
		patchedMethods: () => [...enabled],
		isNoise
	}
}

/** Default patterns exported for tests / custom configs. */
export const SIGNAL_NOISE_PATTERNS: readonly string[] = DEFAULT_PATTERNS
