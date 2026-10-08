import { jest } from '@jest/globals'
import { EventEmitter } from 'node:events'
import { CRMBroadcastManager } from '../../../../Utils/crm/broadcast/manager'
import { CRMDeliveryTracker } from '../../../../Utils/crm/broadcast/tracker'
import { InMemoryStorage } from '../../../../Utils/crm/storage/memory'

// EventEmitter asli supaya listenerCount jadi sumber kebenaran, dan
// listeners() bisa dipakai untuk membuktikan urutan handler lain utuh.
const makeSock = () => ({ ev: new EventEmitter() })

const makeManager = (sock: ReturnType<typeof makeSock>) =>
	new CRMBroadcastManager(sock, new InMemoryStorage(), { registryPath: null })

const closeUpdate = (statusCode: number) => ({
	connection: 'close',
	lastDisconnect: { error: { output: { statusCode } } }
})

const deliveryUpdate = (id: string, status: number) => ({
	key: { id },
	update: { status }
})

const flush = () => new Promise(resolve => setImmediate(resolve))

beforeEach(() => {
	// Palsukan timer supaya setInterval 60s di tracker tidak membuka handle
	// sungguhan. setImmediate dibiarkan asli untuk flush antrean promise.
	jest.useFakeTimers({ doNotFake: ['setImmediate'] })
})

afterEach(() => {
	jest.useRealTimers()
})

describe('CRMBroadcastManager listener lifecycle', () => {
	it('attaches exactly one connection.update listener', () => {
		const sock = makeSock()
		makeManager(sock)

		expect(sock.ev.listenerCount('connection.update')).toBe(1)
	})

	it('dispose() releases its connection.update listener', () => {
		const sock = makeSock()
		const manager = makeManager(sock)

		manager.dispose()

		expect(sock.ev.listenerCount('connection.update')).toBe(0)
		expect(manager.isDisposed).toBe(true)
	})

	it('dispose() is idempotent', () => {
		const sock = makeSock()
		const manager = makeManager(sock)

		manager.dispose()
		expect(() => manager.dispose()).not.toThrow()
		expect(() => manager.dispose()).not.toThrow()
		expect(sock.ev.listenerCount('connection.update')).toBe(0)
	})

	it('processes connection.update while alive', () => {
		const sock = makeSock()
		const manager = makeManager(sock)

		expect(manager.health.isPermanentStop()).toBe(false)
		sock.ev.emit('connection.update', closeUpdate(401))

		// 401 = loggedOut/ban, health harus permanent stop
		expect(manager.health.isPermanentStop()).toBe(true)
	})

	it('ignores connection.update after dispose()', () => {
		const sock = makeSock()
		const manager = makeManager(sock)

		manager.dispose()
		sock.ev.emit('connection.update', closeUpdate(401))

		expect(manager.health.isPermanentStop()).toBe(false)
	})

	it('leaves listeners owned by other code and other events untouched', () => {
		const sock = makeSock()
		const onUpsert = (): void => {}
		const onDisconnect = (): void => {}
		sock.ev.on('messages.upsert', onUpsert)
		sock.ev.on('connection.update', onDisconnect)

		const manager = makeManager(sock)
		expect(sock.ev.listenerCount('connection.update')).toBe(2)

		manager.dispose()

		expect(sock.ev.listeners('connection.update')).toEqual([onDisconnect])
		expect(sock.ev.listenerCount('messages.upsert')).toBe(1)
	})

	it('disposing one manager does not release another manager listener', () => {
		const sock = makeSock()
		const first = makeManager(sock)
		const second = makeManager(sock)
		expect(sock.ev.listenerCount('connection.update')).toBe(2)

		first.dispose()

		expect(sock.ev.listenerCount('connection.update')).toBe(1)
		expect(second.isDisposed).toBe(false)

		second.dispose()
		expect(sock.ev.listenerCount('connection.update')).toBe(0)
	})

	it('dispose() also disposes the tracker it owns', () => {
		const sock = makeSock()
		const manager = makeManager(sock)

		// manager membuat tracker-nya sendiri di constructor
		expect(sock.ev.listenerCount('messages.update')).toBe(1)

		manager.dispose()

		expect(sock.ev.listenerCount('messages.update')).toBe(0)
		expect(sock.ev.listenerCount('connection.update')).toBe(0)
	})

	it('a replaced manager stops processing while the new one works once', () => {
		const sock = makeSock()
		const stale = makeManager(sock)
		stale.dispose()
		const fresh = makeManager(sock)

		expect(sock.ev.listenerCount('connection.update')).toBe(1)

		sock.ev.emit('connection.update', closeUpdate(401))

		expect(stale.health.isPermanentStop()).toBe(false)
		expect(fresh.health.isPermanentStop()).toBe(true)
	})
})

describe('CRMDeliveryTracker listener lifecycle', () => {
	it('attaches exactly one messages.update listener on construction', () => {
		const sock = makeSock()
		const tracker = new CRMDeliveryTracker(sock)

		expect(sock.ev.listenerCount('messages.update')).toBe(1)
		tracker.dispose()
	})

	it('attach() twice does not register the handler twice', () => {
		const sock = makeSock()
		const tracker = new CRMDeliveryTracker(sock)

		// constructor sudah auto-attach; attach() lagi harus no-op
		tracker.attach()
		tracker.attach()

		expect(sock.ev.listenerCount('messages.update')).toBe(1)
		tracker.dispose()
	})

	it('updates a tracked message exactly once per delivery event', () => {
		const sock = makeSock()
		const tracker = new CRMDeliveryTracker(sock)
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')

		sock.ev.emit('messages.update', [deliveryUpdate('msg-1', 3)])

		expect(tracker.getRecord('msg-1')?.status).toBe('delivered')
		tracker.dispose()
	})

	it('dispose() releases its messages.update listener', () => {
		const sock = makeSock()
		const tracker = new CRMDeliveryTracker(sock)

		tracker.dispose()

		expect(sock.ev.listenerCount('messages.update')).toBe(0)
	})

	it('dispose() is idempotent', () => {
		const sock = makeSock()
		const tracker = new CRMDeliveryTracker(sock)

		tracker.dispose()
		expect(() => tracker.dispose()).not.toThrow()
		expect(sock.ev.listenerCount('messages.update')).toBe(0)
	})

	it('stops processing messages.update after dispose()', async () => {
		const sock = makeSock()
		const tracker = new CRMDeliveryTracker(sock)
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')

		tracker.dispose()
		sock.ev.emit('messages.update', [deliveryUpdate('msg-1', 4)])
		await flush()

		// records dibuang saat dispose, dan listener sudah lepas
		expect(tracker.getRecord('msg-1')).toBeNull()
		expect(sock.ev.listenerCount('messages.update')).toBe(0)
	})

	it('does not resurrect its listener when attach() is called after dispose()', () => {
		const sock = makeSock()
		const tracker = new CRMDeliveryTracker(sock)

		tracker.dispose()
		tracker.attach()

		expect(sock.ev.listenerCount('messages.update')).toBe(0)
	})

	it('leaves external messages.update listeners untouched', () => {
		const sock = makeSock()
		const external = (): void => {}
		const externalTwice = (): void => {}
		sock.ev.on('messages.update', external)
		sock.ev.on('messages.update', externalTwice)

		const tracker = new CRMDeliveryTracker(sock)
		expect(sock.ev.listenerCount('messages.update')).toBe(3)

		tracker.dispose()

		expect(sock.ev.listeners('messages.update')).toEqual([external, externalTwice])
	})

	it('disposing one tracker does not release another tracker listener', () => {
		const sock = makeSock()
		const first = new CRMDeliveryTracker(sock)
		const second = new CRMDeliveryTracker(sock)
		expect(sock.ev.listenerCount('messages.update')).toBe(2)

		first.dispose()

		expect(sock.ev.listenerCount('messages.update')).toBe(1)

		// tracker yang tersisa masih berfungsi
		second.track('msg-2', '628@s.whatsapp.net', 'halo', 'halo')
		sock.ev.emit('messages.update', [deliveryUpdate('msg-2', 4)])
		expect(second.getRecord('msg-2')?.status).toBe('read')

		second.dispose()
		expect(sock.ev.listenerCount('messages.update')).toBe(0)
	})

	it('clear() resets records but keeps the listener attached', () => {
		const sock = makeSock()
		const tracker = new CRMDeliveryTracker(sock)
		tracker.track('msg-3', '628@s.whatsapp.net', 'halo', 'halo')

		tracker.clear()

		// clear() = reset antar campaign, bukan shutdown: listener tetap hidup
		expect(sock.ev.listenerCount('messages.update')).toBe(1)
		expect(tracker.getAllRecords()).toHaveLength(0)

		tracker.track('msg-4', '628@s.whatsapp.net', 'halo', 'halo')
		sock.ev.emit('messages.update', [deliveryUpdate('msg-4', 3)])
		expect(tracker.getRecord('msg-4')?.status).toBe('delivered')

		tracker.dispose()
	})

	it('a replaced tracker stops processing while the new one works', () => {
		const sock = makeSock()
		const stale = new CRMDeliveryTracker(sock)
		stale.track('msg-stale', '628@s.whatsapp.net', 'halo', 'halo')
		stale.dispose()

		const fresh = new CRMDeliveryTracker(sock)
		fresh.track('msg-fresh', '628@s.whatsapp.net', 'halo', 'halo')

		expect(sock.ev.listenerCount('messages.update')).toBe(1)

		sock.ev.emit('messages.update', [deliveryUpdate('msg-fresh', 3)])

		expect(fresh.getRecord('msg-fresh')?.status).toBe('delivered')
		expect(stale.getRecord('msg-stale')).toBeNull()
	})
})
