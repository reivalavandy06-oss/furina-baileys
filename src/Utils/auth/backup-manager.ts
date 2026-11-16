// furina-baileys — auth/backup-manager.ts
// Export / import a full auth state (creds + Signal keys) as a gzipped payload.
//
// Every record in an `AuthStore` is already a `BufferJSON`-encoded JSON string,
// so record values are copied verbatim — no re-encoding, no Buffer loss. The
// outer envelope itself is stringified with `BufferJSON` as well, for consistency.

import { gzipSync, gunzipSync } from 'zlib'
import { Boom } from '@hapi/boom'
import type { AuthStore } from '../../Types'
import { CREDS_KEY } from '../auth-store'
import { BufferJSON } from '../generics'

/** Current backup envelope version. Bump only on a breaking layout change. */
export const BACKUP_VERSION = 1

export interface AuthBackup {
	version: number
	/** Epoch milliseconds. */
	timestamp: number
	/** `AuthStore.backend` of the store this was exported from. */
	backend: string
	data: {
		/** BufferJSON JSON string, absent when creds were never saved. */
		creds?: string
		/** record key -> BufferJSON JSON string, excluding creds. */
		keys: Record<string, string>
	}
}

export interface ExportAuthStateOptions {
	/** Exclude a record from the export, matched by record key. */
	exclude?: (key: string) => boolean
	/** gzip level, 0 (store) – 9 (best). Default 9. */
	level?: number
}

export interface AuthBackupInfo {
	backend: string
	timestamp: number
	hasCreds: boolean
	recordCount: number
}

const parseEnvelope = (buffer: Buffer): AuthBackup => {
	let json: string

	try {
		json = gunzipSync(buffer).toString('utf8')
	} catch {
		throw new Boom('Backup rusak: isi bukan gzip yang valid.', { statusCode: 400 })
	}

	let parsed: unknown
	try {
		parsed = JSON.parse(json, BufferJSON.reviver)
	} catch {
		throw new Boom('Backup rusak: isi bukan JSON yang valid.', { statusCode: 400 })
	}

	if (!parsed || typeof parsed !== 'object') {
		throw new Boom('Backup rusak: struktur tidak dikenali.', { statusCode: 400 })
	}

	const envelope = parsed as Partial<AuthBackup> & { data?: unknown }

	if (envelope.version !== BACKUP_VERSION) {
		throw new Boom(
			`Backup tidak kompatibel: versi ${String(envelope.version)} tidak didukung (harus ${BACKUP_VERSION}).`,
			{ statusCode: 400 }
		)
	}

	const data = envelope.data as { creds?: unknown; keys?: unknown } | undefined
	if (!data || typeof data !== 'object' || typeof data.keys !== 'object' || data.keys === null) {
		throw new Boom('Backup rusak: `data.keys` wajib berupa objek.', { statusCode: 400 })
	}

	if (data.creds !== undefined && typeof data.creds !== 'string') {
		throw new Boom('Backup rusak: `data.creds` wajib berupa string.', { statusCode: 400 })
	}

	const keys: Record<string, string> = {}
	for (const [key, value] of Object.entries(data.keys as Record<string, unknown>)) {
		if (typeof value !== 'string') {
			throw new Boom(`Backup rusak: record "${key}" bukan string JSON.`, { statusCode: 400 })
		}

		keys[key] = value
	}

	return {
		version: BACKUP_VERSION,
		timestamp: typeof envelope.timestamp === 'number' ? envelope.timestamp : 0,
		backend: typeof envelope.backend === 'string' ? envelope.backend : 'unknown',
		data: { creds: data.creds, keys }
	}
}

/**
 * Reads every record from `store` and returns a gzipped backup buffer.
 * Does not open a connection or close the store — the caller owns it.
 */
export const exportAuthState = async (store: AuthStore, options: ExportAuthStateOptions = {}): Promise<Buffer> => {
	const batch = await store.getMany(await store.keys())
	const keys: Record<string, string> = {}

	for (const [key, value] of Object.entries(batch)) {
		if (options.exclude?.(key) ?? false) continue

		// creds live in their own envelope field so backups are self-describing
		if (key === CREDS_KEY) continue

		keys[key] = value
	}

	// creds are lifted into their own field so a backup is self-describing
	const rawCreds = batch[CREDS_KEY]
	const creds = typeof rawCreds === 'string' ? rawCreds : undefined

	const envelope: AuthBackup = {
		version: BACKUP_VERSION,
		timestamp: Date.now(),
		backend: store.backend,
		data: { creds, keys }
	}

	const json = JSON.stringify(envelope, BufferJSON.replacer)

	return gzipSync(Buffer.from(json, 'utf8'), { level: options.level ?? 9 })
}

/** Exports nothing but the envelope, so callers can inspect a store's metadata. */
export const peekAuthBackup = (buffer: Buffer): AuthBackupInfo => {
	const envelope = parseEnvelope(buffer)
	const { creds, keys } = envelope.data

	return {
		backend: envelope.backend,
		timestamp: envelope.timestamp,
		hasCreds: typeof creds === 'string' && creds.length > 0,
		recordCount: Object.keys(keys).length
	}
}

/**
 * Validates a backup and writes it into `store`, overwriting existing records.
 * Records present in the target but absent from the backup are left untouched —
 * call `store.clear()` first when you want a clean restore.
 */
export const importAuthState = async (store: AuthStore, backupBuffer: Buffer): Promise<AuthBackupInfo> => {
	const envelope = parseEnvelope(backupBuffer)
	const { creds, keys } = envelope.data

	if (typeof store.setMany !== 'function') {
		throw new Boom('Store tanpa `setMany` tidak bisa menerima restore.', { statusCode: 400 })
	}

	if (typeof creds === 'string' && creds.length > 0) {
		await store.set(CREDS_KEY, creds)
	}

	await store.setMany(keys)

	const restoredCreds = typeof creds === 'string' && creds.length > 0

	return {
		backend: envelope.backend,
		timestamp: envelope.timestamp,
		hasCreds: restoredCreds,
		recordCount: Object.keys(keys).length + (restoredCreds ? 1 : 0)
	}
}
