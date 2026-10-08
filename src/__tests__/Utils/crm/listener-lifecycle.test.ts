import { EventEmitter } from 'node:events'
import { CRMManager } from '../../../Utils/crm/manager'
import { InMemoryStorage } from '../../../Utils/crm/storage/memory'

// Mock sock: EventEmitter asli supaya listenerCount jadi sumber kebenaran.
const makeSock = () => {
	const ev = new EventEmitter()
	return { ev }
}

const makeCRM = (sock: ReturnType<typeof makeSock>) => {
	const storage = new InMemoryStorage()
	return { crm: new CRMManager(sock, { storage }), storage }
}

const upsert = (participant: string) => ({
	messages: [
		{
			key: { id: `id-${participant}`, remoteJid: participant, participant, fromMe: false },
			message: { conversation: 'halo' },
			messageTimestamp: 1700000000
		}
	]
})

// Tracker CRM melakukan rantai promise tanpa await di dalam listener, jadi
// flush antrean task sebelum membaca storage.
const flush = () => new Promise(resolve => setImmediate(resolve))

describe('CRMManager listener lifecycle', () => {
	it('attaches exactly one messages.upsert listener', () => {
		const sock = makeSock()
		makeCRM(sock)

		expect(sock.ev.listenerCount('messages.upsert')).toBe(1)
	})

	it('does not attach a listener when auto-tracking is disabled', () => {
		const sock = makeSock()
		const storage = new InMemoryStorage()
		new CRMManager(sock, { storage, autoTrackMessages: false, autoTrackActivities: false })

		expect(sock.ev.listenerCount('messages.upsert')).toBe(0)
	})

	it('dispose() removes the listener it attached', () => {
		const sock = makeSock()
		const { crm } = makeCRM(sock)

		crm.dispose()

		expect(sock.ev.listenerCount('messages.upsert')).toBe(0)
		expect(crm.isDisposed).toBe(true)
	})

	it('stops processing events after dispose()', async () => {
		const sock = makeSock()
		const { crm, storage } = makeCRM(sock)

		// event normal: harus tercatat
		sock.ev.emit('messages.upsert', upsert('628111111111@s.whatsapp.net'))
		await flush()
		expect(await storage.listCustomers()).toHaveLength(1)

		crm.dispose()

		// event setelah dispose: tidak boleh tersentuh storage
		sock.ev.emit('messages.upsert', upsert('628222222222@s.whatsapp.net'))
		await flush()

		const customers = await storage.listCustomers()
		expect(customers).toHaveLength(1)
		expect(customers[0]?.jid).toBe('628111111111@s.whatsapp.net')
	})

	it('is idempotent: calling dispose() twice is safe', () => {
		const sock = makeSock()
		const { crm } = makeCRM(sock)

		crm.dispose()
		expect(() => crm.dispose()).not.toThrow()
		expect(() => crm.dispose()).not.toThrow()
		expect(sock.ev.listenerCount('messages.upsert')).toBe(0)
	})

	it('close() also releases the listener', async () => {
		const sock = makeSock()
		const { crm } = makeCRM(sock)

		await crm.close()

		expect(sock.ev.listenerCount('messages.upsert')).toBe(0)
		expect(crm.isDisposed).toBe(true)
	})

	it('leaves listeners owned by other code untouched', () => {
		const sock = makeSock()
		const external = (): void => {}
		const externalTwice = (): void => {}
		sock.ev.on('messages.upsert', external)
		sock.ev.on('messages.upsert', externalTwice)
		sock.ev.on('connection.update', external)

		const { crm } = makeCRM(sock)
		expect(sock.ev.listenerCount('messages.upsert')).toBe(3)

		crm.dispose()

		// hanya handler CRM yang hilang
		expect(sock.ev.listenerCount('messages.upsert')).toBe(2)
		expect(sock.ev.listeners('messages.upsert')).toEqual([external, externalTwice])
		expect(sock.ev.listenerCount('connection.update')).toBe(1)
	})

	it('disposing one instance does not release another instance listener', () => {
		const sock = makeSock()
		const { crm: first } = makeCRM(sock)
		const { crm: second } = makeCRM(sock)
		expect(sock.ev.listenerCount('messages.upsert')).toBe(2)

		first.dispose()

		expect(sock.ev.listenerCount('messages.upsert')).toBe(1)
		expect(first.isDisposed).toBe(true)
		expect(second.isDisposed).toBe(false)

		second.dispose()
		expect(sock.ev.listenerCount('messages.upsert')).toBe(0)
	})

	it('does not process an event exactly once when two managers share a socket', async () => {
		const sock = makeSock()
		const { storage: firstStorage } = makeCRM(sock)
		const { storage: secondStorage } = makeCRM(sock)

		sock.ev.emit('messages.upsert', upsert('628333333333@s.whatsapp.net'))
		await flush()

		// tiap manager punya storage sendiri, masing-masing harus dapat 1 record
		expect(await firstStorage.listCustomers()).toHaveLength(1)
		expect(await secondStorage.listCustomers()).toHaveLength(1)
	})

	it('a replaced manager does not double-process the same event', async () => {
		const sock = makeSock()
		const storage = new InMemoryStorage()

		// simulasi reconnect: manager lama dibuang, baru dibuat
		const stale = new CRMManager(sock, { storage })
		stale.dispose()
		const fresh = new CRMManager(sock, { storage })
		expect(sock.ev.listenerCount('messages.upsert')).toBe(1)

		sock.ev.emit('messages.upsert', upsert('628444444444@s.whatsapp.net'))
		await flush()

		const customers = await storage.listCustomers()
		expect(customers).toHaveLength(1)
		expect(fresh.isDisposed).toBe(false)
	})
})
