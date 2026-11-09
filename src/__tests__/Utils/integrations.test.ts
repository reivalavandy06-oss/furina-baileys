import { __setIntegrationModuleLoader, normalizeTargetJids, sendToTargets } from '../../Utils/integrations/types'
import type { IntegrationSocket } from '../../Utils/integrations/types'
import { formatTrakteerDonation, listenTrakteerDonations } from '../../Utils/integrations/trakteer'
import { formatSaweriaDonation, listenSaweriaDonations } from '../../Utils/integrations/saweria'

type Handler = (...args: any[]) => unknown

const makeSock = () => {
	const sent: { jid: string; content: unknown; options?: unknown }[] = []
	return {
		sent,
		sock: {
			sendMessage: async (jid: string, content: unknown, options?: unknown) => {
				sent.push({ jid, content, options })
				return { key: { id: `M${sent.length}`, remoteJid: jid } }
			}
		}
	}
}

const makeFakeTrakteer = () => {
	const handlers: Record<string, Handler[]> = {}
	const state: {
		autoReconnect: boolean
		terminated: boolean
		ctorArgs?: { pageID: string; streamKey: string; hash: string }
	} = { autoReconnect: true, terminated: false }
	const ws = {
		removeAllListeners: () => {},
		terminate: () => {
			state.terminated = true
		}
	}
	const client = {
		on: (event: string, fn: Handler) => {
			;(handlers[event] ||= []).push(fn)
			return client
		},
		removeAllListeners: () => {
			for (const key of Object.keys(handlers)) delete handlers[key]
		},
		client: ws,
		get autoReconnect() {
			return state.autoReconnect
		},
		set autoReconnect(v: boolean) {
			state.autoReconnect = v
		}
	}
	const streamAPI = function (pageID: string, streamKey: string, hash: string) {
		state.ctorArgs = { pageID, streamKey, hash }
		return client
	}
	return { mod: { streamAPI }, handlers, state, client }
}

const makeFakeSaweria = () => {
	const handlers: Record<string, Handler[]> = {}
	const state: { closed: boolean; streamKey?: string } = { closed: false }
	const webSocket = {
		removeAllListeners: () => {},
		close: () => {
			state.closed = true
		}
	}
	const client = {
		on: (event: string, fn: Handler) => {
			;(handlers[event] ||= []).push(fn)
			return client
		},
		setStreamKey: async (key: string) => {
			state.streamKey = key
		},
		removeAllListeners: () => {
			for (const k of Object.keys(handlers)) delete handlers[k]
		},
		webSocket
	}
	const Client = function () {
		return client
	}
	return { mod: { Client }, handlers, state, client }
}

const emit = async (handlers: Record<string, Handler[]>, event: string, ...args: unknown[]) => {
	for (const fn of handlers[event] ?? []) await fn(...args)
}

afterEach(() => __setIntegrationModuleLoader(null))

// ── shared helpers ───────────────────────────────────────────────────────
describe('integration helpers', () => {
	it('normalizeTargetJids accepts a string or array and de-duplicates', () => {
		expect(normalizeTargetJids('a@s.whatsapp.net')).toEqual(['a@s.whatsapp.net'])
		expect(normalizeTargetJids(['a@s.whatsapp.net', 'a@s.whatsapp.net', 'b@g.us'])).toEqual([
			'a@s.whatsapp.net',
			'b@g.us'
		])
		expect(normalizeTargetJids(['  ', ''])).toEqual([])
	})

	it('sendToTargets sends to every jid and isolates failures', async () => {
		const calls: string[] = []
		const sock: IntegrationSocket = {
			sendMessage: async (jid: string) => {
				if (jid === 'bad@s.whatsapp.net') throw new Error('boom')
				calls.push(jid)
			}
		}

		const results = await sendToTargets(sock, ['ok1@s.whatsapp.net', 'bad@s.whatsapp.net', 'ok2@s.whatsapp.net'], {
			text: 'hi'
		})

		expect(calls).toEqual(['ok1@s.whatsapp.net', 'ok2@s.whatsapp.net'])
		expect(results.map(r => r.ok)).toEqual([true, false, true])
	})
})

// ── Trakteer ─────────────────────────────────────────────────────────────
describe('listenTrakteerDonations', () => {
	const base = { channelId: 'page123', streamKey: 'trstream-abc', hash: 'h4sh' }

	it('broadcasts a donation to every JID in an array target', async () => {
		const fake = makeFakeTrakteer()
		__setIntegrationModuleLoader(async () => fake.mod)
		const { sock, sent } = makeSock()

		await listenTrakteerDonations(sock, {
			...base,
			targetJid: ['111@g.us', '222@newsletter', '333@s.whatsapp.net']
		})

		await emit(fake.handlers, 'donation', {
			supporter_name: 'Budi',
			price: 'Rp 10.000',
			supporter_message: 'Semangat!'
		})

		expect(sent).toHaveLength(3)
		expect(sent.map(s => s.jid)).toEqual(['111@g.us', '222@newsletter', '333@s.whatsapp.net'])
		expect(sent[0]!.content).toEqual({
			text: '🎁 Donasi Trakteer dari Budi: Rp 10.000\n"Semangat!"'
		})
	})

	it('accepts a single string target', async () => {
		const fake = makeFakeTrakteer()
		__setIntegrationModuleLoader(async () => fake.mod)
		const { sock, sent } = makeSock()

		await listenTrakteerDonations(sock, { ...base, targetJid: 'only@g.us' })
		await emit(fake.handlers, 'donation', { supporter_name: 'A', price: 'Rp 1' })

		expect(sent).toHaveLength(1)
		expect(sent[0]!.jid).toBe('only@g.us')
	})

	it('constructs the client with pageID/streamKey/hash', async () => {
		const fake = makeFakeTrakteer()
		__setIntegrationModuleLoader(async () => fake.mod)
		const { sock } = makeSock()

		await listenTrakteerDonations(sock, { ...base, targetJid: 'x@g.us' })
		expect(fake.state.ctorArgs).toEqual({ pageID: 'page123', streamKey: 'trstream-abc', hash: 'h4sh' })
	})

	it('lets onDonation return content that is broadcast', async () => {
		const fake = makeFakeTrakteer()
		__setIntegrationModuleLoader(async () => fake.mod)
		const { sock, sent } = makeSock()

		await listenTrakteerDonations(sock, {
			...base,
			targetJid: ['a@g.us', 'b@g.us'],
			onDonation: donation => ({ text: `custom:${donation.supporter_name}` })
		})
		await emit(fake.handlers, 'donation', { supporter_name: 'Sari' })

		expect(sent.map(s => s.content)).toEqual([{ text: 'custom:Sari' }, { text: 'custom:Sari' }])
	})

	it('lets onDonation use ctx.sendMessage for multi-target', async () => {
		const fake = makeFakeTrakteer()
		__setIntegrationModuleLoader(async () => fake.mod)
		const { sock, sent } = makeSock()

		await listenTrakteerDonations(sock, {
			...base,
			targetJid: ['a@g.us', 'b@g.us'],
			onDonation: async (_donation, ctx) => {
				await ctx.sendMessage({ text: `targets=${ctx.targetJids.length}` })
			}
		})
		await emit(fake.handlers, 'donation', { supporter_name: 'X' })

		expect(sent).toHaveLength(2)
		expect(sent[0]!.content).toEqual({ text: 'targets=2' })
	})

	it('suppresses the default send when onDonation returns undefined', async () => {
		const fake = makeFakeTrakteer()
		__setIntegrationModuleLoader(async () => fake.mod)
		const { sock, sent } = makeSock()

		await listenTrakteerDonations(sock, {
			...base,
			targetJid: 'a@g.us',
			onDonation: () => undefined
		})
		await emit(fake.handlers, 'donation', { supporter_name: 'X' })

		expect(sent).toHaveLength(0)
	})

	it('honours a custom formatMessage', async () => {
		const fake = makeFakeTrakteer()
		__setIntegrationModuleLoader(async () => fake.mod)
		const { sock, sent } = makeSock()

		await listenTrakteerDonations(sock, {
			...base,
			targetJid: 'a@g.us',
			formatMessage: d => ({ text: `fmt:${d.price}` })
		})
		await emit(fake.handlers, 'donation', { price: 'Rp 5' })

		expect(sent[0]!.content).toEqual({ text: 'fmt:Rp 5' })
	})

	it('close() disconnects and is idempotent', async () => {
		const fake = makeFakeTrakteer()
		__setIntegrationModuleLoader(async () => fake.mod)
		const { sock } = makeSock()

		const listener = await listenTrakteerDonations(sock, { ...base, targetJid: 'a@g.us' })
		expect(listener.isConnected()).toBe(true)

		await listener.close()
		expect(fake.state.autoReconnect).toBe(false)
		expect(fake.state.terminated).toBe(true)
		expect(listener.isConnected()).toBe(false)

		await expect(listener.close()).resolves.toBeUndefined()
	})

	it('ignores donations after close()', async () => {
		const fake = makeFakeTrakteer()
		__setIntegrationModuleLoader(async () => fake.mod)
		const { sock, sent } = makeSock()

		const listener = await listenTrakteerDonations(sock, { ...base, targetJid: 'a@g.us' })
		await listener.close()
		// handler may still be registered on the (terminated) fake; it must no-op
		await emit(fake.handlers, 'donation', { supporter_name: 'late' })
		expect(sent).toHaveLength(0)
	})

	it('throws a helpful message when the peer dependency is missing', async () => {
		__setIntegrationModuleLoader(async () => {
			throw new Error('MODULE_NOT_FOUND')
		})
		const { sock } = makeSock()

		await expect(listenTrakteerDonations(sock, { ...base, targetJid: 'a@g.us' })).rejects.toThrow(
			/npm install trakteerjs/
		)
	})

	it('rejects missing required options', async () => {
		__setIntegrationModuleLoader(async () => makeFakeTrakteer().mod)
		const { sock } = makeSock()

		await expect(listenTrakteerDonations(sock, { ...base, channelId: '', targetJid: 'a@g.us' })).rejects.toThrow(
			/channelId/
		)
		await expect(listenTrakteerDonations(sock, { ...base, streamKey: '', targetJid: 'a@g.us' })).rejects.toThrow(
			/streamKey/
		)
		await expect(listenTrakteerDonations(sock, { ...base, hash: '', targetJid: 'a@g.us' })).rejects.toThrow(/hash/)
		await expect(listenTrakteerDonations(sock, { ...base, targetJid: [] })).rejects.toThrow(/targetJid/)
	})

	it('formatTrakteerDonation renders name/amount/message', () => {
		expect(formatTrakteerDonation({ supporter_name: 'A', price: 'Rp 1' })).toEqual({
			text: '🎁 Donasi Trakteer dari A: Rp 1'
		})
		expect(formatTrakteerDonation({ price_number: 5000 })).toEqual({
			text: '🎁 Donasi Trakteer dari Seseorang: Rp 5000'
		})
	})
})

// ── Saweria ──────────────────────────────────────────────────────────────
describe('listenSaweriaDonations', () => {
	it('broadcasts every donation in the array to every JID', async () => {
		const fake = makeFakeSaweria()
		__setIntegrationModuleLoader(async () => fake.mod)
		const { sock, sent } = makeSock()

		await listenSaweriaDonations(sock, {
			streamKey: 'sk-123',
			targetJid: ['111@g.us', '222@newsletter']
		})

		await emit(fake.handlers, 'donations', [
			{ amount: 10000, donator: 'Budi', message: 'Halo' },
			{ amount: 5000, donator: 'Sari', message: '' }
		])

		expect(fake.state.streamKey).toBe('sk-123')
		expect(sent).toHaveLength(4)
		expect(sent[0]!.content).toEqual({
			text: `💸 Donasi Saweria dari Budi: Rp ${(10000).toLocaleString('id-ID')}\n"Halo"`
		})
		expect(sent.map(s => s.jid)).toEqual(['111@g.us', '222@newsletter', '111@g.us', '222@newsletter'])
	})

	it('handles the single-donation event', async () => {
		const fake = makeFakeSaweria()
		__setIntegrationModuleLoader(async () => fake.mod)
		const { sock, sent } = makeSock()

		await listenSaweriaDonations(sock, { streamKey: 'sk', targetJid: 'a@g.us' })
		await emit(fake.handlers, 'donation', { amount: 1000, donator: 'X' })

		expect(sent).toHaveLength(1)
	})

	it('lets onDonation customise the payload', async () => {
		const fake = makeFakeSaweria()
		__setIntegrationModuleLoader(async () => fake.mod)
		const { sock, sent } = makeSock()

		await listenSaweriaDonations(sock, {
			streamKey: 'sk',
			targetJid: ['a@g.us', 'b@g.us'],
			onDonation: d => ({ text: `custom:${d.donator}` })
		})
		await emit(fake.handlers, 'donations', [{ amount: 1, donator: 'Z' }])

		expect(sent.map(s => s.content)).toEqual([{ text: 'custom:Z' }, { text: 'custom:Z' }])
	})

	it('close() closes the websocket and is idempotent', async () => {
		const fake = makeFakeSaweria()
		__setIntegrationModuleLoader(async () => fake.mod)
		const { sock } = makeSock()

		const listener = await listenSaweriaDonations(sock, { streamKey: 'sk', targetJid: 'a@g.us' })
		await listener.close()
		expect(fake.state.closed).toBe(true)
		expect(listener.isConnected()).toBe(false)
		await expect(listener.close()).resolves.toBeUndefined()
	})

	it('throws when the peer dependency is missing', async () => {
		__setIntegrationModuleLoader(async () => {
			throw new Error('nope')
		})
		const { sock } = makeSock()

		await expect(listenSaweriaDonations(sock, { streamKey: 'sk', targetJid: 'a@g.us' })).rejects.toThrow(
			/npm install saweria/
		)
	})

	it('rejects an empty streamKey or target', async () => {
		__setIntegrationModuleLoader(async () => makeFakeSaweria().mod)
		const { sock } = makeSock()

		await expect(listenSaweriaDonations(sock, { streamKey: '', targetJid: 'a@g.us' })).rejects.toThrow(/streamKey/)
		await expect(listenSaweriaDonations(sock, { streamKey: 'sk', targetJid: [] })).rejects.toThrow(/targetJid/)
	})

	it('formatSaweriaDonation renders name/amount/message', () => {
		expect(formatSaweriaDonation({ donator: 'A', amount: 2000 })).toEqual({
			text: `💸 Donasi Saweria dari A: Rp ${(2000).toLocaleString('id-ID')}`
		})
	})
})
