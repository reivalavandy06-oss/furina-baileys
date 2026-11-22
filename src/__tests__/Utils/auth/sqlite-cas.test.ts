import { createSQLiteAuthStore, makeAuthStateFromStore } from '../../../Utils/auth-store'

type ResultMode = 'changes' | 'void'

const makeDriver = (mode: ResultMode, supportChanges = true) => {
	const rows = new Map<string, string>()
	let lastChanges = 0
	let failure: Error | undefined

	const statement = (all: (...params: unknown[]) => unknown[], run: (...params: unknown[]) => unknown) => ({
		all,
		run
	})

	const prepare = (sql: string) => {
		if (sql.startsWith('SELECT changes()')) {
			if (!supportChanges) throw new Error('changes() unsupported')
			return statement(() => [{ changes: lastChanges }], () => undefined)
		}
		if (sql.includes('SELECT value FROM')) {
			return statement(
				(...params: unknown[]) => {
					const value = rows.get(String(params[0]))
					return value === undefined ? [] : [{ value }]
				},
				() => undefined
			)
		}
		if (sql.includes('SELECT key FROM')) {
			return statement(() => [...rows.keys()].map(key => ({ key })), () => undefined)
		}
		if (sql.includes('INSERT OR REPLACE INTO')) {
			return statement(
				() => [],
				(...params: unknown[]) => {
					if (failure) throw failure
					rows.set(String(params[0]), String(params[1]))
					lastChanges = 1
					return mode === 'void' ? undefined : { changes: lastChanges }
				}
			)
		}
		if (sql.startsWith('UPDATE ')) {
			return statement(
				() => [],
				(...params: unknown[]) => {
					if (failure) throw failure
					const [replacement, key, expected] = params.map(String)
					lastChanges = rows.get(key!) === expected ? 1 : 0
					if (lastChanges) rows.set(key!, replacement!)
					return mode === 'void' ? undefined : { changes: lastChanges }
				}
			)
		}
		if (sql.includes('DELETE FROM')) {
			const scoped = sql.includes('WHERE key =')
			const conditional = sql.includes('AND value = ?')
			return statement(
				() => [],
				(...params: unknown[]) => {
					if (failure) throw failure
					if (scoped) {
						const key = String(params[0])
						if (conditional && rows.get(key) !== params[1]) {
							lastChanges = 0
						} else {
							lastChanges = rows.delete(key) ? 1 : 0
						}
					} else {
						lastChanges = rows.size
						rows.clear()
					}
					return mode === 'void' ? undefined : { changes: lastChanges }
				}
			)
		}
		throw new Error(`unexpected sql: ${sql}`)
	}

	return {
		db: { prepare },
		rows,
		fail: (error: Error) => {
			failure = error
		}
	}
}

describe('SQLite compareAndSet result contract', () => {
	it('returns true when a conditional update reports changes: 1', async () => {
		const driver = makeDriver('changes')
		const store = createSQLiteAuthStore(driver.db)
		await store.set('key', 'old')

		await expect(store.compareAndSet!('key', 'old', 'new')).resolves.toBe(true)
		await expect(store.get('key')).resolves.toBe('new')
	})

	it('returns false when a conditional update reports changes: 0', async () => {
		const driver = makeDriver('changes')
		const store = createSQLiteAuthStore(driver.db)
		await store.set('key', 'old')

		await expect(store.compareAndSet!('key', 'wrong', 'new')).resolves.toBe(false)
		await expect(store.get('key')).resolves.toBe('old')
	})

	it('uses SQLite changes() when the driver returns void after a successful update', async () => {
		const driver = makeDriver('void')
		const store = createSQLiteAuthStore(driver.db)
		await store.set('key', 'old')

		await expect(store.compareAndSet!('key', 'old', 'new')).resolves.toBe(true)
		await expect(store.get('key')).resolves.toBe('new')
	})

	it('uses SQLite changes() when the driver returns void after a conflicting update', async () => {
		const driver = makeDriver('void')
		const store = createSQLiteAuthStore(driver.db)
		await store.set('key', 'old')

		await expect(store.compareAndSet!('key', 'wrong', 'new')).resolves.toBe(false)
		await expect(store.get('key')).resolves.toBe('old')
	})

	it('returns true for a successful conditional delete and false for a conflict', async () => {
		const driver = makeDriver('void')
		const store = createSQLiteAuthStore(driver.db)
		await store.set('key', 'old')

		await expect(store.compareAndSet!('key', 'old', null)).resolves.toBe(true)
		await expect(store.get('key')).resolves.toBeNull()

		await store.set('key', 'old')
		await expect(store.compareAndSet!('key', 'wrong', null)).resolves.toBe(false)
		await expect(store.get('key')).resolves.toBe('old')
	})

	it('rejects when the conditional operation throws and does not report a conflict', async () => {
		const driver = makeDriver('void')
		const store = createSQLiteAuthStore(driver.db)
		await store.set('key', 'old')
		const original = new Error('synthetic write failure')
		driver.fail(original)

		await expect(store.compareAndSet!('key', 'old', 'new')).rejects.toBe(original)
	})

	it('omits compareAndSet when the driver cannot report affected rows', async () => {
		const driver = makeDriver('void', false)
		const store = createSQLiteAuthStore(driver.db)

		expect(store.compareAndSet).toBeUndefined()
		const auth = await makeAuthStateFromStore(store)
		expect(auth.state.creds).toBeDefined()
	})
})
