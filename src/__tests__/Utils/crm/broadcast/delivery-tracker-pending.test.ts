import { jest } from '@jest/globals'
import { EventEmitter } from 'node:events'
import { CRMDeliveryTracker } from '../../../../Utils/crm/broadcast/tracker'

// Status numeric Baileys: 0 ERROR, 1 PENDING, 2 SERVER_ACK, 3 DELIVERY_ACK,
// 4 READ, 5 PLAYED.
const ERROR = 0
const SERVER_ACK = 2
const DELIVERY_ACK = 3
const READ = 4

const makeSock = () => ({ ev: new EventEmitter() })

const update = (id: string, status: number) => ({
	key: { id },
	update: { status }
})

// Lebarkan akses ke state internal supaya batas buffer bisa diverifikasi tanpa
// menambah API publik.
const pendingOf = (tracker: CRMDeliveryTracker): Map<string, number> =>
	(tracker as unknown as { pendingUpdates: Map<string, number> }).pendingUpdates

const pendingCount = (tracker: CRMDeliveryTracker): number => pendingOf(tracker).size

let sock: ReturnType<typeof makeSock>
let tracker: CRMDeliveryTracker

beforeEach(() => {
	jest.useFakeTimers()
	jest.setSystemTime(new Date('2026-04-01T00:00:00.000Z'))
	sock = makeSock()
	tracker = new CRMDeliveryTracker(sock)
})

afterEach(() => {
	tracker.dispose()
	jest.useRealTimers()
})

describe('delivery update yang arrive sebelum track()', () => {
	it('menyerap update yang datang lebih dulu lalu menerapkannya saat track()', () => {
		// Ini balapan yang motivatesi perubahan: update tiba sebelum
		// await sendMessage() selesai, jadi record-nya belum terdaftar.
		sock.ev.emit('messages.update', [update('msg-1', DELIVERY_ACK)])

		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')

		expect(tracker.getRecord('msg-1')?.status).toBe('delivered')
		expect(tracker.getRecord('msg-1')?.deliveredAt).not.toBeNull()
	})

	it('menerapkan status read yang tiba lebih awal', () => {
		sock.ev.emit('messages.update', [update('msg-1', READ)])

		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')

		expect(tracker.getRecord('msg-1')?.status).toBe('read')
		expect(tracker.getRecord('msg-1')?.readAt).not.toBeNull()
	})

	it('menerapkan status error yang tiba lebih awal', () => {
		sock.ev.emit('messages.update', [update('msg-1', ERROR)])

		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')

		expect(tracker.getRecord('msg-1')?.status).toBe('failed')
		expect(tracker.getRecord('msg-1')?.error).toBe('delivery error (status 0)')
	})

	it('membuang entri pending setelah diterapkan, tidak ada apply dua kali', () => {
		sock.ev.emit('messages.update', [update('msg-1', READ)])
		expect(pendingCount(tracker)).toBe(1)

		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')

		expect(pendingCount(tracker)).toBe(0)
		expect(tracker.getRecord('msg-1')?.status).toBe('read')

		// Pending yang sama tidak boleh ter-apply lagi di kemudian hari.
		const appliedAt = tracker.getRecord('msg-1')?.readAt
		tracker.track('msg-2', '628@s.whatsapp.net', 'halo', 'halo')
		expect(pendingCount(tracker)).toBe(0)
		expect(tracker.getRecord('msg-1')?.readAt).toBe(appliedAt)
	})

	it('menyerap beberapa update untuk messageId yang sama tanpa menambah entri', () => {
		sock.ev.emit('messages.update', [
			update('msg-1', SERVER_ACK),
			update('msg-1', DELIVERY_ACK),
			update('msg-1', SERVER_ACK)
		])

		// duplikat tidak menambah entri pending
		expect(pendingCount(tracker)).toBe(1)

		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')

		// yang disimpan adalah status paling maju, bukan yang terakhir
		expect(tracker.getRecord('msg-1')?.status).toBe('delivered')
	})

	it('tidak mengaplikasikan update pending ke messageId yang lain', () => {
		sock.ev.emit('messages.update', [update('msg-1', READ)])

		tracker.track('msg-2', '628@s.whatsapp.net', 'halo', 'halo')

		expect(tracker.getRecord('msg-2')?.status).toBe('sent')
		expect(pendingCount(tracker)).toBe(1)
	})
})

describe('delivery update yang arrive setelah track()', () => {
	it('menerapkan update seperti sebelumnya dan tidak menyentuh buffer', () => {
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')

		sock.ev.emit('messages.update', [update('msg-1', DELIVERY_ACK)])

		expect(tracker.getRecord('msg-1')?.status).toBe('delivered')
		expect(pendingCount(tracker)).toBe(0)
	})

	it('track() tanpa update pending tetap berstatus sent', () => {
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')

		expect(tracker.getRecord('msg-1')?.status).toBe('sent')
		expect(pendingCount(tracker)).toBe(0)
	})
})

describe('batas buffer pending', () => {
	it('membatasi 200 entri dan membuang yang terlama', () => {
		for (let i = 0; i < 250; i++) {
			sock.ev.emit('messages.update', [update(`msg-${i}`, DELIVERY_ACK)])
		}

		expect(pendingCount(tracker)).toBe(200)

		// entri terlama dibuang FIFO, entri terbaru bertahan
		expect(pendingOf(tracker).has('msg-0')).toBe(false)
		expect(pendingOf(tracker).has('msg-49')).toBe(false)
		expect(pendingOf(tracker).has('msg-50')).toBe(true)
		expect(pendingOf(tracker).has('msg-249')).toBe(true)
	})

	it('update untuk entri yang sudah terbuang tidak bisa di-apply', () => {
		for (let i = 0; i < 250; i++) {
			sock.ev.emit('messages.update', [update(`msg-${i}`, DELIVERY_ACK)])
		}

		tracker.track('msg-0', '628@s.whatsapp.net', 'halo', 'halo')

		// msg-0 sudah dibuang dari buffer, jadi tidak ada status yang bisa diterapkan
		expect(tracker.getRecord('msg-0')?.status).toBe('sent')
	})

	it('dispose() membersihkan buffer pending', () => {
		sock.ev.emit('messages.update', [update('msg-1', DELIVERY_ACK)])
		expect(pendingCount(tracker)).toBe(1)

		tracker.dispose()

		expect(pendingCount(tracker)).toBe(0)
		expect(tracker.getAllRecords()).toHaveLength(0)
	})
})

describe('status delivery tetap monotonic', () => {
	it('tidak menurunkan delivered menjadi sent', () => {
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')
		sock.ev.emit('messages.update', [update('msg-1', DELIVERY_ACK)])
		expect(tracker.getRecord('msg-1')?.status).toBe('delivered')

		// ack server yang telat tidak boleh menurunkan status
		sock.ev.emit('messages.update', [update('msg-1', SERVER_ACK)])

		expect(tracker.getRecord('msg-1')?.status).toBe('delivered')
	})

	it('tidak menurunkan read menjadi delivered', () => {
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')
		sock.ev.emit('messages.update', [update('msg-1', READ)])

		sock.ev.emit('messages.update', [update('msg-1', DELIVERY_ACK)])

		expect(tracker.getRecord('msg-1')?.status).toBe('read')
	})

	it('tidak menurunkan read menjadi sent saat update arrive sebelum track()', () => {
		sock.ev.emit('messages.update', [update('msg-1', READ)])
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')
		sock.ev.emit('messages.update', [update('msg-1', SERVER_ACK)])

		expect(tracker.getRecord('msg-1')?.status).toBe('read')
	})

	it('status error tetap menang dan tidak ditimpa oleh update lebih maju', () => {
		sock.ev.emit('messages.update', [update('msg-1', ERROR)])
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')
		expect(tracker.getRecord('msg-1')?.status).toBe('failed')

		sock.ev.emit('messages.update', [update('msg-1', DELIVERY_ACK)])

		expect(tracker.getRecord('msg-1')?.status).toBe('failed')
	})

	it('update dengan status tidak valid diabaikan dan tidak menduduki buffer', () => {
		sock.ev.emit('messages.update', [{ key: { id: 'msg-1' }, update: {} }])
		sock.ev.emit('messages.update', [{ key: { id: 'msg-2' }, update: { status: 'bukan angka' } }])

		expect(pendingCount(tracker)).toBe(0)
	})
})

describe('statistik dan sweep tidak berubah', () => {
	it('getStats menghitung record yang update-nya diserap buffer', () => {
		sock.ev.emit('messages.update', [update('msg-1', DELIVERY_ACK)])
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')

		const stats = tracker.getStats()
		expect(stats.total).toBe(1)
		expect(stats.delivered).toBe(1)
		expect(stats.sent).toBe(0)
	})

	it('record yang update-nya tertangkap tidak lagi di-sweep jadi failed', () => {
		sock.ev.emit('messages.update', [update('msg-1', DELIVERY_ACK)])
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')

		// lewat jendela unconfirmed 5 menit
		jest.setSystemTime(new Date(Date.now() + 6 * 60_000))
		jest.advanceTimersByTime(6 * 60_000)

		expect(tracker.getRecord('msg-1')?.status).toBe('delivered')
		expect(tracker.getRecord('msg-1')?.error).toBeUndefined()
	})

	it('record yang tidak pernah dapat update tetap di-sweep jadi failed', () => {
		tracker.track('msg-1', '628@s.whatsapp.net', 'halo', 'halo')

		jest.setSystemTime(new Date(Date.now() + 6 * 60_000))
		jest.advanceTimersByTime(6 * 60_000)

		expect(tracker.getRecord('msg-1')?.status).toBe('failed')
		expect(tracker.getRecord('msg-1')?.error).toContain('unconfirmed')
	})
})