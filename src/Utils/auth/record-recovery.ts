import { Boom } from '@hapi/boom'
import type { AuthStore } from '../../Types'
const owns = (records: Record<string, string>, key: string) => Object.prototype.hasOwnProperty.call(records, key)

// Record strings are opaque for compatibility with existing backups/custom stores.
export const validateRecordMap = (records: Record<string, string>, keys = Object.keys(records)): void => {
	for (const key of keys) {
		if (!owns(records, key) || typeof records[key] !== 'string') {
			throw new Boom('Auth record snapshot is incomplete or malformed', { statusCode: 400 })
		}
	}
}

/** Only snapshots touched keys. Requires exclusive access; this is not a transaction. */
export const writeWithRecovery = async (
	store: AuthStore,
	records: Record<string, string>,
	write: () => Promise<void>,
	options: { label: string; verify?: boolean; rollback?: boolean; onProgress?: (step: string) => void }
): Promise<void> => {
	const { label, verify = true, rollback = true, onProgress } = options
	const keys = Object.keys(records)
	validateRecordMap(records, keys)
	const previous = await store.getMany(keys)
	validateRecordMap(previous)
	onProgress?.('write')
	let phase = 'write'
	try {
		await write()
		if (verify) {
			phase = 'verify'
			onProgress?.('verify')
			const written = await store.getMany(keys)
			if (keys.some(key => !owns(written, key) || written[key] !== records[key])) {
				throw new Error('Auth record verification mismatch')
			}
		}
		phase = 'done'
		onProgress?.('done')
	} catch (cause) {
		const rollbackErrors: unknown[] = []
		const progressErrors: unknown[] = []
		if (rollback) {
			try {
				onProgress?.('rollback')
			} catch (error) {
				progressErrors.push(error)
			}
			for (const key of keys) {
				try {
					const original = owns(previous, key) ? previous[key] : undefined
					if (original === undefined) await store.remove(key)
					else await store.set(key, original)
					if ((await store.get(key)) !== (original ?? null)) {
						throw new Error('Auth rollback verification mismatch')
					}
				} catch (error) {
					rollbackErrors.push(error)
				}
			}
		}
		const destinationMayBePartial = !rollback || rollbackErrors.length > 0
		const outcome = destinationMayBePartial
			? `${rollback ? ' Rollback gagal.' : ''} Target mungkin berisi sebagian data.`
			: ' Perubahan sudah dibatalkan.'
		const error = new Boom(`${label} gagal pada tahap ${phase}.${outcome}`, {
			statusCode: 500,
			data: { phase, rollbackAttempted: rollback, rollbackErrors, progressErrors, destinationMayBePartial }
		})
		// Non-enumerable cause preserves identity without putting driver payloads in HTTP output.
		Object.defineProperty(error, 'cause', { value: cause, configurable: true })
		throw error
	}
}
