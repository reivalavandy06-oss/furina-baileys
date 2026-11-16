import { jest } from '@jest/globals'
import { __setAuthModuleLoader, createNekoDBAuthStore, useNekoDBAuth } from '../../../Utils/auth/nekodb-auth'
import { initAuthCreds } from '../../../Utils/auth-utils'

/** In-memory stand-in for `@nekodb/client`: server-assigned ids, `search` by
 * value, `get`/`update`/`delete` by id — mirrors the real wire behaviour. */
const makeFakeNekoDB = () => {
	const docs = new Map<string, Record<string, unknown>>()
	const insertedIds: string[] = []
	let seq = 0

	const rejectMissing = (id: string) => {
		const error = new Error(`Document not found: baileys_auth/${id}`)
		error.name = 'NotFoundError'
		return Promise.reject(error)
	}

	const matches = (doc: Record<string, unknown>, query: object) =>
		Object.entries(query).every(([field, value]) => doc[field] === value)

	return {
		insert: jest.fn(async (collection: string, data: object) => {
			const id = `doc_${++seq}`
			docs.set(id, { id, ...data })
			insertedIds.push(id)
			return id
		}),
		get: jest.fn(async (collection: string, id: string) => {
			const doc = docs.get(id)
			if (!doc) return rejectMissing(id)
			return { ...doc }
		}),
		update: jest.fn(async (collection: string, id: string, data: object) => {
			const doc = docs.get(id)
			if (!doc) return rejectMissing(id)
			docs.set(id, { ...doc, ...data })
			return id
		}),
		delete: jest.fn(async (collection: string, id: string) => {
			docs.delete(id)
			return id
		}),
		search: jest.fn(async (collection: string, query: object) =>
			[...docs.values()].filter(doc => matches(doc, query)).map(doc => String(doc.id))
		),
		insertedIds,
		docs
	}
}

/** A loader that resolves, as if `@nekodb/client` were installed. */
const installedLoader = async () => ({})

const boomOf = async (promise: Promise<unknown>) =>
	(await promise.catch(error => error)) as { output?: { statusCode?: number }; message?: string }

describe('useNekoDBAuth — peer dependency gating', () => {
	afterEach(() => __setAuthModuleLoader(null))

	it('throws an actionable message when @nekodb/client is not installed', async () => {
		__setAuthModuleLoader(async () => {
			throw new Error("Cannot find module '@nekodb/client'")
		})

		await expect(useNekoDBAuth(makeFakeNekoDB())).rejects.toThrow(/npm install @nekodb\/client/)
	})

	it('rejects a client that is not a nekodb instance', async () => {
		__setAuthModuleLoader(installedLoader)
		const error = await boomOf(useNekoDBAuth({ get: jest.fn() } as never))

		expect(error.output?.statusCode).toBe(400)
		expect(error.message).toMatch(/bukan instance @nekodb\/client/)
	})

	it('rejects a blank collectionName', async () => {
		__setAuthModuleLoader(installedLoader)
		const error = await boomOf(useNekoDBAuth(makeFakeNekoDB(), '   '))

		expect(error.output?.statusCode).toBe(400)
		expect(error.message).toMatch(/collectionName/)
	})
})

describe('createNekoDBAuthStore — AuthStore contract', () => {
	it('reports the nekodb backend', () => {
		expect(createNekoDBAuthStore(makeFakeNekoDB()).backend).toBe('nekodb')
	})

	it('inserts once, then updates the same document on subsequent writes', async () => {
		const db = makeFakeNekoDB()
		const store = createNekoDBAuthStore(db)

		await store.set('creds.json', 'first')
		await store.set('creds.json', 'second')

		expect(db.insert).toHaveBeenCalledTimes(1)
		expect(db.update).toHaveBeenCalledTimes(1)
		expect(await store.get('creds.json')).toBe('second')
	})

	it('marks every document so foreign records are never touched', async () => {
		const db = makeFakeNekoDB()
		const store = createNekoDBAuthStore(db)

		await store.set('creds.json', 'first')

		expect(db.insert).toHaveBeenCalledWith('baileys_auth', expect.objectContaining({ k: 'creds.json' }))
	})

	it('getMany skips missing keys', async () => {
		const db = makeFakeNekoDB()
		const store = createNekoDBAuthStore(db)

		await store.set('session-a.json', '1')
		await store.set('session-b.json', '2')

		expect(await store.getMany(['session-a.json', 'session-b.json', 'session-c.json'])).toEqual({
			'session-a.json': '1',
			'session-b.json': '2'
		})
	})

	it('keys lists the records this store wrote', async () => {
		const db = makeFakeNekoDB()
		const store = createNekoDBAuthStore(db)

		await store.set('pre-key-1.json', 'a')
		await store.set('pre-key-2.json', 'b')

		await db.insert('baileys_auth', { __nekodb_note: 'not ours' })

		expect((await store.keys()).sort()).toEqual(['pre-key-1.json', 'pre-key-2.json'])
	})

	it('remove deletes the backing document and is idempotent', async () => {
		const db = makeFakeNekoDB()
		const store = createNekoDBAuthStore(db)

		await store.set('pre-key-3.json', 'gone')
		const id = db.insertedIds[0]!

		expect(await store.remove('pre-key-3.json')).toBe(true)
		expect(db.delete).toHaveBeenCalledWith('baileys_auth', id)
		expect(await store.get('pre-key-3.json')).toBeNull()
		expect(await store.remove('pre-key-3.json')).toBe(false)
	})

	it('clear removes only the documents this store wrote', async () => {
		const db = makeFakeNekoDB()
		const store = createNekoDBAuthStore(db)

		await store.set('pre-key-1.json', 'a')
		const ourId = db.insertedIds[db.insertedIds.length - 1]!

		await db.insert('baileys_auth', { __nekodb_note: 'keep me' })
		const theirId = db.insertedIds[db.insertedIds.length - 1]!
		expect(theirId).not.toBe(ourId)

		await store.clear?.()

		expect(db.delete).toHaveBeenCalledTimes(1)
		expect(db.delete).toHaveBeenCalledWith('baileys_auth', ourId)
		expect(db.delete).not.toHaveBeenCalledWith('baileys_auth', theirId)
		await expect(db.get('baileys_auth', theirId)).resolves.toEqual(
			expect.objectContaining({ __nekodb_note: 'keep me' })
		)
		expect(await store.keys()).toEqual([])
	})

	it('serialises concurrent writes for the same key into one document', async () => {
		const db = makeFakeNekoDB()
		const store = createNekoDBAuthStore(db)

		await Promise.all([store.set('pre-key-9.json', 'one'), store.set('pre-key-9.json', 'two')])

		expect(db.insert).toHaveBeenCalledTimes(1)
		expect(await store.get('pre-key-9.json')).toBe('two')
	})
})

describe('useNekoDBAuth — session persistence', () => {
	beforeEach(() => __setAuthModuleLoader(installedLoader))
	afterEach(() => __setAuthModuleLoader(null))

	it('returns the { state, saveCreds } shape makeWASocket consumes', async () => {
		const { state, saveCreds } = await useNekoDBAuth(makeFakeNekoDB())

		expect(state.creds).toEqual(expect.objectContaining({ registered: false }))
		expect(typeof state.keys.get).toBe('function')
		expect(typeof state.keys.set).toBe('function')
		expect(typeof saveCreds).toBe('function')
	})

	it('starts a fresh session from initAuthCreds when nothing is stored', async () => {
		const db = makeFakeNekoDB()
		const { state, saveCreds } = await useNekoDBAuth(db)

		expect(state.creds.registered).toBe(initAuthCreds().registered)
		expect(db.get).not.toHaveBeenCalled()

		await saveCreds()
		expect(db.insert).toHaveBeenCalledTimes(1)
		expect(db.insert).toHaveBeenCalledWith('baileys_auth', expect.objectContaining({ k: 'creds.json' }))
	})

	it('restores stored creds when the session is mounted again', async () => {
		const db = makeFakeNekoDB()

		const first = await useNekoDBAuth(db, 'my_session')
		first.state.creds.registered = true
		first.state.creds.platform = 'nekodb-test'
		await first.saveCreds()

		const second = await useNekoDBAuth(db, 'my_session')
		expect(second.state.creds.registered).toBe(true)
		expect(second.state.creds.platform).toBe('nekodb-test')
		expect(second.state.creds.me).toBeUndefined()
	})

	it('saveCreds goes through db.update once the creds document exists', async () => {
		const db = makeFakeNekoDB()
		const { state, saveCreds } = await useNekoDBAuth(db)

		await saveCreds()
		const credsId = db.insertedIds[0]!
		expect(credsId).toBe('doc_1')

		db.update.mockClear()
		state.creds.accountSyncCounter = 777
		await saveCreds()

		expect(db.update).toHaveBeenCalledTimes(1)
		expect(db.insert).toHaveBeenCalledTimes(1)
		expect(db.update).toHaveBeenCalledWith('baileys_auth', credsId, expect.objectContaining({ k: 'creds.json' }))
	})

	it('honours a custom collection name', async () => {
		const db = makeFakeNekoDB()
		const { saveCreds } = await useNekoDBAuth(db, 'bot_a_session')

		await saveCreds()

		expect(db.insert).toHaveBeenCalledWith('bot_a_session', expect.objectContaining({ k: 'creds.json' }))
	})
})

describe('useNekoDBAuth — signal keys', () => {
	beforeEach(() => __setAuthModuleLoader(installedLoader))
	afterEach(() => __setAuthModuleLoader(null))

	const jid = '628@s.whatsapp.net'

	it('writes a signal key through the database', async () => {
		const db = makeFakeNekoDB()
		const { state } = await useNekoDBAuth(db)

		await state.keys.set({ session: { [jid]: new Uint8Array([1, 2, 3]) } })

		expect(db.insert).toHaveBeenCalledTimes(1)
		expect(db.insert).toHaveBeenCalledWith('baileys_auth', expect.objectContaining({ k: `session-${jid}.json` }))
	})

	it('reads a freshly written key back from the database', async () => {
		const db = makeFakeNekoDB()
		const { state } = await useNekoDBAuth(db)

		await state.keys.set({ session: { [jid]: new Uint8Array([1, 2, 3]) } })
		db.get.mockClear()

		const readBack = await state.keys.get('session', [jid])
		expect(Array.from(readBack[jid] as Uint8Array)).toEqual([1, 2, 3])

		// served from Baileys' key cache: the write already populated it
		db.get.mockClear()
		await state.keys.get('session', [jid])
		expect(db.get).not.toHaveBeenCalled()
	})

	it('serves hot signal keys from the L1 cache instead of the database', async () => {
		const db = makeFakeNekoDB()
		const { state } = await useNekoDBAuth(db)

		await state.keys.set({ session: { [jid]: new Uint8Array([1, 2, 3]) } })
		db.get.mockClear()

		for (let attempt = 0; attempt < 3; attempt += 1) {
			await state.keys.get('session', [jid])
		}

		expect(db.get).not.toHaveBeenCalled()
	})

	it('restores stored keys when the session is mounted again', async () => {
		const db = makeFakeNekoDB()

		const first = await useNekoDBAuth(db)
		await first.state.keys.set({ session: { [jid]: new Uint8Array([7, 8, 9]) } })

		const second = await useNekoDBAuth(db)
		const readBack = await second.state.keys.get('session', [jid])
		expect(Array.from(readBack[jid] as Uint8Array)).toEqual([7, 8, 9])
	})

	it('removes the record when the value is nulled out', async () => {
		const db = makeFakeNekoDB()
		const { state } = await useNekoDBAuth(db)

		await state.keys.set({ session: { [jid]: new Uint8Array([1, 2, 3]) } })
		const recordId = db.insertedIds[0]!

		await state.keys.set({ session: { [jid]: null } })

		expect(db.delete).toHaveBeenCalledWith('baileys_auth', recordId)
	})
})
