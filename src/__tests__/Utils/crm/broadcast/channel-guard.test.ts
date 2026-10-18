import { EventEmitter } from 'node:events'
import {
	verifyChannelPostViaEcho,
	detectChannelRole,
	getChannelInfo,
	normalizeChannelJid
} from '../../../../Utils/crm/broadcast/channel'

// Test lokal tanpa network: sock.newsletterMetadata dan sock.ev di-stub.

const makeSock = (options: { meta?: unknown; user?: { id?: string; lid?: string } } = {}) => {
	const ev = new EventEmitter()
	return {
		ev,
		user: options.user ?? {},
		async newsletterMetadata(_type: string, _jid: string) {
			return options.meta
		}
	} as unknown as {
		ev: EventEmitter
		user: { id?: string; lid?: string }
		newsletterMetadata: (t: string, j: string) => Promise<unknown>
	}
}

const upsert = (jid: string, text: string, fromMe = true) => ({
	messages: [{ key: { fromMe, remoteJid: jid }, message: { conversation: text } }]
})

describe('M-B6: guard content kosong saat verifikasi echo', () => {
	it('tidak menempel listener dan langsung mengembalikan false untuk content kosong', async () => {
		const sock = makeSock()

		const result = await verifyChannelPostViaEcho(sock, '123@newsletter', '', 1000)

		expect(result).toBe(false)
		// tidak ada listener yang tertinggal: pesan berikutnya tidak boleh
		// dianggap sebagai echo
		expect(sock.ev.listenerCount('messages.upsert')).toBe(0)
	})

	it('content berisi spasi saja juga ditolak', async () => {
		const sock = makeSock()

		const result = await verifyChannelPostViaEcho(sock, '123@newsletter', '   ', 1000)

		expect(result).toBe(false)
		expect(sock.ev.listenerCount('messages.upsert')).toBe(0)
	})

	it('content kosong tidak bisa dicocokkan oleh pesan upsert sembarang', async () => {
		const sock = makeSock()

		const pending = verifyChannelPostViaEcho(sock, '123@newsletter', '', 1000)
		sock.ev.emit('messages.upsert', upsert('123@newsletter', 'pesan yang tidak terkait'))

		expect(await pending).toBe(false)
	})

	it('content yang ada tetap diverifikasi seperti sebelumnya', async () => {
		const sock = makeSock()

		const pending = verifyChannelPostViaEcho(sock, '123@newsletter', 'halo dunia', 5000)
		sock.ev.emit('messages.upsert', upsert('123@newsletter', 'halo dunia'))

		expect(await pending).toBe(true)
	})

	it('content ada tapi echo tidak cocok tetap mengembalikan false', async () => {
		const sock = makeSock()

		const pending = verifyChannelPostViaEcho(sock, '123@newsletter', 'halo dunia', 1000)
		sock.ev.emit('messages.upsert', upsert('123@newsletter', 'pesan lain'))

		expect(await pending).toBe(false)
		expect(sock.ev.listenerCount('messages.upsert')).toBe(0)
	})
})

describe('M-B7: owner check memakai areJidsSameUser', () => {
	const CHANNEL = '123456@newsletter'

	it('mengenali owner meski JID punya device suffix', async () => {
		// Bentuk dengan device suffix harus tetap dianggap user yang sama
		const sock = makeSock({
			meta: { owner: '628123456789:12@s.whatsapp.net', viewer_metadata: undefined },
			user: { id: '628123456789@s.whatsapp.net' }
		})

		expect(await detectChannelRole(sock, CHANNEL)).toBe('OWNER')
	})

	it('mengenali owner meski JID punya agent suffix', async () => {
		const sock = makeSock({
			meta: { owner: '628123456789_1:5@s.whatsapp.net' },
			user: { id: '628123456789@s.whatsapp.net' }
		})

		expect(await detectChannelRole(sock, CHANNEL)).toBe('OWNER')
	})

	it('mengenali owner dari sisi lid maupun id', async () => {
		const sock = makeSock({
			meta: { owner: '99887766@lid' },
			user: { lid: '99887766@lid', id: '628123456789@s.whatsapp.net' }
		})

		expect(await detectChannelRole(sock, CHANNEL)).toBe('OWNER')
	})

	it('tetap SUBSCRIBER untuk owner yang berbeda', async () => {
		const sock = makeSock({
			meta: { owner: '628999999999@s.whatsapp.net' },
			user: { id: '628123456789@s.whatsapp.net' }
		})

		expect(await detectChannelRole(sock, CHANNEL)).toBe('SUBSCRIBER')
	})

	it('viewer_metadata tetap menang seperti sebelumnya', async () => {
		const sock = makeSock({
			meta: { owner: '628999999999@s.whatsapp.net', viewer_metadata: { role: 'ADMIN' } },
			user: { id: '628123456789@s.whatsapp.net' }
		})

		expect(await detectChannelRole(sock, CHANNEL)).toBe('ADMIN')
	})

	it('isAdmin pada getInfo konsisten dengan owner yang ekuivalen', async () => {
		const sock = makeSock({
			meta: {
				owner: '628123456789:7@s.whatsapp.net',
				thread_metadata: { name: 'Kanal Uji' }
			},
			user: { id: '628123456789@s.whatsapp.net' }
		})

		const info = await getChannelInfo(sock, CHANNEL)

		expect(info?.role).toBe('OWNER')
		expect(info?.isAdmin).toBe(true)
	})

	it('metadata error tetap menghasilkan UNKNOWN', async () => {
		const sock = {
			ev: new EventEmitter(),
			user: { id: '628@s.whatsapp.net' },
			async newsletterMetadata(): Promise<never> {
				throw new Error('stub error')
			}
		}

		expect(await detectChannelRole(sock, CHANNEL)).toBe('UNKNOWN')
	})
})

describe('normalizeChannelJid tetap utuh', () => {
	it('menormalkan berbagai bentuk input menjadi @newsletter', () => {
		expect(normalizeChannelJid('123456')).toBe('123456@newsletter')
		expect(normalizeChannelJid('123456@newsletter')).toBe('123456@newsletter')
		// @newsletterrr (huruf r berulang) ikut ternormalkan
		expect(normalizeChannelJid('123456@newsletterr')).toBe('123456@newsletter')
		expect(normalizeChannelJid('123456@newsletterrrr')).toBe('123456@newsletter')
	})

	it('input kosong diteruskan apa adanya (perilaku existing)', () => {
		expect(normalizeChannelJid('')).toBe('')
	})

	it('CATATAN: tanda plus bukan literal, hanya huruf r berulang yang dinormalkan', () => {
		// Regex di normalizeChannelJid memakai /@newsletter+/g, wherein "+"
		// adalah kuantifier untuk huruf "r", bukan karakter plus. Jadi input
		// "@newsletter+" tidak dikenali. Perilaku ini tidak diubah pada tahap ini
		// (di luar M-B6/M-B7/M-B8), tapi dicatat supaya tidak mengejutkan.
		expect(normalizeChannelJid('123456@newsletter+')).toBe('123456+@newsletter')
	})
})