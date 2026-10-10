import { jest } from '@jest/globals'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { CRMBroadcastManager } from '../../../../Utils/crm/broadcast/manager'
import { BroadcastQuarantineStore, DEFAULT_QUARANTINE_FILE } from '../../../../Utils/crm/broadcast/quarantine'
import { InMemoryStorage } from '../../../../Utils/crm/storage/memory'

// Quarantine harus bertahan melewati pembuatan ulang BroadcastManager, jadi
// test ini memakai file JSON sungguhan di direktori sementara — bukan in-memory
// fake. Kalau filenya hilang, persistensinya memang tidak terbukti.

const group = (n: number): string => `1203630${String(n).padStart(6, '0')}@g.us`
const customer = (n: number): string => `628${String(n).padStart(9, '0')}@s.whatsapp.net`

let tmpDir: string
let quarantinePath: string

const forbidden = (jid: string) => {
	const err = new Error(`forbidden: ${jid}`) as Error & { output: { statusCode: number } }
	err.output = { statusCode: 403 }
	return err
}

const makeSock = (options: { members?: string[]; failFor?: string[] } = {}) => {
	const members = new Set(options.members ?? [])
	const failFor = new Set(options.failFor ?? [])
	const sent: string[] = []

	return {
		sent,
		async groupFetchAllParticipating() {
			const out: Record<string, unknown> = {}
			for (const jid of members) out[jid] = { id: jid }
			return out
		},
		async groupMetadata() {
			throw new Error('stub: no metadata')
		},
		async sendMessage(jid: string) {
			if (failFor.has(jid)) throw forbidden(jid)
			sent.push(jid)
			return { key: { id: `sent-${jid}` } }
		}
	}
}

// Storage untuk BroadcastManager selalu in-memory; yang dipersist adalah
// file quarantine. registry dimatikan supaya test tidak menyalin file lain.
// Delay diset nol karena send() memakai config level manager, bukan opsi per
// panggilan — tanpa ini ada sleep nyata beberapa detik.
const makeManager = (sock: unknown, quarantine: string | null = quarantinePath) =>
	new CRMBroadcastManager(sock, new InMemoryStorage(), {
		registryPath: null,
		quarantinePath: quarantine,
		minDelayMs: 0,
		maxDelayMs: 0,
		newChatPenaltyMs: 0
	})

const fast = { minDelayMs: 0, maxDelayMs: 0 }

beforeEach(() => {
	jest.useFakeTimers({ doNotFake: ['setTimeout', 'setInterval', 'setImmediate'] })
	jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'furina-quarantine-'))
	quarantinePath = path.join(tmpDir, 'quarantine.json')
})

afterEach(() => {
	jest.useRealTimers()
	fs.rmSync(tmpDir, { recursive: true, force: true })
})

const readFile = (): Record<string, { at: number; code: number }> => {
	const parsed = JSON.parse(fs.readFileSync(quarantinePath, 'utf8'))
	return parsed.entries
}

describe('group quarantine on 403', () => {
	it('quarantines a group when the send fails with 403', async () => {
		const sock = makeSock({ members: [group(1)], failFor: [group(1)] })
		const manager = makeManager(sock)

		const result = await manager.sendToGroups([group(1)], 'halo', { ...fast, maxPerHour: 5 })

		expect(result.quarantined).toEqual([group(1)])
		expect(manager.getQuarantined()).toEqual([group(1)])
		expect(fs.existsSync(quarantinePath)).toBe(true)
	})

	it('does not persist quarantine for non-403 failures', async () => {
		const sock = makeSock({
			members: [group(1)],
			failFor: [group(1)]
		})
		// ganti error 403 dengan error biasa
		const failing = {
			...sock,
			async sendMessage(_jid: string) {
				throw new Error('boom 500')
			}
		}
		const manager = makeManager(failing)

		const result = await manager.sendToGroups([group(1)], 'halo', { ...fast, maxPerHour: 5 })

		expect(result.quarantined).toHaveLength(0)
		expect(manager.getQuarantined()).toEqual([])
		expect(fs.existsSync(quarantinePath)).toBe(false)
	})

	it('stores only jid, timestamp and code — no raw payload', async () => {
		const sock = makeSock({ members: [group(1)], failFor: [group(1)] })
		const manager = makeManager(sock)

		await manager.sendToGroups([group(1)], 'halo', { ...fast, maxPerHour: 5 })

		const entries = readFile()
		expect(Object.keys(entries)).toEqual([group(1)])
		expect(entries[group(1)]?.code).toBe(403)
		expect(typeof entries[group(1)]?.at).toBe('number')

		const raw = fs.readFileSync(quarantinePath, 'utf8')
		expect(raw).not.toContain('boom')
		expect(raw).not.toContain('stack')
	})

	it('a new manager with the same file reloads quarantine and skips the group', async () => {
		const sock1 = makeSock({ members: [group(1)], failFor: [group(1)] })
		await makeManager(sock1).sendToGroups([group(1)], 'halo', { ...fast, maxPerHour: 5 })

		// manager baru, sock baru yang TIDAK gagal — group tetap harus dilewati
		const sock2 = makeSock({ members: [group(1), group(2)] })
		const revived = makeManager(sock2)
		const result = await revived.sendToGroups([group(1), group(2)], 'halo', {
			...fast,
			maxPerHour: 5
		})

		expect(revived.getQuarantined()).toEqual([group(1)])
		expect(result.sentCount).toBe(1)
		expect(sock2.sent).toEqual([group(2)])
		expect(result.warnings.some(w => w.includes('d ikarantina'.replace(' ', '')))).toBe(true)
	})

	it('does not charge a rate limit slot for a quarantined group', async () => {
		const sock1 = makeSock({ members: [group(1)], failFor: [group(1)] })
		await makeManager(sock1).sendToGroups([group(1)], 'halo', { ...fast, maxPerHour: 5 })

		const sock2 = makeSock({ members: [group(1), group(2), group(3)] })
		const result = await makeManager(sock2).sendToGroups(
			[group(1), group(2), group(3)],
			'halo',
			{ ...fast, maxPerHour: 2 }
		)

		// group(1) dilewati tanpa memakai slot, jadi 2 slot untuk group 2 dan 3
		expect(result.status).toBe('completed')
		expect(result.sentCount).toBe(2)
	})

	it('a manager with a different file does not inherit quarantine', async () => {
		const sock1 = makeSock({ members: [group(1)], failFor: [group(1)] })
		await makeManager(sock1).sendToGroups([group(1)], 'halo', { ...fast, maxPerHour: 5 })

		const otherPath = path.join(tmpDir, 'other.json')
		const sock2 = makeSock({ members: [group(1)] })
		const isolated = makeManager(sock2, otherPath)

		expect(isolated.getQuarantined()).toEqual([])

		const result = await isolated.sendToGroups([group(1)], 'halo', { ...fast, maxPerHour: 5 })
		expect(result.sentCount).toBe(1)
		expect(sock2.sent).toEqual([group(1)])
	})

	it('keeps one entry per group when the same 403 repeats', async () => {
		const sock = makeSock({ members: [group(1)], failFor: [group(1)] })
		const manager = makeManager(sock)

		await manager.sendToGroups([group(1)], 'halo', { ...fast, maxPerHour: 5 })

		// paksa group dikirim ulang dengan mengosongkan quarantine di memori
		manager.clearQuarantine(group(1))
		fs.rmSync(quarantinePath, { force: true })
		await manager.sendToGroups([group(1)], 'halo', { ...fast, maxPerHour: 5 })

		expect(manager.getQuarantined()).toEqual([group(1)])
		expect(Object.keys(readFile())).toEqual([group(1)])
	})

	it('quarantine has no TTL: it stays skipped until cleared', async () => {
		const sock = makeSock({ members: [group(1)], failFor: [group(1)] })
		await makeManager(sock).sendToGroups([group(1)], 'halo', { ...fast, maxPerHour: 5 })

		// lompat jauh ke depan, tidak ada TTL yang melepas ini
		jest.setSystemTime(new Date(Date.now() + 24 * 3_600_000))

		const sock2 = makeSock({ members: [group(1)] })
		const revived = makeManager(sock2)
		const result = await revived.sendToGroups([group(1)], 'halo', { ...fast, maxPerHour: 5 })

		expect(revived.getQuarantined()).toEqual([group(1)])
		expect(result.sentCount).toBe(0)
		expect(sock2.sent).toEqual([])
	})

	it('clearQuarantine removes the persisted entry', async () => {
		const sock = makeSock({ members: [group(1)], failFor: [group(1)] })
		const manager = makeManager(sock)
		await manager.sendToGroups([group(1)], 'halo', { ...fast, maxPerHour: 5 })
		expect(manager.getQuarantined()).toEqual([group(1)])

		manager.clearQuarantine(group(1))

		expect(manager.getQuarantined()).toEqual([])
		expect(readFile()).toEqual({})

		// manager baru tidak lagi menyaring group tersebut
		const sock2 = makeSock({ members: [group(1)] })
		const revived = makeManager(sock2)
		expect(revived.getQuarantined()).toEqual([])
		const result = await revived.sendToGroups([group(1)], 'halo', { ...fast, maxPerHour: 5 })
		expect(result.sentCount).toBe(1)
	})

	it('clearQuarantine() without argument empties everything', async () => {
		const sock = makeSock({
			members: [group(1), group(2)],
			failFor: [group(1), group(2)]
		})
		const manager = makeManager(sock)
		await manager.sendToGroups([group(1), group(2)], 'halo', { ...fast, maxPerHour: 5 })
		expect(manager.getQuarantined()).toHaveLength(2)

		manager.clearQuarantine()

		expect(manager.getQuarantined()).toEqual([])
		expect(readFile()).toEqual({})
	})

	it('canonicalizes JID so the same group is never stored twice', async () => {
		// Bentuk device-suffixed dari JID grup harus tetap satu entry.
		const weird = `${group(1).split('@')[0]}:7@g.us`
		const sock = makeSock({ members: [group(1)], failFor: [group(1)] })
		const manager = makeManager(sock)

		await manager.sendToGroups([group(1)], 'halo', { ...fast, maxPerHour: 5 })

		// hanya bentuk kanonik yang tersimpan
		expect(manager.getQuarantined()).toEqual([group(1)])
		expect(manager.getQuarantined()).not.toContain(weird)

		// varian JID lain ikut dianggap grup yang sama saat dicek
		const sock2 = makeSock({ members: [weird] })
		const revived = makeManager(sock2)
		const result = await revived.sendToGroups([weird], 'halo', { ...fast, maxPerHour: 5 })
		expect(result.sentCount).toBe(0)

		// dan varian itu juga cukup untuk membuka quarantine
		manager.clearQuarantine(weird)
		expect(manager.getQuarantined()).toEqual([])
		expect(readFile()).toEqual({})
	})

	it('quarantines personal broadcast recipients too', async () => {
		const sock = {
			async sendMessage(_jid: string) {
				throw forbidden('customer')
			}
		}
		const storage = new InMemoryStorage()
		await storage.saveCustomer({
			jid: customer(1),
			lid: null,
			pn: null,
			pushname: null,
			status: 'active',
			tags: [],
			metadata: {},
			firstSeen: Date.now(),
			lastSeen: Date.now(),
			messageCount: 0,
			createdAt: Date.now(),
			updatedAt: Date.now()
		})

		const manager = new CRMBroadcastManager(sock, storage, {
			registryPath: null,
			quarantinePath,
			minDelayMs: 0,
			maxDelayMs: 0,
			newChatPenaltyMs: 0
		})
		const result = await manager.send({}, 'halo')

		expect(result.quarantined).toEqual([customer(1)])
		expect(manager.getQuarantined()).toEqual([customer(1)])
		expect(Object.keys(readFile())).toEqual([customer(1)])
	})
})

describe('BroadcastQuarantineStore durability', () => {
	it('rejects a file with an unknown version instead of reading it partially', () => {
		fs.writeFileSync(quarantinePath, JSON.stringify({ version: 99, entries: { [group(1)]: { at: 1, code: 403 } } }))

		const store = new BroadcastQuarantineStore(quarantinePath)

		expect(store.list()).toEqual([])
	})

	it('starts empty when the file is corrupt', () => {
		fs.writeFileSync(quarantinePath, '{ this is not json')

		const store = new BroadcastQuarantineStore(quarantinePath)

		expect(store.list()).toEqual([])
		expect(store.size).toBe(0)
	})

	it('skips entries whose timestamp is not a number', () => {
		fs.writeFileSync(
			quarantinePath,
			JSON.stringify({ version: 1, entries: { [group(1)]: { at: 'nope', code: 403 } } })
		)

		const store = new BroadcastQuarantineStore(quarantinePath)

		expect(store.list()).toEqual([])
	})

	it('keeps working in memory when the file cannot be written', () => {
		// path menunjuk direktori, jadi writeFileSync pasti gagal
		const store = new BroadcastQuarantineStore(tmpDir)

		const saved = store.add(group(1), 403)

		expect(saved).toBe(false)
		// state tetap di memori walau gagal disimpan
		expect(store.has(group(1))).toBe(true)
		expect(store.list()).toEqual([group(1)])
	})

	it('add is idempotent for the same code', () => {
		const store = new BroadcastQuarantineStore(quarantinePath)

		expect(store.add(group(1), 403)).toBe(true)
		expect(store.add(group(1), 403)).toBe(true)

		expect(store.size).toBe(1)
		expect(store.get(group(1))?.code).toBe(403)
	})

	it('remove and clear keep the file in sync', () => {
		const store = new BroadcastQuarantineStore(quarantinePath)
		store.add(group(1), 403)
		store.add(group(2), 403)

		expect(store.remove(group(1))).toBe(true)
		expect(readFile()).toEqual({ [group(2)]: expect.objectContaining({ code: 403 }) })

		store.clear()
		expect(readFile()).toEqual({})
		expect(store.size).toBe(0)
	})

	it('exposes a stable default file name', () => {
		expect(DEFAULT_QUARANTINE_FILE).toBe('furina-broadcast-quarantine.json')
	})
})