import { CRMManager } from '../../../Utils/crm/manager'
import { InMemoryStorage } from '../../../Utils/crm/storage/memory'
import { filterSegment, validateSegment } from '../../../Utils/crm/broadcast/segment'
import type { CRMCustomer } from '../../../Utils/crm/types'

// Dua device JID dari user yang sama. WhatsApp merotasi device suffix,
// jadi keduanya sering nyantol di event yang berbeda.
const DEVICE_12 = '628123456789:12@s.whatsapp.net'
const DEVICE_34 = '628123456789:34@s.whatsapp.net'
const CANONICAL = '628123456789@s.whatsapp.net'

const makeCustomer = (jid: string, overrides: Partial<CRMCustomer> = {}): CRMCustomer => ({
	jid,
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
	updatedAt: Date.now(),
	...overrides
})

const makeMessage = (participant: string) => ({
	key: { id: `id-${participant}`, remoteJid: participant, participant, fromMe: false },
	message: { conversation: 'halo' },
	messageTimestamp: 1700000000
})

// CRMManager melakukan tracking lewat rantai promise yang tidak di-await di
// dalam listener, jadi flush antrean microtask/task sebelum membaca storage.
const flush = () => new Promise(resolve => setImmediate(resolve))

const makeCRM = () => {
	const handlers: Record<string, (payload: any) => void> = {}
	const sock = {
		ev: {
			on: (event: string, handler: any) => {
				handlers[event] = handler
			}
		}
	}
	const storage = new InMemoryStorage()
	const crm = new CRMManager(sock, { storage })
	return { crm, storage, handlers }
}

describe('CRMManager messages.upsert boundary', () => {
	it('treats two device JIDs of the same user as ONE customer', async () => {
		const { storage, handlers } = makeCRM()

		handlers['messages.upsert']?.({ messages: [makeMessage(DEVICE_12)] })
		await flush()
		handlers['messages.upsert']?.({ messages: [makeMessage(DEVICE_34)] })
		await flush()

		const customers = await storage.listCustomers()
		expect(customers).toHaveLength(1)
		expect(customers[0]?.jid).toBe(CANONICAL)
	})

	it('files both device messages under the same canonical customer', async () => {
		const { storage, handlers } = makeCRM()

		handlers['messages.upsert']?.({ messages: [makeMessage(DEVICE_12)] })
		await flush()
		handlers['messages.upsert']?.({ messages: [makeMessage(DEVICE_34)] })
		await flush()

		expect(await storage.getMessages(CANONICAL)).toHaveLength(2)
		expect(await storage.getMessages(DEVICE_12)).toHaveLength(0)
		expect(await storage.getMessages(DEVICE_34)).toHaveLength(0)
	})
})

describe('filterSegment recipient dedupe', () => {
	it('sends one message per human, not per device-suffixed record', () => {
		const recipients = filterSegment([makeCustomer(DEVICE_12), makeCustomer(DEVICE_34)], {})
		expect(recipients).toHaveLength(1)
	})

	it('keeps distinct users as distinct recipients', () => {
		const customers = [
			makeCustomer(DEVICE_12),
			makeCustomer(DEVICE_34),
			makeCustomer('628999999999:1@s.whatsapp.net')
		]
		expect(filterSegment(customers, {})).toHaveLength(2)
	})

	it('does not merge the LID and PN JIDs of the same human', () => {
		const customers = [
			makeCustomer('111222333444@lid'),
			makeCustomer('111222333444@s.whatsapp.net')
		]
		expect(filterSegment(customers, {})).toHaveLength(2)
	})

	it('reports the deduplicated count in validateSegment', () => {
		const customers = [
			makeCustomer(DEVICE_12, { tags: ['vip'] }),
			makeCustomer(DEVICE_34, { tags: ['vip'] })
		]
		expect(validateSegment(customers, { tags: ['vip'] }).recipientCount).toBe(1)
	})

	it('still excludes blocked customers, and does not let them claim the slot', () => {
		const customers = [
			makeCustomer(DEVICE_12, { status: 'blocked' }),
			makeCustomer(DEVICE_34)
		]
		const recipients = filterSegment(customers, {})
		expect(recipients).toHaveLength(1)
		expect(recipients[0]?.jid).toBe(DEVICE_34)
	})

	it('leaves group, status and broadcast JIDs untouched', () => {
		const group = '1234567890-1234567891@g.us'
		const recipients = filterSegment(
			[makeCustomer(group), makeCustomer('status@broadcast')],
			{}
		)
		expect(recipients.map(c => c.jid)).toEqual([group, 'status@broadcast'])
	})
})

describe('canonical JID fallback', () => {
	// Kalau helper kanonik KBALIK string kosong untuk JID rusak, key customer
	// jadi kosong dan semua orang menyatu jadi satu record. Test ini penaganya.
	it('keeps the raw JID when it cannot be decoded', () => {
		const malformed = 'bukan-jid'
		expect(filterSegment([makeCustomer(malformed), makeCustomer(malformed)], {})).toHaveLength(1)
	})

	it('does not collapse undecodable JIDs together with a valid one', () => {
		const recipients = filterSegment(
			[makeCustomer('bukan-jid'), makeCustomer(DEVICE_12)],
			{}
		)
		expect(recipients).toHaveLength(2)
	})
})
