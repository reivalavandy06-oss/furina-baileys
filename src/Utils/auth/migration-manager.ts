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
import { validateRecordMap, writeWithRecovery } from './record-recovery'

export interface MigrateAuthStateOptions {
	/** Reports the migration phase: `read`, `write`, `verify`, `rollback`, `done`. */
	onProgress?: (step: string) => void
	/** Re-read every record from the target and compare with the source. Default true. */
	verify?: boolean
	/** Attempt to restore touched records after a write or verification failure. Default true. */
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
	const source = await fromStore.getMany(sourceKeys)
	validateRecordMap(source, sourceKeys)
	const record = Object.fromEntries(sourceKeys.map(key => [key, source[key] as string]))

	const hasCreds = typeof record[CREDS_KEY] === 'string'

	await writeWithRecovery(toStore, record, () => toStore.setMany(record), {
		label: 'Migrasi',
		verify,
		rollback,
		onProgress
	})
	return { backend: fromStore.backend, hasCreds, migrated: sourceKeys.length }
}
