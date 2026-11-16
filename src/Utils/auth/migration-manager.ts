// furina-baileys — auth/migration-manager.ts
// Move an auth state between two `AuthStore` backends (file → SQLite, SQLite →
// NekoDB, …) with verification and a rollback that preserves what the target
// already held.
//
// Baileys exposes no `migrateAuthState`; `signalRepository.migrateSession()`
// only re-points *Signal sessions* wrapped by a live socket and says nothing
// about persisting a whole auth state, so this is new functionality rather than
// a wrapper. It works purely through the `AuthStore` contract, so it moves a
// session with no socket at all.

import { Boom } from '@hapi/boom'
import type { AuthStore } from '../../Types'
import { CREDS_KEY } from '../auth-store'

export interface MigrateAuthStateOptions {
	/** Reports the migration phase: `read`, `write`, `verify`, `rollback`, `done`. */
	onProgress?: (step: string) => void
	/** Re-read every record from the target and compare with the source. Default true. */
	verify?: boolean
	/** Undo the writes when verification fails. Default true. */
	rollback?: boolean
}

export interface MigrationResult {
	/** `AuthStore.backend` of the source. */
	backend: string
	hasCreds: boolean
	migrated: number
}

export const migrateAuthState = async (
	fromStore: AuthStore,
	toStore: AuthStore,
	options: MigrateAuthStateOptions = {}
): Promise<MigrationResult> => {
	const { onProgress, verify = true, rollback = true } = options

	if (fromStore === toStore) {
		throw new Boom('Source dan target tidak boleh store yang sama.', { statusCode: 400 })
	}

	onProgress?.('read')

	const sourceKeys = await fromStore.keys()
	const sourceEntries = Object.entries(await fromStore.getMany(sourceKeys)).filter(([, value]) => value !== undefined)
	const record: Record<string, string> = {}
	for (const [key, value] of sourceEntries) {
		record[key] = value
	}

	const hasCreds = typeof record[CREDS_KEY] === 'string'

	// Snapshot what the target already holds for the keys we are about to touch.
	// `getMany` omits missing keys, so an absent entry means "the target has
	// nothing here" and rollback should delete rather than restore.
	const existing = await toStore.getMany((await toStore.keys()).filter(key => key in record))

	onProgress?.('write')

	await toStore.setMany(record)

	if (!verify) {
		onProgress?.('done')
		return { backend: fromStore.backend, hasCreds, migrated: sourceEntries.length }
	}

	onProgress?.('verify')

	const written = await toStore.getMany(sourceEntries.map(([key]) => key))
	const mismatches = sourceEntries.filter(([key, value]) => written[key] !== value)

	if (mismatches.length === 0) {
		onProgress?.('done')
		return { backend: fromStore.backend, hasCreds, migrated: sourceEntries.length }
	}

	const detail = mismatches
		.slice(0, 5)
		.map(([key]) => key)
		.join(', ')

	onProgress?.('rollback')

	let rollbackError: unknown

	if (rollback) {
		try {
			for (const [key] of sourceEntries) {
				const original = existing[key]
				if (original === undefined) {
					await toStore.remove(key)
				} else {
					await toStore.set(key, original)
				}
			}
		} catch (error) {
			rollbackError = error
		}
	}

	const outcome = rollback
		? rollbackError
			? ` Rollback gagal: ${String(rollbackError)}`
			: ' Perubahan sudah dibatalkan.'
		: ' Target mungkin berisi sebagian data.'

	throw new Boom(`Migrasi gagal: ${mismatches.length} record tidak cocok (${detail}).${outcome}`, { statusCode: 500 })
}
