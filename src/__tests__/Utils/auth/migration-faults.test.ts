import { migrateAuthState } from '../../../Utils/auth/migration-manager'
import { adapterHarness, backends, encode, expectRecords, sessionRecords, snapshot } from './fault-adapters'
import { deferred } from '../../TestUtils/storage-faults'

const directions = backends.flatMap(from => backends.filter(to => to !== from).map(to => ({ from, to })))

describe.each(directions)('$from -> $to fault-injected migration', ({ from, to }) => {
	let sourceHarness: ReturnType<typeof adapterHarness>
	let targetHarness: ReturnType<typeof adapterHarness>
	beforeEach(() => {
		sourceHarness = adapterHarness(from)
		targetHarness = adapterHarness(to)
	})
	afterEach(() => {
		sourceHarness.faults.dispose()
		targetHarness.faults.dispose()
	})

	it('preserves both sides on source read failure and converges on a repeated attempt', async () => {
		const source = sourceHarness.open()
		const target = targetHarness.open()
		await source.setMany(sessionRecords())
		await target.set('sentinel', encode({ keep: true }))
		const error = sourceHarness.faults.fail('read')
		await expect(migrateAuthState(source, target)).rejects.toBe(error)
		expect(await snapshot(target)).toEqual({ sentinel: encode({ keep: true }) })
		await migrateAuthState(source, target)
		await migrateAuthState(source, target)
		expectRecords(await snapshot(source), sessionRecords())
		expectRecords(await snapshot(target), { sentinel: encode({ keep: true }), ...sessionRecords() })
	})

	it.each(['before', 'after'] as const)(
		'recovers second-write failure %s persistence without claiming atomicity',
		async phase => {
			const source = sourceHarness.open()
			const target = targetHarness.open()
			await source.setMany(sessionRecords())
			const error = targetHarness.faults.fail('write', phase, 2)
			const steps: string[] = []
			await expect(migrateAuthState(source, target, { onProgress: step => steps.push(step) })).rejects.toMatchObject({
				cause: error
			})
			expect(steps).not.toContain('done')
			expectRecords(await snapshot(source), sessionRecords())
			const partial = await snapshot(targetHarness.open())
			expect(Object.keys(partial)).toHaveLength(0)
			await migrateAuthState(source, targetHarness.open())
			expectRecords(await snapshot(targetHarness.open()), sessionRecords())
		}
	)

	it('surfaces a verification read exception; a retry verifies the persisted destination', async () => {
		const source = sourceHarness.open()
		await source.setMany(sessionRecords())
		const target = targetHarness.open()
		const error = new Error('synthetic verification read failure')
		await expect(
			migrateAuthState(source, target, {
				onProgress: step => {
					if (step === 'verify') targetHarness.faults.disconnect(error)
				}
			})
		).rejects.toMatchObject({ cause: error, data: { destinationMayBePartial: true } })
		targetHarness.faults.reconnect()
		expectRecords(await snapshot(source), sessionRecords())
		expectRecords(await snapshot(targetHarness.open()), sessionRecords())
		const result = await migrateAuthState(source, targetHarness.open())
		expect(result.migrated).toBe(3)
	})

	it('rolls back a verified mismatch, restoring old values and removing newly introduced records', async () => {
		const source = sourceHarness.open()
		await source.setMany(sessionRecords())
		const target = targetHarness.open()
		const old = { 'creds.json': encode({ marker: 'old' }), sentinel: encode({ keep: true }) }
		await target.setMany(old)
		let verify = false
		const inaccurate = { ...target, getMany: async (keys: string[]) => (verify ? {} : target.getMany(keys)) }
		await expect(
			migrateAuthState(source, inaccurate, {
				onProgress: step => {
					verify = step === 'verify'
				}
			})
		).rejects.toMatchObject({ output: { statusCode: 500 } })
		expect(await snapshot(targetHarness.open())).toEqual(old)
		expectRecords(await snapshot(source), sessionRecords())
	})

	it('isolates concurrent independent session migrations while one fails', async () => {
		const sourceA = sourceHarness.open('a')
		const sourceB = sourceHarness.open('b')
		await sourceA.setMany(sessionRecords('a'))
		await sourceB.setMany(sessionRecords('b'))
		const targetA = targetHarness.open('a')
		const targetB = targetHarness.open('b')
		targetHarness.faults.fail('write')
		const results = await Promise.allSettled([migrateAuthState(sourceA, targetA), migrateAuthState(sourceB, targetB)])
		expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
		await Promise.all([
			migrateAuthState(sourceA, targetHarness.open('a')),
			migrateAuthState(sourceB, targetHarness.open('b'))
		])
		expectRecords(await snapshot(targetHarness.open('a')), sessionRecords('a'))
		expectRecords(await snapshot(targetHarness.open('b')), sessionRecords('b'))
		expectRecords(await snapshot(sourceA), sessionRecords('a'))
		expectRecords(await snapshot(sourceB), sessionRecords('b'))
	})
})

describe('migration boundaries', () => {
	it('copies invalid serialized strings verbatim: byte verification is not schema validation', async () => {
		const source = adapterHarness('sqlite')
		const target = adapterHarness('redis')
		try {
			await source.open().set('session-invalid.json', '{invalid')
			const result = await migrateAuthState(source.open(), target.open())
			expect(result.migrated).toBe(1)
			expect(await target.open().get('session-invalid.json')).toBe('{invalid')
		} finally {
			source.faults.dispose()
			target.faults.dispose()
		}
	})

	it('settles an interrupted destination write and preserves the source', async () => {
		const source = adapterHarness('sqlite')
		const target = adapterHarness('redis')
		await source.open().setMany(sessionRecords())
		const gate = target.faults.hold('write')
		const pending = Promise.allSettled([migrateAuthState(source.open(), target.open())])
		try {
			await gate.entered
			const error = target.faults.disconnect()
			gate.release()
			expect((await pending)[0]).toMatchObject({ status: 'rejected', reason: { cause: error } })
			expectRecords(await snapshot(source.open()), sessionRecords())
			target.faults.reconnect()
			await migrateAuthState(source.open(), target.open())
			expectRecords(await snapshot(target.open()), sessionRecords())
		} finally {
			source.faults.dispose()
			target.faults.dispose()
			await pending
		}
	})

	it('characterizes a pending application write outside the migration snapshot', async () => {
		const source = adapterHarness('redis')
		const target = adapterHarness('sqlite')
		await source.open().setMany(sessionRecords())
		const gate = source.faults.hold('write')
		const pending = Promise.allSettled([source.open().set('late-key.json', encode({ late: true }))])
		try {
			await gate.entered
			await migrateAuthState(source.open(), target.open())
			gate.release()
			expect((await pending)[0]?.status).toBe('fulfilled')
			expect(await source.open().get('late-key.json')).not.toBeNull()
			expect(await target.open().get('late-key.json')).toBeNull()
		} finally {
			source.faults.dispose()
			target.faults.dispose()
			await pending
		}
	})

	it('does not emit done while the destination verification is held', async () => {
		const source = adapterHarness('sqlite')
		const target = adapterHarness('sqlite')
		await source.open().setMany(sessionRecords())
		const entered = deferred()
		const release = deferred()
		let verifying = false
		const store = target.open()
		const steps: string[] = []
		const pending = migrateAuthState(
			source.open(),
			{
				...store,
				getMany: async keys => {
					if (verifying) {
						entered.release()
						await release.promise
					}
					return store.getMany(keys)
				}
			},
			{
				onProgress: step => {
					steps.push(step)
					verifying = step === 'verify'
				}
			}
		)
		const observed = Promise.allSettled([pending])
		try {
			await entered.promise
			expect(steps).not.toContain('done')
			release.release()
			expect((await pending).migrated).toBe(3)
			expect(steps.at(-1)).toBe('done')
		} finally {
			release.release()
			source.faults.dispose()
			target.faults.dispose()
			await observed
		}
	})
})
