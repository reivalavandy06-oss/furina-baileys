import { Boom } from '@hapi/boom'
import type { AuthStore } from '../../Types'
import { Mutex } from 'async-mutex'
const owns = (records: Record<string, string>, key: string) => Object.prototype.hasOwnProperty.call(records, key)
const recoveryLocks = new WeakMap<AuthStore, Mutex>()

// Record strings are opaque for compatibility with existing backups/custom stores.
export const validateRecordMap = (records: Record<string, string>, keys = Object.keys(records)): void => {
	for (const key of keys) {
		if (!owns(records, key) || typeof records[key] !== 'string') {
			throw new Boom('Auth record snapshot is incomplete or malformed', { statusCode: 400 })
		}
	}
}

/** Only snapshots touched keys. Requires exclusive access; this is not a transaction. */
const executeWithRecovery = async (
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
		const rollbackConflicts: string[] = []
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
					const current = await store.get(key)
					if (current === (original ?? null)) continue
					if (current !== records[key]) {
						rollbackConflicts.push(key)
						throw new Error('Auth rollback conflict; current value preserved')
					}
					if (store.compareAndSet) {
						if (!(await store.compareAndSet(key, current, original ?? null))) {
							rollbackConflicts.push(key)
							throw new Error('Auth conditional rollback conflict; current value preserved')
						}
					} else {
						// This fallback requires exclusive access. The check above is NOT atomic CAS.
						if (original === undefined) await store.remove(key)
						else await store.set(key, original)
					}
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
			data: {
				phase,
				rollbackAttempted: rollback,
				rollbackErrors,
				rollbackConflicts,
				progressErrors,
				destinationMayBePartial,
				conditionalRecovery: !!store.compareAndSet
			}
		})
		// Non-enumerable cause preserves identity without putting driver payloads in HTTP output.
		Object.defineProperty(error, 'cause', { value: cause, configurable: true })
		throw error
	}
}

// Coordinates migration/restore for this object only, never a distributed/session lock.
export const writeWithRecovery = (...args: Parameters<typeof executeWithRecovery>): Promise<void> => {
	const store = args[0]
	let lock = recoveryLocks.get(store)
	if (!lock) {
		lock = new Mutex()
		recoveryLocks.set(store, lock)
	}
	return lock.runExclusive(() => executeWithRecovery(...args))
}
