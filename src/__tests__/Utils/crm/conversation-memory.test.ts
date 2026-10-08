import { InMemoryStorage, resolveMessageLimit } from '../../../Utils/crm/storage/memory'
import type { CRMMessage } from '../../../Utils/crm/types'
import { CRMManager } from '../../../Utils/crm/manager'

const CUSTOMER_A = '628111111111@s.whatsapp.net'
const CUSTOMER_B = '628222222222@s.whatsapp.net'

const makeMessage = (customerJid: string, id: string): CRMMessage => ({
	id,
	customerJid,
	groupJid: null,
	direction: 'in',
	content: id,
	messageType: 'conversation',
	timestamp: 1700000000000,
	interactiveSubType: null,
	unwrappedFrom: null,
	isInternal: false
})

const save = async (
	storage: InMemoryStorage,
	customerJid: string,
	ids: string[]
): Promise<void> => {
	for (const id of ids) {
		await storage.saveMessage(makeMessage(customerJid, id))
	}
}

const idsOf = (messages: CRMMessage[]): string[] => messages.map(m => m.id)

describe('resolveMessageLimit', () => {
	it('treats undefined and Infinity as "no limit"', () => {
		expect(resolveMessageLimit(undefined)).toBeUndefined()
		expect(resolveMessageLimit(Infinity)).toBeUndefined()
	})

	it('keeps a valid positive limit as-is', () => {
		expect(resolveMessageLimit(100)).toBe(100)
		expect(resolveMessageLimit(1)).toBe(1)
	})

	it('clamps invalid values to 0 so memory stays bounded', () => {
		expect(resolveMessageLimit(0)).toBe(0)
		expect(resolveMessageLimit(-5)).toBe(0)
		expect(resolveMessageLimit(Number.NaN)).toBe(0)
		expect(resolveMessageLimit(-Infinity)).toBe(0)
		expect(resolveMessageLimit('100' as unknown)).toBe(0)
		expect(resolveMessageLimit(null as unknown)).toBe(0)
	})

	it('floors a fractional limit so it never exceeds the request', () => {
		expect(resolveMessageLimit(2.7)).toBe(2)
	})
})

describe('InMemoryStorage conversation history bound', () => {
	it('keeps every message while under the limit', async () => {
		const storage = new InMemoryStorage({ maxConversationHistory: 5 })
		await save(storage, CUSTOMER_A, ['m1', 'm2', 'm3'])

		expect(idsOf(await storage.getConversation(CUSTOMER_A))).toEqual(['m1', 'm2', 'm3'])
	})

	it('keeps only the newest N messages once the limit is exceeded', async () => {
		const storage = new InMemoryStorage({ maxConversationHistory: 3 })
		await save(storage, CUSTOMER_A, ['m1', 'm2', 'm3', 'm4', 'm5'])

		expect(idsOf(await storage.getConversation(CUSTOMER_A))).toEqual(['m3', 'm4', 'm5'])
	})

	it('never exceeds the limit across repeated additions', async () => {
		const storage = new InMemoryStorage({ maxConversationHistory: 4 })

		for (let i = 1; i <= 25; i++) {
			await storage.saveMessage(makeMessage(CUSTOMER_A, `m${i}`))
			const current = await storage.getConversation(CUSTOMER_A)
			expect(current.length).toBeLessThanOrEqual(4)
		}

		expect(idsOf(await storage.getConversation(CUSTOMER_A))).toEqual([
			'm22',
			'm23',
			'm24',
			'm25'
		])
	})

	it('preserves chronological order of the newest messages', async () => {
		const storage = new InMemoryStorage({ maxConversationHistory: 2 })
		await save(storage, CUSTOMER_A, ['first', 'second', 'third', 'fourth'])

		expect(idsOf(await storage.getConversation(CUSTOMER_A))).toEqual(['third', 'fourth'])
	})

	it('applies the limit per conversation key without cross-talk', async () => {
		const storage = new InMemoryStorage({ maxConversationHistory: 2 })
		await save(storage, CUSTOMER_A, ['a1', 'a2', 'a3'])
		await save(storage, CUSTOMER_B, ['b1', 'b2', 'b3', 'b4'])

		expect(idsOf(await storage.getConversation(CUSTOMER_A))).toEqual(['a2', 'a3'])
		expect(idsOf(await storage.getConversation(CUSTOMER_B))).toEqual(['b3', 'b4'])
	})

	it('stays unbounded when no limit is configured (existing default behavior)', async () => {
		const storage = new InMemoryStorage()
		const many = Array.from({ length: 30 }, (_, i) => `m${i}`)
		await save(storage, CUSTOMER_A, many)

		expect(await storage.getConversation(CUSTOMER_A)).toHaveLength(30)
	})

	it('treats an explicit undefined limit as unbounded', async () => {
		const storage = new InMemoryStorage({ maxConversationHistory: undefined })
		await save(storage, CUSTOMER_A, ['m1', 'm2', 'm3'])

		expect(await storage.getConversation(CUSTOMER_A)).toHaveLength(3)
	})

	it('stores nothing when the limit resolves to 0', async () => {
		const storage = new InMemoryStorage({ maxConversationHistory: 0 })
		await save(storage, CUSTOMER_A, ['m1', 'm2', 'm3'])

		expect(await storage.getConversation(CUSTOMER_A)).toHaveLength(0)
	})

	it('a read snapshot cannot push internal history past the limit', async () => {
		const storage = new InMemoryStorage({ maxConversationHistory: 3 })
		await save(storage, CUSTOMER_A, ['m1', 'm2', 'm3'])

		// snapshot yang dimodifikasi caller tidak boleh memengaruhi state internal
		const snapshot = await storage.getConversation(CUSTOMER_A)
		snapshot.push(makeMessage(CUSTOMER_A, 'injected'))
		snapshot.splice(0, snapshot.length)

		expect(await storage.getConversation(CUSTOMER_A)).toHaveLength(3)

		// snapshot ke-2 juga harus tetap snapshot, bukan reference internal
		const second = await storage.getConversation(CUSTOMER_A)
		second.length = 0
		expect(await storage.getConversation(CUSTOMER_A)).toHaveLength(3)
	})

	it('getMessages limit argument still slices the newest messages', async () => {
		const storage = new InMemoryStorage({ maxConversationHistory: 10 })
		await save(storage, CUSTOMER_A, ['m1', 'm2', 'm3', 'm4'])

		expect(idsOf(await storage.getMessages(CUSTOMER_A, 2))).toEqual(['m3', 'm4'])
	})

	it('analytics totalMessages reflects retained messages, not unbounded growth', async () => {
		const storage = new InMemoryStorage({ maxConversationHistory: 2 })
		await save(storage, CUSTOMER_A, ['m1', 'm2', 'm3', 'm4'])

		expect((await storage.getAnalytics()).totalMessages).toBe(2)
	})
})

describe('CRMManager wires maxConversationHistory into the default storage', () => {
	const makeCRM = (config?: { maxConversationHistory?: number }) =>
		new CRMManager({ ev: { on: () => {} } }, config)

	// Lewat API publik CRMManager, bukan menyentuh field private.
	const trackMany = async (
		crm: CRMManager,
		customerJid: string,
		count: number
	): Promise<void> => {
		for (let i = 0; i < count; i++) {
			await crm.conversation.trackMessage(customerJid, `msg-${i}`, { direction: 'in' })
		}
	}

	it('uses its documented default of 100 per customer', async () => {
		const crm = makeCRM()
		await trackMany(crm, CUSTOMER_A, 120)

		const stored = await crm.conversation.getConversation(CUSTOMER_A)
		expect(stored).toHaveLength(100)
		// 20 pesan pertama sudah terbuang, sisanya 100 terbaru
		expect(stored[0]?.content).toBe('msg-20')
		expect(stored[99]?.content).toBe('msg-119')
	})

	it('honours an explicit maxConversationHistory from config', async () => {
		const crm = makeCRM({ maxConversationHistory: 5 })
		await trackMany(crm, CUSTOMER_A, 6)

		const stored = await crm.conversation.getConversation(CUSTOMER_A)
		expect(stored.map(m => m.content)).toEqual([
			'msg-1',
			'msg-2',
			'msg-3',
			'msg-4',
			'msg-5'
		])
	})
})