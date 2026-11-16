// furina-baileys — auth/nekodb-auth.ts
// Optional NekoDB auth state backend.
//
// `@nekodb/client` is an OPTIONAL peer dependency, resolved through a dynamic
// import so a normal install never pulls it in. The user owns the connection:
// `useNekoDBAuth(db)` takes an already-initialised instance, so this module never
// closes it — call `db.close()` yourself when the socket is gone.
//
// NekoDB assigns its own opaque ids on `insert`, so a record cannot be addressed
// by the key it is stored under (the way the file/SQLite backends use file
// names). Each document therefore carries its record key in a `k` field, and the
// server-generated id is resolved per key via `search`. That resolution is
// memoised: a restart costs one `search` per untouched key.

import { Boom } from '@hapi/boom'
import type { AuthStore, AuthenticationState } from '../../Types'
import { makeCacheableSignalKeyStore } from '../auth-utils'
import { makeAuthStateFromStore } from '../auth-store'

const NEKODB_SPECIFIER = '@nekodb/client'

/** Field marking every document written by this store, so `keys`/`clear` never
 * touch foreign documents that happen to share the collection. */
const OWNER_MARK = '________furina'

/** Structural view of the `@nekodb/client` instance — no compile-time dependency. */
export interface NekoDBLike {
	insert: (collection: string, data: object) => Promise<unknown>
	get: (collection: string, id: string) => Promise<unknown>
	update: (collection: string, id: string, data: object) => Promise<unknown>
	delete: (collection: string, id: string) => Promise<unknown>
	search: (collection: string, query: object) => Promise<unknown>
}

/** Fired instead of a raw MODULE_NOT_FOUND when the peer dependency is absent. */
export const missingNekoDBError = (): Error =>
	new Error('[furina-auth] peer dependency "@nekodb/client" belum terpasang. Jalankan: npm install @nekodb/client')

/** Loads a module from a variable specifier so TS never hard-requires it. */
const loadOptionalModule = async (specifier: string): Promise<Record<string, unknown>> => {
	try {
		return (await import(/* webpackIgnore: true */ specifier)) as Record<string, unknown>
	} catch {
		throw missingNekoDBError()
	}
}

/**
 * Test seam: lets unit tests inject a fake module without installing the peer
 * dependency. Not part of the public API.
 */
export type NekoDBModuleLoader = (specifier: string) => Promise<Record<string, unknown>>

let moduleLoader: NekoDBModuleLoader = loadOptionalModule

export const __setAuthModuleLoader = (loader: NekoDBModuleLoader | null): void => {
	moduleLoader = loader ?? loadOptionalModule
}

/**
 * Fails fast with an actionable message when `@nekodb/client` cannot be
 * resolved — e.g. the package was removed after the instance was built, or a
 * bundler dropped it from the graph.
 */
const requireNekoDBModule = async (): Promise<void> => {
	try {
		await moduleLoader(NEKODB_SPECIFIER)
	} catch {
		throw missingNekoDBError()
	}
}

const NEKODB_METHODS = ['insert', 'get', 'update', 'delete', 'search'] as const

/** Duck-types the argument so a wrong client fails with a precise error. */
const assertNekoDBLike = (db: unknown): NekoDBLike => {
	if (db && typeof db === 'object') {
		const candidate = db as NekoDBLike
		if (NEKODB_METHODS.every(method => typeof candidate[method] === 'function')) {
			return candidate
		}
	}

	throw new Boom(
		'Argumen `db` bukan instance @nekodb/client. Bangun dulu dengan `new NekoDB({ host, username, password })`.',
		{ statusCode: 400 }
	)
}

/** A `search` row is a document id; older/other shapes are tolerated. */
const extractId = (row: unknown): string | undefined => {
	if (typeof row === 'string' && row.length > 0) return row

	if (row && typeof row === 'object') {
		const id = (row as { _id?: unknown })._id ?? (row as { id?: unknown }).id
		if (typeof id === 'string' && id.length > 0) return id
	}

	return undefined
}

/**
 * Builds the raw {@link AuthStore} on top of a NekoDB collection. Exported for
 * symmetry with `createFileAuthStore` — most users want {@link useNekoDBAuth}.
 *
 * @param db an already-connected `new NekoDB({ host, username, password })`
 * @param collectionName collection to hold the session, default `baileys_auth`
 */
export const createNekoDBAuthStore = (db: NekoDBLike, collectionName = 'baileys_auth'): AuthStore => {
	const client = assertNekoDBLike(db)

	const collection = String(collectionName ?? '').trim()
	if (!collection) {
		throw new Boom('`collectionName` wajib berupa string non-kosong.', { statusCode: 400 })
	}

	const ids = new Map<string, string>()

	const resolveId = async (key: string): Promise<string | undefined> => {
		const cached = ids.get(key)
		if (cached) return cached

		const rows = await client.search(collection, { k: key })
		const found = extractId(Array.isArray(rows) ? rows[0] : undefined)
		if (found) ids.set(key, found)

		return found
	}

	const read = async (key: string): Promise<string | null> => {
		const id = await resolveId(key)
		if (!id) return null

		const doc = (await client.get(collection, id)) as { value?: unknown } | null
		if (!doc || typeof doc !== 'object') return null

		return typeof doc.value === 'string' ? doc.value : null
	}

	// `search` + insert/update is not atomic, so concurrent writers for one key
	// would each miss the first document and insert a duplicate. Serialising per
	// key keeps a single document per record key.
	const writes = new Map<string, Promise<unknown>>()

	const write = async (key: string, value: string): Promise<void> => {
		const run = async () => {
			const id = await resolveId(key)
			const doc = { [OWNER_MARK]: true, k: key, value }
			if (id) {
				await client.update(collection, id, doc)
			} else {
				const created = extractId(await client.insert(collection, doc))
				if (created) ids.set(key, created)
			}
		}

		const queued = (writes.get(key) ?? Promise.resolve()).then(run, run)
		writes.set(
			key,
			queued.catch(() => undefined)
		)
		await queued
	}

	const remove = async (key: string): Promise<boolean> => {
		const id = await resolveId(key)
		if (!id) return false

		await client.delete(collection, id)
		ids.delete(key)
		return true
	}

	const listOwnKeys = async (): Promise<string[]> => {
		const rows = await client.search(collection, { [OWNER_MARK]: true })
		const found: string[] = []

		for (const row of Array.isArray(rows) ? rows : []) {
			const id = extractId(row)
			if (!id) continue

			const doc = (await client.get(collection, id)) as { k?: unknown } | null
			if (doc && typeof doc === 'object' && typeof doc.k === 'string') {
				ids.set(doc.k, id)
				found.push(doc.k)
			}
		}

		return found
	}

	const store: AuthStore = {
		backend: 'nekodb',
		get: read,
		getMany: async keys => {
			const out: Record<string, string> = {}

			for (const key of keys) {
				const value = await read(key)
				if (value !== null) out[key] = value
			}

			return out
		},
		set: write,
		setMany: async entries => {
			for (const [key, value] of Object.entries(entries)) {
				await write(key, value)
			}
		},
		remove,
		keys: listOwnKeys,
		clear: async () => {
			for (const key of await listOwnKeys()) {
				await remove(key)
			}

			ids.clear()
		}
	}

	return store
}

/**
 * Builds `{ state, saveCreds }` on top of a NekoDB collection, ready to be
 * handed straight to `makeWASocket({ auth: state })`.
 *
 * @param db an already-connected `new NekoDB({ host, username, password })`
 * @param collectionName collection to hold the session, default `baileys_auth`
 */
export const useNekoDBAuth = async (
	db: NekoDBLike,
	collectionName = 'baileys_auth'
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
	await requireNekoDBModule()

	const { state, saveCreds } = await makeAuthStateFromStore(createNekoDBAuthStore(db, collectionName))

	// NekoDB is remote: every record read is a network round trip, and the client
	// L1 cache only helps repeat reads of the very same document. Baileys' own key
	// cache keeps hot signal keys in memory, which matters far more here than for
	// the file/SQLite backends.
	state.keys = makeCacheableSignalKeyStore(state.keys)

	return { state, saveCreds }
}
