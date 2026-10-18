import { jest } from '@jest/globals'
import { EventEmitter } from 'node:events'
import { CRMBroadcastManager } from '../../../../Utils/crm/broadcast/manager'
import { InMemoryStorage } from '../../../../Utils/crm/storage/memory'

// Test M-B8: channelJid harus dinormalkan sebelum dipakai di sendMessage().
// Tidak ada network: sock.newsletterMetadata dan sendMessage di-stub, dan
// verifikasi echo dikembalikan lewat messages.upsert yang kita emit sendiri.

const CHANNEL_ID = '123456'

const makeSock = () => {
	const ev = new EventEmitter()
	const sentTo: string[] = []
	const metadataCalls: string[] = []

	const sock = {
		ev,
		sentTo,
		metadataCalls,
		user: { id: '628123456789@s.whatsapp.net' },
		async newsletterMetadata(type: string, jid: string) {
			metadataCalls.push(`${type}:${jid}`)
			// Jalur invite (resolve dari link) cuma butuh id channel
			if (type === 'invite') {
				return { id: `${CHANNEL_ID}@newsletter` }
			}
			// Bot adalah owner supaya lolos cek admin
			return {
				owner: '628123456789@s.whatsapp.net',
				thread_metadata: { name: 'Kanal Uji' }
			}
		},
		async sendMessage(jid: string, opts: { text?: string }) {
			sentTo.push(jid)
			// Kirim balik echo: kirim balik pesan kita sendiri ke channel itu
			setTimeout(() => {
				ev.emit('messages.upsert', {
					messages: [
						{
							key: { fromMe: true, remoteJid: jid },
							message: { conversation: opts.text ?? '' }
						}
					]
				})
			}, 1)
			return { key: { id: `sent-${jid}` } }
		}
	}
	return sock as unknown as {
		ev: EventEmitter
		sentTo: string[]
		metadataCalls: string[]
		user: { id: string }
		newsletterMetadata: (t: string, j: string) => Promise<unknown>
		sendMessage: (j: string, o: { text?: string }) => Promise<{ key: { id: string } }>
	}
}

const makeManager = (sock: unknown) =>
	new CRMBroadcastManager(sock, new InMemoryStorage(), {
		minDelayMs: 0,
		maxDelayMs: 0,
		newChatPenaltyMs: 0,
		registryPath: null,
		quarantinePath: null
	})

// Jalankan seluruh rantai timer yang tersisa tanpa menunggu waktu nyata.
const drive = async <T>(factory: () => Promise<T>): Promise<T> => {
	const pending = factory()
	let settled = false
	const tracked = pending.then(
		v => {
			settled = true
			return v
		},
		e => {
			settled = true
			throw e
		}
	)
	for (let i = 0; i < 60 && !settled; i++) {
		await jest.advanceTimersByTimeAsync(1_000)
	}
	return tracked
}

beforeEach(() => {
	jest.useFakeTimers()
	jest.setSystemTime(new Date('2026-06-01T00:00:00.000Z'))
})

afterEach(() => {
	jest.useRealTimers()
})

describe('M-B8: normalisasi channelJid di sendToChannel', () => {
	it('raw channel ID dinormalkan sebelum dikirim', async () => {
		const sock = makeSock()
		const manager = makeManager(sock)

		await drive(() => manager.sendToChannel(CHANNEL_ID, 'halo'))

		// bukan "123456" mentah, tapi "123456@newsletter"
		expect(sock.sentTo).toEqual([`${CHANNEL_ID}@newsletter`])
	})

	it('raw JID @newsletter dipertahankan bentuknya', async () => {
		const sock = makeSock()
		const manager = makeManager(sock)

		await drive(() => manager.sendToChannel(`${CHANNEL_ID}@newsletter`, 'halo'))

		expect(sock.sentTo).toEqual([`${CHANNEL_ID}@newsletter`])
	})

	it('hasil posting ke raw ID melaporkan sukses dan terverifikasi', async () => {
		const sock = makeSock()
		const manager = makeManager(sock)

		const result = await drive(() => manager.sendToChannel(CHANNEL_ID, 'halo'))

		expect(result.status).toBe('success')
		expect(result.jid).toBe(`${CHANNEL_ID}@newsletter`)
		expect(result.postVerified).toBe(true)
	})

	it('JID hasil normalisasi dipakai juga saat cek metadata admin', async () => {
		const sock = makeSock()
		const manager = makeManager(sock)

		await drive(() => manager.sendToChannel(CHANNEL_ID, 'halo'))

		// newsletterMetadata harus menerima JID kanonik, bukan ID mentah
		expect(sock.metadataCalls.every(c => !c.endsWith(':123456'))).toBe(true)
		expect(sock.metadataCalls.some(c => c.endsWith(':123456@newsletter'))).toBe(true)
	})

	it('JID dengan sufiks newsletter berulang juga dinormalkan', async () => {
		const sock = makeSock()
		const manager = makeManager(sock)

		await drive(() => manager.sendToChannel(`${CHANNEL_ID}@newsletterrr`, 'halo'))

		expect(sock.sentTo).toEqual([`${CHANNEL_ID}@newsletter`])
	})

	it('link channel tetap lewat resolveChannelFromLink dan hasilnya dipakai', async () => {
		const sock = makeSock()
		const manager = makeManager(sock)

		const result = await drive(() =>
			manager.sendToChannel('https://whatsapp.com/channel/abcdef', 'halo')
		)

		// jalur link tidak berubah: resolveChannelFromLink memanggil
		// newsletterMetadata('invite', code) lalu memakai id yang dikembalikan
		expect(sock.metadataCalls.some(c => c.startsWith('invite:'))).toBe(true)
		expect(sock.sentTo).toHaveLength(1)
		expect(result.status).toBe('success')
	})

	it('link channel yang gagal resolve tetap gagal tanpa mengirim', async () => {
		const sock = makeSock()
		sock.newsletterMetadata = async (type: string) =>
			(type === 'invite' ? null : { owner: '628123456789@s.whatsapp.net' }) as never
		const manager = makeManager(sock)

		const result = await drive(() =>
			manager.sendToChannel('https://whatsapp.com/channel/tidak-ada', 'halo')
		)

		expect(result.status).toBe('failed')
		expect(result.error).toBe('Link channel invalid')
		expect(sock.sentTo).toHaveLength(0)
	})

	it('dry run tidak mengirim apa pun dan JID tetap kanonik', async () => {
		const sock = makeSock()
		const manager = makeManager(sock)

		const result = await drive(() =>
			manager.sendToChannel(CHANNEL_ID, 'halo', { dryRun: true })
		)

		expect(result.status).toBe('dry_run')
		expect(result.jid).toBe(`${CHANNEL_ID}@newsletter`)
		expect(sock.sentTo).toHaveLength(0)
	})

	it('bot bukan owner tetap ditolak tanpa mengirim', async () => {
		const sock = makeSock()
		sock.newsletterMetadata = async () => ({ owner: '628999999999@s.whatsapp.net' })
		const manager = makeManager(sock)

		const result = await drive(() => manager.sendToChannel(CHANNEL_ID, 'halo'))

		expect(result.status).toBe('not_admin')
		expect(result.jid).toBe(`${CHANNEL_ID}@newsletter`)
		expect(sock.sentTo).toHaveLength(0)
	})
})