/// <reference lib="es2021.promise" />

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
