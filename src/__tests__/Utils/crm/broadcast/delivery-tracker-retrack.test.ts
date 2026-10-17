import { jest } from '@jest/globals'
import { EventEmitter } from 'node:events'
import { CRMDeliveryTracker } from '../../../../Utils/crm/broadcast/tracker'

// Status numeric Baileys: 0 ERROR, 2 SERVER_ACK, 3 DELIVERY_ACK, 4 READ.
const DELIVERY_ACK = 3
const READ = 4

const makeSock = () => ({ ev: new EventEmitter() })

const update = (id: string, status: number) => ({
	key: { id },
	update: { status }
})

let sock: ReturnType<typeof makeSock>
let tracker: CRMDeliveryTracker

beforeEach(() => {
	jest.useFakeTimers()
	jest.setSystemTime(new Date('2026-05-01T00:00:00.000Z'))
	sock = makeSock()
	tracker = new CRMDeliveryTracker(sock)
})

afterEach(() => {
	tracker.dispose()
	jest.useRealTimers()
})

describe('re-track untuk messageId yang sama', () => {
	it('track() pertama lalu messages.update read', () => {
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')
		expect(tracker.getRecord('msg-1')?.status).toBe('sent')

		sock.ev.emit('messages.update', [update('msg-1', READ)])

		expect(tracker.getRecord('msg-1')?.status).toBe('read')
		expect(tracker.getRecord('msg-1')?.readAt).not.toBeNull()
	})

	it('track() kedua tidak menghapus readAt maupun status', () => {
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')
		sock.ev.emit('messages.update', [update('msg-1', READ)])
		const readAt = tracker.getRecord('msg-1')?.readAt
		const deliveredAt = tracker.getRecord('msg-1')?.deliveredAt
		expect(tracker.getRecord('msg-1')?.status).toBe('read')

		// re-track dengan konten yang diperbarui
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo baru', 'halo baru')

		const after = tracker.getRecord('msg-1')
		expect(after?.status).toBe('read')
		expect(after?.readAt).toBe(readAt)
		expect(after?.deliveredAt).toBe(deliveredAt)
		// isi record tetap yang terbaru
		expect(after?.content).toBe('halo baru')
		expect(after?.personalizedContent).toBe('halo baru')
	})

	it('track() kedua tidak menghapus deliveredAt', () => {
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')
		sock.ev.emit('messages.update', [update('msg-1', DELIVERY_ACK)])
		const deliveredAt = tracker.getRecord('msg-1')?.deliveredAt
		expect(deliveredAt).not.toBeNull()

		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')

		expect(tracker.getRecord('msg-1')?.status).toBe('delivered')
		expect(tracker.getRecord('msg-1')?.deliveredAt).toBe(deliveredAt)
	})

	it('track() kedua tidak mengubah record pertama menjadi record terpisah', () => {
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')
		sock.ev.emit('messages.update', [update('msg-1', READ)])

		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')

		expect(tracker.getAllRecords()).toHaveLength(1)
	})

	it('track() kedua tidak pernah menurunkan status ke sent', () => {
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')
		sock.ev.emit('messages.update', [update('msg-1', READ)])

		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')

		expect(tracker.getRecord('msg-1')?.status).not.toBe('sent')
		expect(tracker.getRecord('msg-1')?.status).toBe('read')
	})

	it('re-track berkali-kali tetap monoton dan stabil', () => {
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')
		sock.ev.emit('messages.update', [update('msg-1', READ)])
		const readAt = tracker.getRecord('msg-1')?.readAt

		for (let i = 0; i < 5; i++) {
			tracker.track('msg-1', '628@s.whatsapp.net', `halo ${i}`, `halo ${i}`)
			expect(tracker.getRecord('msg-1')?.status).toBe('read')
			expect(tracker.getRecord('msg-1')?.readAt).toBe(readAt)
		}

		expect(tracker.getAllRecords()).toHaveLength(1)
	})

	it('track() untuk id berbeda tetap membuat record baru', () => {
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')
		sock.ev.emit('messages.update', [update('msg-1', READ)])

		tracker.track('msg-2', '628@s.whatsapp.net', 'halo', 'halo')

		expect(tracker.getAllRecords()).toHaveLength(2)
		expect(tracker.getRecord('msg-1')?.status).toBe('read')
		expect(tracker.getRecord('msg-2')?.status).toBe('sent')
	})

	it('re-track sebelum ada update apa pun tetap menghasilkan record sent', () => {
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')

		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')

		expect(tracker.getRecord('msg-1')?.status).toBe('sent')
		expect(tracker.getRecord('msg-1')?.readAt).toBeNull()
		expect(tracker.getRecord('msg-1')?.deliveredAt).toBeNull()
	})

	it('update yang tiba setelah re-track tetap ter-apply', () => {
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')

		sock.ev.emit('messages.update', [update('msg-1', DELIVERY_ACK)])

		expect(tracker.getRecord('msg-1')?.status).toBe('delivered')
	})

	it('statistik tetap benar setelah re-track', () => {
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')
		sock.ev.emit('messages.update', [update('msg-1', READ)])

		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')

		const stats = tracker.getStats()
		expect(stats.total).toBe(1)
		expect(stats.read).toBe(1)
		expect(stats.sent).toBe(0)
	})
})