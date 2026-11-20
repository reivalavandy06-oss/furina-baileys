import { createSQLiteAuthStore } from '../../../Utils/auth-store'
import { makeFakeSqlite } from './mock-stores'

describe('SQLite identifier interpretation', () => {
	it.each([
		['auth', '"auth"'],
		['auth-store', '"auth-store"'],
		['auth store', '"auth store"'],
		['select', '"select"'],
		['main.auth', '"main"."auth"'],
		['"auth-store"', '"auth-store"'],
		['"main"."a""b"', '"main"."a""b"'],
		['[auth-store]', '"auth-store"'],
		['`auth-store`', '"auth-store"'],
		["'auth-store'", '"auth-store"'],
		['"my.app"', '"my.app"'],
		['会話', '"会話"']
	])('uses %s consistently for every record operation', async (input, quoted) => {
		const sql: string[] = []
		const fake = makeFakeSqlite()
		const store = createSQLiteAuthStore(
			{
				prepare: query => {
					sql.push(query)
					return fake.prepare(query)
				}
			},
			input
		)
		await store.set('one', 'first')
		await store.setMany({ two: 'second' })
		expect(await store.get('one')).toBe('first')
		expect(await store.getMany(['one', 'two'])).toEqual({ one: 'first', two: 'second' })
		expect(await store.keys()).toHaveLength(2)
		await store.remove('one')
		expect(await store.get('one')).toBeNull()
		await store.clear?.()
		expect(await store.keys()).toEqual([])
		expect(sql.every(query => query.includes(` ${quoted}`))).toBe(true)
	})

	it.each([
		'',
		' ',
		'main.',
		'.auth',
		'one.two.three',
		'"unclosed',
		'"auth" tail',
		'a"b',
		'auth; DROP TABLE other',
		'auth--comment',
		'auth/*comment*/',
		'auth\0bad'
	])('rejects malformed structure %j before preparing SQL', input => {
		let calls = 0
		expect(() =>
			createSQLiteAuthStore(
				{
					prepare: query => {
						calls++
						return makeFakeSqlite().prepare(query)
					}
				},
				input
			)
		).toThrow()
		expect(calls).toBe(0)
	})
})
