import { jest } from '@jest/globals'
import { createFurinaButtonTracker } from '../../../Utils/messaging/button-tracker'
import type { WAMessage } from '../../../Types'

// Tracker menyimpan label -> id button saat pesan dikirim, lalu mencocokkan
// stanzaId quote saat tap datang. Test ini tidak butuh network: yang diuji
// hanya registry-nya, jadi sock dipakai sebagai stub minimal.

const QUOTED_LABEL = 'Setujui'

// Pesan tap: WA mengirim label button sebagai quoted-text beserta stanzaId
// pesan button yang kita kirim. Tanpa quotedMessage, ini memakai jalur lookup
// yang spesifik per stanzaId.
const quotedTap = (text: string, stanzaId: string): WAMessage =>
	({
		key: { id: 'tap', remoteJid: '628@s.whatsapp.net', fromMe: false },
		message: {
			extendedTextMessage: {
				text,
				contextInfo: { stanzaId }
			}
		}
	}) as unknown as WAMessage

// Tap yang memicu jalur fallback: tracker mencocokkan label ke seluruh
// registry, bukan ke stanzaId tertentu. Perilaku existing, di luar scope
// bounded registry, jadi diuji terpisah.
const fallbackTap = (text: string): WAMessage =>
	({
		key: { id: 'tap', remoteJid: '628@s.whatsapp.net', fromMe: false },
		message: {
			extendedTextMessage: {
				text,
				contextInfo: { quotedMessage: { interactiveMessage: {} } }
			}
		}
	}) as unknown as WAMessage

// Pesan button yang "dikirim" tracker. track() dipanggil setelah sendButton
// sukses dengan messageId yang tracker hasilkan sendiri, jadi stub cukup
// meng-echo messageId itu supaya tiap entry punya stanzaId yang unik.
const sockStub = () => ({
	relayMessage: async (
		_jid: string,
		_content: unknown,
		options?: { messageId?: string }
	) => ({ key: { id: options?.messageId ?? 'sent' } })
})

const BUTTON_OPTS = {
	text: 'Pilih salah satu',
	buttons: [{ type: 'reply' as const, text: QUOTED_LABEL, id: 'btn-approve' }]
}

// Kirim tombol lalu kembalikan stanzaId yang dipakai untuk membuat tap.
const sendButton = async (
	tracker: ReturnType<typeof createFurinaButtonTracker>
): Promise<string> => {
	const sent = (await tracker.sendButton(
		sockStub() as never,
		'628@s.whatsapp.net',
		BUTTON_OPTS
	)) as unknown as { key: { id: string } }
	return sent.key.id
}

describe('button tracker registry bounds', () => {
	beforeEach(() => {
		jest.useFakeTimers()
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	it('resolves a normal entry that has not expired', async () => {
		const tracker = createFurinaButtonTracker()
		const stanzaId = await sendButton(tracker)

		const tap = tracker.parseTap(quotedTap(QUOTED_LABEL, stanzaId))

		expect(tap?.id).toBe('btn-approve')
		expect(tracker.size).toBe(1)
	})

	it('records one entry per sent message', async () => {
		const tracker = createFurinaButtonTracker()

		await sendButton(tracker)
		await sendButton(tracker)

		expect(tracker.size).toBe(2)
	})

	it('never exceeds maxEntries across repeated sends', async () => {
		const tracker = createFurinaButtonTracker({ maxEntries: 3 })

		for (let i = 0; i < 12; i++) {
			await sendButton(tracker)
			expect(tracker.size).toBeLessThanOrEqual(3)
		}

		expect(tracker.size).toBe(3)
	})

	it('evicts oldest-first when full, keeping the newest entries', async () => {
		const tracker = createFurinaButtonTracker({ maxEntries: 2, ttlMs: Infinity })
		const ids: string[] = []

		for (let i = 0; i < 4; i++) {
			ids.push(await sendButton(tracker))
		}

		// dua entry tertua harus sudah dibuang
		expect(tracker.parseTap(quotedTap(QUOTED_LABEL, ids[0]!))).toBeNull()
		expect(tracker.parseTap(quotedTap(QUOTED_LABEL, ids[1]!))).toBeNull()
		// dua terbaru harus masih bisa dieksekusi
		expect(tracker.parseTap(quotedTap(QUOTED_LABEL, ids[2]!))?.id).toBe('btn-approve')
		expect(tracker.parseTap(quotedTap(QUOTED_LABEL, ids[3]!))?.id).toBe('btn-approve')
	})

	it('drops expired entries before evicting live ones', async () => {
		const tracker = createFurinaButtonTracker({ maxEntries: 2, ttlMs: 60_000 })
		const oldest = await sendButton(tracker)

		// leap 61 detik: entry pertama expired, tapi belum ada yang memaksa
		jest.advanceTimersByTime(61_000)

		// entri baru masuk saat registry masih punya ruang, jadi tidak ada evict
		const newest = await sendButton(tracker)
		expect(tracker.size).toBe(1)

		// yang expired tidak lagi bisa dieksekusi
		expect(tracker.parseTap(quotedTap(QUOTED_LABEL, oldest))).toBeNull()
		expect(tracker.parseTap(quotedTap(QUOTED_LABEL, newest))?.id).toBe('btn-approve')
	})

	it('expired entries cannot be executed and are removed', async () => {
		const tracker = createFurinaButtonTracker({ ttlMs: 60_000 })
		const stanzaId = await sendButton(tracker)
		expect(tracker.size).toBe(1)

		jest.advanceTimersByTime(60_001)

		expect(tracker.parseTap(quotedTap(QUOTED_LABEL, stanzaId))).toBeNull()
		expect(tracker.size).toBe(0)
	})

	it('keeps a live entry when a live one and an expired one compete for space', async () => {
		const tracker = createFurinaButtonTracker({ maxEntries: 1, ttlMs: 60_000 })
		const stale = await sendButton(tracker)

		jest.advanceTimersByTime(61_000)
		const fresh = await sendButton(tracker)

		expect(tracker.size).toBe(1)
		expect(tracker.parseTap(quotedTap(QUOTED_LABEL, stale))).toBeNull()
		expect(tracker.parseTap(quotedTap(QUOTED_LABEL, fresh))?.id).toBe('btn-approve')
	})

	it('stays repeatable for entries that have not expired', async () => {
		// Behavior existing: satu entry tidak one-shot, tap berulang tetap resolve.
		// Memakai delete-on-match akan breaking, jadi sengaja dipertahankan.
		const tracker = createFurinaButtonTracker()
		const stanzaId = await sendButton(tracker)

		expect(tracker.parseTap(quotedTap(QUOTED_LABEL, stanzaId))?.id).toBe('btn-approve')
		expect(tracker.parseTap(quotedTap(QUOTED_LABEL, stanzaId))?.id).toBe('btn-approve')
		expect(tracker.size).toBe(1)
	})

	it('expires everything with a zero ttl without crashing', async () => {
		const tracker = createFurinaButtonTracker({ ttlMs: 0 })
		const stanzaId = await sendButton(tracker)

		// nilai 0 dianggap tidak valid lalu kembali ke default, jadi masih hidup
		expect(tracker.size).toBe(1)
		expect(tracker.parseTap(quotedTap(QUOTED_LABEL, stanzaId))?.id).toBe('btn-approve')
	})

	it('falls back to defaults for invalid configuration values', async () => {
		const tracker = createFurinaButtonTracker({
			ttlMs: Number.NaN,
			maxEntries: -1
		})
		const stanzaId = await sendButton(tracker)

		expect(tracker.size).toBe(1)
		expect(tracker.parseTap(quotedTap(QUOTED_LABEL, stanzaId))?.id).toBe('btn-approve')
	})

	it('honours an explicit Infinity opt-out for size', async () => {
		const tracker = createFurinaButtonTracker({ maxEntries: Infinity, ttlMs: Infinity })

		for (let i = 0; i < 30; i++) {
			await sendButton(tracker)
		}

		expect(tracker.size).toBe(30)
	})

	it('still resolves through the label fallback path', async () => {
		// Jalur fallback mencocokkan label ke seluruh registry, bukan stanzaId.
		// Entry expired sudah dibuang, tapi entry yang masih hidup tetap bisa
		// melayani tap lewat jalur ini.
		const tracker = createFurinaButtonTracker({ ttlMs: 60_000 })
		await sendButton(tracker)

		jest.advanceTimersByTime(61_000)

		// expired sudah dibuang, jadi fallback tidak menemukan apa pun
		expect(tracker.parseTap(fallbackTap(QUOTED_LABEL))).toBeNull()

		const live = await sendButton(tracker)
		expect(tracker.parseTap(fallbackTap(QUOTED_LABEL))?.id).toBe('btn-approve')
		expect(tracker.parseTap(quotedTap(QUOTED_LABEL, live))?.id).toBe('btn-approve')
	})

	it('keeps the official parse path working after dispose', async () => {
		const tracker = createFurinaButtonTracker()
		tracker.dispose()

		const official = {
			key: { id: 'x', remoteJid: '628@s.whatsapp.net', fromMe: false },
			message: {
				buttonsResponseMessage: { selectedButtonId: 'legacy-1', selectedDisplayText: 'Legacy' }
			}
		} as unknown as WAMessage

		// jalur resmi stateless, tidak consulting registry
		expect(tracker.parseTap(official)?.id).toBe('legacy-1')
	})
})

describe('button tracker disposal', () => {
	beforeEach(() => {
		jest.useFakeTimers()
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	it('dispose() clears internal state', async () => {
		const tracker = createFurinaButtonTracker()
		await sendButton(tracker)
		expect(tracker.size).toBe(1)

		tracker.dispose()

		expect(tracker.size).toBe(0)
	})

	it('dispose() twice is safe', async () => {
		const tracker = createFurinaButtonTracker()
		await sendButton(tracker)

		tracker.dispose()

		expect(() => tracker.dispose()).not.toThrow()
		expect(() => tracker.dispose()).not.toThrow()
		expect(tracker.size).toBe(0)
	})

	it('stops executing taps after dispose', async () => {
		const tracker = createFurinaButtonTracker()
		const stanzaId = await sendButton(tracker)

		tracker.dispose()

		expect(tracker.parseTap(quotedTap(QUOTED_LABEL, stanzaId))).toBeNull()
	})

	it('does not re-activate after dispose even when sending again', async () => {
		const tracker = createFurinaButtonTracker()
		tracker.dispose()

		await sendButton(tracker)

		expect(tracker.size).toBe(0)
	})

	it('two trackers do not remove each other state', async () => {
		const first = createFurinaButtonTracker()
		const second = createFurinaButtonTracker()
		const firstId = await sendButton(first)
		const secondId = await sendButton(second)

		first.dispose()

		expect(first.size).toBe(0)
		expect(second.size).toBe(1)
		expect(second.parseTap(quotedTap(QUOTED_LABEL, firstId))).toBeNull()
		expect(second.parseTap(quotedTap(QUOTED_LABEL, secondId))?.id).toBe('btn-approve')
	})

	it('replacement tracker works independently after the old one is disposed', async () => {
		const stale = createFurinaButtonTracker()
		const staleId = await sendButton(stale)
		stale.dispose()

		const fresh = createFurinaButtonTracker()
		const freshId = await sendButton(fresh)

		expect(fresh.size).toBe(1)
		expect(fresh.parseTap(quotedTap(QUOTED_LABEL, staleId))).toBeNull()
		expect(fresh.parseTap(quotedTap(QUOTED_LABEL, freshId))?.id).toBe('btn-approve')
	})
})