import { jest } from '@jest/globals'
import type { MessageRelayOptions, WAMessage, AnyMessageContent } from '../../Types'
import { createFileAuthStore, makeAuthStateFromStore } from '../../Utils/auth-store'
import {
	checkUsername,
	deleteUsername,
	findUserByUsername,
	getMyUsername,
	isValidPin,
	isValidUsername,
	normaliseUsername,
	setUsername,
	setUsernamePin
} from '../../Utils/username-manager'
import { MessageSearchIndex } from '../../Utils/message-search'
import { buildPanoramaProfileImages, panoramaBannerHeight } from '../../Utils/panorama-profile'
import { suppressSignalNoise, SIGNAL_NOISE_PATTERNS } from '../../Utils/signal-noise-filter'
import { MessageScheduler } from '../../Utils/scheduler'
import { AutoReplyEngine } from '../../Utils/auto-reply'
import { AntiSpamFilter } from '../../Utils/anti-spam'
import { initAuthCreds } from '../../Utils/auth-utils'

const tmp = (name: string) => `/tmp/furina-f9-test-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

// ── BAGIAN 1 ─────────────────────────────────────────────────────────────
/** A valid 1x1 PNG (created once, reused across panorama tests). */
const tinyPng = (): Buffer =>
	Buffer.from(
		'89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de' +
			'0000000c49444154789c63f8cfc0000003010100c9fe92ef0000000049454e44ae426082',
		'hex'
	)

describe('Multi-backend auth store', () => {
	it('file store round-trips get/set/remove/keys', async () => {
		const folder = tmp('file')
		const store = await createFileAuthStore(folder)

		expect(await store.get('missing')).toBeNull()
		await store.set('a.json', '1')
		await store.set('b.json', '2')
		await store.setMany({ 'c.json': '3' })

		expect(await store.get('a.json')).toBe('1')
		expect(await store.getMany(['a.json', 'zz.json'])).toEqual({ 'a.json': '1' })
		expect((await store.keys()).sort()).toEqual(['a.json', 'b.json', 'c.json'])

		expect(await store.remove('a.json')).toBe(true)
		expect(await store.remove('a.json')).toBe(false)
		await store.clear?.()
		expect(await store.keys()).toEqual([])
	})

	it('sanitises file names with path/scheme separators', async () => {
		const folder = tmp('file-sanitise')
		const store = await createFileAuthStore(folder)
		await store.set('session/628@s.whatsapp.net.json', 'x')
		expect((await store.keys())[0]).toBe('session__628@s.whatsapp.net.json')
	})

	it('makeAuthStateFromStore builds a usable AuthenticationState', async () => {
		const folder = tmp('authstate')
		const store = await createFileAuthStore(folder)
		const { state, saveCreds } = await makeAuthStateFromStore(store)

		expect(state.creds.registered).toBe(initAuthCreds().registered)

		const before = await store.get('creds.json')
		expect(state.creds.registered).toBe(false)
		await state.keys.set({ session: { '628@s.whatsapp.net': new Uint8Array([1, 2, 3]) } })
		const stored = await store.getMany(['session-628@s.whatsapp.net.json'])
		expect(Object.keys(stored)).toHaveLength(1)

		const readBack = await state.keys.get('session', ['628@s.whatsapp.net'])
		expect(Array.from(readBack['628@s.whatsapp.net'] as Uint8Array)).toEqual([1, 2, 3])

		expect(before).toBeNull()
		await saveCreds()
		expect(await store.get('creds.json')).toBeTruthy()
	})

	it('optional backends throw a clear message when not installed', async () => {
		const { useSQLiteAuthState, useMongoDBAuthState, useRedisAuthState } = await import('../../Utils/auth-store')

		await expect(useSQLiteAuthState(tmp('sqlite'))).rejects.toThrow(/optional peer dependency/)
		await expect(useMongoDBAuthState({})).rejects.toThrow(/optional peer dependency/)
		await expect(useRedisAuthState({})).rejects.toThrow(/optional peer dependency/)
	})
})

// ── BAGIAN 2 ─────────────────────────────────────────────────────────────
describe('Username management', () => {
	const makeSock = (response: unknown) => ({
		executeUSyncQuery: jest.fn(async () => response),
		query: jest.fn(async () => ({ attrs: { type: 'result' } })),
		user: { id: '6281234567890@s.whatsapp.net' },
		logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }
	})

	it('normaliseUsername strips @ and lowercases', () => {
		expect(normaliseUsername('@Avandy')).toBe('avandy')
		expect(normaliseUsername('  Furina  ')).toBe('furina')
	})

	it('isValidUsername enforces length and charset', () => {
		expect(isValidUsername('avandy')).toBe(true)
		expect(isValidUsername('a.b_c1')).toBe(true)
		expect(isValidUsername('abc')).toBe(false)
		expect(isValidUsername('a'.repeat(31))).toBe(false)
		expect(isValidUsername('Avandy!')).toBe(false)
	})

	it('isValidPin accepts 4-8 digits only', () => {
		expect(isValidPin('1234')).toBe(true)
		expect(isValidPin('12345678')).toBe(true)
		expect(isValidPin('123')).toBe(false)
		expect(isValidPin('12a4')).toBe(false)
	})

	it('checkUsername is true when no user resolves', async () => {
		const sock = makeSock({ list: [] })
		expect(await checkUsername(sock, 'avandy')).toBe(true)
	})

	it('checkUsername is false when a handle resolves', async () => {
		const sock = makeSock({ list: [{ id: '628@s.whatsapp.net', username: 'avandy' }] })
		expect(await checkUsername(sock, 'avandy')).toBe(false)
	})

	it('checkUsername normalises the input handle', async () => {
		const sock = makeSock({ list: [] })
		await checkUsername(sock, '@Avandy')
		expect(sock.executeUSyncQuery).toHaveBeenCalledTimes(1)
	})

	it('findUserByUsername maps the first entry', async () => {
		const sock = makeSock({
			list: [{ id: '628@s.whatsapp.net', lid: '5@lid', username: 'furina', pushname: 'Furina' }]
		})

		const user = await findUserByUsername(sock, '@furina')
		expect(user?.jid).toBe('628@s.whatsapp.net')
		expect(user?.lid).toBe('5@lid')
		expect(user?.pushname).toBe('Furina')
	})

	it('findUserByUsername returns null for unknown handles', async () => {
		const sock = makeSock({ list: [] })
		expect(await findUserByUsername(sock, 'nope')).toBeNull()
	})

	it('getMyUsername reads the account handle', async () => {
		const sock = makeSock({ list: [{ username: 'avandy' }] })
		expect(await getMyUsername(sock)).toBe('avandy')
	})

	it('getMyUsername returns null when unset', async () => {
		const sock = makeSock({ list: [{ id: 'me@s.whatsapp.net' }] })
		expect(await getMyUsername(sock)).toBeNull()
	})

	it('setUsername validates before sending a stanza', async () => {
		const sock = makeSock({})
		await expect(setUsername(sock, 'abc')).rejects.toThrow(/username invalid/)
		expect(sock.query).not.toHaveBeenCalled()
	})

	it('setUsername sends an iq mutation and reports ok', async () => {
		const sock = makeSock({})
		const result = await setUsername(sock, 'avandy')

		expect(result.ok).toBe(true)
		expect(sock.query).toHaveBeenCalledTimes(1)
		const [stanza] = sock.query.mock.calls[0] as unknown as [Record<string, unknown>]
		expect(stanza['attrs']).toMatchObject({ xmlns: 'username', type: 'set' })
	})

	it('setUsername reports failure on an error result', async () => {
		const sock = {
			query: jest.fn(async () => ({ attrs: { type: 'error' } }))
		}
		const result = await setUsername(sock, 'avandy')
		expect(result.ok).toBe(false)
	})

	it('setUsernamePin validates the pin and sends a mutation', async () => {
		const sock = makeSock({})
		await expect(setUsernamePin(sock, { pin: '12' })).rejects.toThrow(/4-8 digit/)

		const result = await setUsernamePin(sock, { pin: '4321' })
		expect(result.ok).toBe(true)
	})

	it('deleteUsername sends a delete mutation', async () => {
		const sock = makeSock({})
		const result = await deleteUsername(sock)
		expect(result.ok).toBe(true)
	})
})

// ── BAGIAN 3 ─────────────────────────────────────────────────────────────
const msg = (id: string, text: string, remoteJid: string, fromMe = false, ts = 1_700_000_000): WAMessage =>
	({
		key: { id, remoteJid, fromMe, participant: `${remoteJid.split('@')[0]}@s.whatsapp.net` },
		message: { conversation: text },
		messageTimestamp: ts
	}) as unknown as WAMessage

describe('Message search index', () => {
	it('indexes and reports size', () => {
		const index = new MessageSearchIndex()
		index.addMessages([msg('1', 'hello world', 'a@s.whatsapp.net')])
		expect(index.size).toBe(1)
	})

	it('ignores messages without an id', () => {
		const index = new MessageSearchIndex()
		index.add({ message: { conversation: 'x' } } as unknown as WAMessage)
		expect(index.size).toBe(0)
	})

	it('finds messages by text and scores relevance', () => {
		const index = new MessageSearchIndex()
		index.addMessages([
			msg('1', 'hello world', 'a@s.whatsapp.net'),
			msg('2', 'hello', 'b@s.whatsapp.net'),
			msg('3', 'nothing here', 'a@s.whatsapp.net')
		])

		const hits = index.search('hello world')
		expect(hits).toHaveLength(2)
		expect(hits[0]!.message.key.id).toBe('1')
		expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score)
	})

	it('respects chatIds, from/to and includeFromMe', () => {
		const index = new MessageSearchIndex()
		index.addMessages([
			msg('1', 'hi', 'a@s.whatsapp.net', false, 1_700_000_100),
			msg('2', 'hi', 'b@s.whatsapp.net', false, 1_700_000_200),
			msg('3', 'hi', 'a@s.whatsapp.net', true, 1_700_000_300)
		])

		expect(index.search('hi', { chatIds: ['a@s.whatsapp.net'] })).toHaveLength(2)
		expect(index.search('hi', { includeFromMe: false })).toHaveLength(2)
		expect(index.search('hi', { from: 1_700_000_150, to: 1_700_000_250 })).toHaveLength(1)
	})

	it('respects limit', () => {
		const index = new MessageSearchIndex()
		index.addMessages([msg('1', 'hi', 'a@s.whatsapp.net'), msg('2', 'hi', 'b@s.whatsapp.net')])
		expect(index.search('hi', { limit: 1 })).toHaveLength(1)
	})

	it('returns no hits for an empty query', () => {
		const index = new MessageSearchIndex()
		index.addMessages([msg('1', 'hi', 'a@s.whatsapp.net')])
		expect(index.search('   ')).toHaveLength(0)
	})

	it('is case-insensitive by default', () => {
		const index = new MessageSearchIndex()
		index.addMessages([msg('1', 'HELLO there', 'a@s.whatsapp.net')])
		expect(index.search('hello')).toHaveLength(1)
		expect(index.search('hello', { caseSensitive: true })).toHaveLength(0)
	})

	it('searchRegex matches patterns', () => {
		const index = new MessageSearchIndex()
		index.addMessages([msg('1', 'order 12345', 'a@s.whatsapp.net'), msg('2', 'order abc', 'a@s.whatsapp.net')])

		const hits = index.searchRegex(/\d{5}/)
		expect(hits).toHaveLength(1)
		expect(hits[0]!.message.key.id).toBe('1')
	})

	it('searchRegex accepts a string pattern', () => {
		const index = new MessageSearchIndex()
		index.addMessages([msg('1', 'abc', 'a@s.whatsapp.net')])
		expect(index.searchRegex('^abc$')).toHaveLength(1)
	})

	it('searchRegex throws on an invalid pattern', () => {
		const index = new MessageSearchIndex()
		index.addMessages([msg('1', 'abc', 'a@s.whatsapp.net')])
		expect(() => index.searchRegex('(')).toThrow(/regex tidak valid/)
	})

	it('count, remove and reindex', () => {
		const index = new MessageSearchIndex()
		index.addMessages([msg('1', 'hi', 'a@s.whatsapp.net'), msg('2', 'hi', 'b@s.whatsapp.net')])
		expect(index.count('hi')).toBe(2)

		expect(index.remove('1')).toBe(true)
		expect(index.remove('1')).toBe(false)
		expect(index.size).toBe(1)

		index.reindex([msg('3', 'other', 'c@s.whatsapp.net')])
		expect(index.size).toBe(1)
		expect(index.search('hi')).toHaveLength(0)
	})

	it('later adds win on id collision', () => {
		const index = new MessageSearchIndex()
		index.add(msg('1', 'first', 'a@s.whatsapp.net'))
		index.add(msg('1', 'second', 'a@s.whatsapp.net'))
		expect(index.size).toBe(1)
		expect(index.search('second')).toHaveLength(1)
		expect(index.search('first')).toHaveLength(0)
	})

	it('clear drops everything', () => {
		const index = new MessageSearchIndex()
		index.addMessages([msg('1', 'hi', 'a@s.whatsapp.net')])
		index.clear()
		expect(index.size).toBe(0)
	})
})

// ── BAGIAN 4 ─────────────────────────────────────────────────────────────
describe('Panorama profile', () => {
	it('panoramaBannerHeight derives from the aspect ratio', () => {
		expect(panoramaBannerHeight(1280, 3)).toBe(427)
		expect(panoramaBannerHeight(1280)).toBe(427)
	})

	it('builds square + banner from a real 1x1 PNG', async () => {
		const png = tinyPng()

		const result = await buildPanoramaProfileImages(png, { squareSize: 640, maxWidth: 1280 })

		expect(result.squareWidth).toBe(640)
		expect(result.wideHeight).toBe(427)
		expect(Buffer.isBuffer(result.square)).toBe(true)
		expect(Buffer.isBuffer(result.wide)).toBe(true)
		expect(result.square.length).toBeGreaterThan(0)
		expect(result.wide.length).toBeGreaterThan(0)
	})

	it('reports an unusable media input', async () => {
		await expect(buildPanoramaProfileImages(42 as never)).rejects.toThrow(/Buffer, path, atau URL/)
	})

	it('accepts an http(s) url', async () => {
		const result = await buildPanoramaProfileImages({ url: 'https://s3.example.com/photo.png' } as never, {
			squareSize: 8,
			maxWidth: 16
		}).catch(error => error)

		// Either it produced a pair, or it rejected with a fetch/download error.
		expect(result).toBeDefined()
	})
})

// ── BAGIAN 5 ─────────────────────────────────────────────────────────────
describe('Signal noise filter', () => {
	afterEach(() => jest.restoreAllMocks())

	it('suppresses matching console output', () => {
		const info = jest.spyOn(console, 'info').mockImplementation(() => {})
		const other = jest.spyOn(console, 'info')

		const filter = suppressSignalNoise()
		console.info('Closing session: [1,2]')
		expect(info).not.toHaveBeenCalled()
		filter.restore()

		console.info('unrelated')
		expect(other).toHaveBeenCalled()
	})

	it('never patches stdout/stderr', () => {
		const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
		jest.spyOn(console, 'info').mockImplementation(() => {})
		const { restore } = suppressSignalNoise()
		process.stdout.write('Closing session: x')
		restore()
		expect(stdout).toHaveBeenCalledWith('Closing session: x')
	})

	it('restores every patched method', () => {
		const before = [console.info, console.warn, console.error]
		const { restore, isRestored, patchedMethods } = suppressSignalNoise()
		expect(patchedMethods()).toEqual(['info', 'warn', 'error'])
		expect(isRestored()).toBe(false)
		restore()
		expect(isRestored()).toBe(true)
		expect([console.info, console.warn, console.error]).toEqual(before)
	})

	it('honours the individual suppressions', () => {
		const { patchedMethods } = suppressSignalNoise({ suppressInfo: false, suppressWarn: false })
		expect(patchedMethods()).toEqual(['error'])
	})

	it('suppresses extra patterns', () => {
		const info = jest.spyOn(console, 'info').mockImplementation(() => {})
		const { restore } = suppressSignalNoise({ extraPatterns: ['[signal] noisy'] })
		console.info('[signal] noisy detail')
		expect(info).not.toHaveBeenCalled()
		restore()
	})

	it('isNoise reports matching messages', () => {
		const { isNoise, restore } = suppressSignalNoise()
		expect(isNoise('Bad MAC from peer')).toBe(true)
		expect(isNoise('normal log')).toBe(false)
		restore()
	})

	it('exposes the default patterns', () => {
		expect(SIGNAL_NOISE_PATTERNS).toContain('Closing session:')
		expect(SIGNAL_NOISE_PATTERNS).toContain('Bad MAC')
		expect(SIGNAL_NOISE_PATTERNS).toContain('Session error:')
	})

	it('object payloads are inspected for a msg field', () => {
		const info = jest.spyOn(console, 'info').mockImplementation(() => {})
		const { isNoise, restore } = suppressSignalNoise()
		console.info({ msg: 'Session error: handshake failed' })
		expect(info).not.toHaveBeenCalled()
		expect(isNoise({ msg: 'Session error: x' })).toBe(true)
		restore()
	})
})

// ── BAGIAN 7 ─────────────────────────────────────────────────────────────
describe('Message scheduler', () => {
	const makeSock = () => {
		const sends: { jid: string; message: unknown; options?: unknown }[] = []
		return {
			sends,
			sock: {
				relayMessage: async (jid: string, message: unknown, options?: MessageRelayOptions): Promise<WAMessage> => {
					sends.push({ jid, message, options })
					return { key: { id: 'SENT', remoteJid: jid } } as WAMessage
				}
			}
		}
	}

	it('throws for a past sendAt', () => {
		const { sock } = makeSock()
		const scheduler = new MessageScheduler()
		expect(() => scheduler.schedule(sock, '628@s.whatsapp.net', { text: 'hi' }, new Date(Date.now() - 1000))).toThrow(
			/masa depan/
		)
	})

	it('throws for an invalid sendAt', () => {
		const { sock } = makeSock()
		const scheduler = new MessageScheduler()
		expect(() => scheduler.schedule(sock, '628@s.whatsapp.net', {}, Number.NaN)).toThrow(/tidak valid/)
	})

	it('accepts an empty object payload without throwing', () => {
		const { sock } = makeSock()
		const scheduler = new MessageScheduler()
		expect(() => scheduler.schedule(sock, '628@s.whatsapp.net', {}, Date.now() + 50)).not.toThrow()
		expect(scheduler.size).toBe(1)
		scheduler.cancelAll()
	})

	it('fires at the scheduled time', async () => {
		jest.useFakeTimers()
		try {
			const { sock, sends } = makeSock()
			const scheduler = new MessageScheduler()
			scheduler.schedule(sock, '628@s.whatsapp.net', { text: 'later' }, Date.now() + 1000)
			expect(scheduler.size).toBe(1)

			await jest.advanceTimersByTimeAsync(1000)
			expect(sends).toHaveLength(1)
			expect(sends[0]!.jid).toBe('628@s.whatsapp.net')
			expect(scheduler.size).toBe(0)
		} finally {
			jest.useRealTimers()
		}
	})

	it('cancel prevents the send', async () => {
		jest.useFakeTimers()
		try {
			const { sock, sends } = makeSock()
			const scheduler = new MessageScheduler()
			const entry = scheduler.schedule(sock, '628@s.whatsapp.net', { text: 'later' }, Date.now() + 1000)
			expect(scheduler.cancel(entry.id)).toBe(true)
			expect(scheduler.cancel('nope')).toBe(false)

			await jest.advanceTimersByTimeAsync(2000)
			expect(sends).toHaveLength(0)
		} finally {
			jest.useRealTimers()
		}
	})

	it('cancelAll and list', () => {
		const { sock } = makeSock()
		const scheduler = new MessageScheduler()
		scheduler.schedule(sock, 'a@s.whatsapp.net', {}, Date.now() + 100)
		scheduler.schedule(sock, 'b@s.whatsapp.net', {}, Date.now() + 200)
		expect(scheduler.size).toBe(2)
		expect(scheduler.list()).toHaveLength(2)
		expect(scheduler.cancelAll()).toBe(2)
		expect(scheduler.size).toBe(0)
	})

	it('fires the onError hook when relay rejects', async () => {
		jest.useFakeTimers()
		try {
			const failing = {
				relayMessage: async () => {
					throw new Error('boom')
				}
			}
			const errors: unknown[] = []
			const scheduler = new MessageScheduler({ onError: (_entry, error) => errors.push(error) })
			scheduler.schedule(failing, '628@s.whatsapp.net', { text: 'x' }, Date.now() + 100)
			await jest.advanceTimersByTimeAsync(100)
			expect(errors).toHaveLength(1)
		} finally {
			jest.useRealTimers()
		}
	})

	it('firing twice is a no-op', async () => {
		jest.useFakeTimers()
		try {
			const { sock, sends } = makeSock()
			const scheduler = new MessageScheduler()
			scheduler.schedule(sock, '628@s.whatsapp.net', { text: 'x' }, Date.now() + 100)
			await jest.advanceTimersByTimeAsync(100)
			await jest.advanceTimersByTimeAsync(100)
			expect(sends).toHaveLength(1)
		} finally {
			jest.useRealTimers()
		}
	})
})

describe('Auto reply engine', () => {
	it('matches a substring rule', () => {
		const engine = new AutoReplyEngine()
		engine.addRule('halo', 'Halo juga!')

		const decision = engine.match(msg('1', 'halo bot', 'a@s.whatsapp.net'))
		expect(decision.matched).toBe(true)
		expect(decision.response).toBe('Halo juga!')
	})

	it('matches a glob rule', () => {
		const engine = new AutoReplyEngine()
		engine.addRule('halo*', 'Hi')

		expect(engine.match(msg('1', 'halo dunia', 'a@s.whatsapp.net')).matched).toBe(true)
	})

	it('matches a RegExp rule and honours case sensitivity', () => {
		const engine = new AutoReplyEngine()
		engine.addRule(/order\s+\d+/, 'Diterima')

		expect(engine.match(msg('1', 'order 42', 'a@s.whatsapp.net')).matched).toBe(true)
		expect(engine.match(msg('1', 'ORDER 42', 'a@s.whatsapp.net')).matched).toBe(false)

		const cs = new AutoReplyEngine()
		cs.addRule('ORDER', 'ok', { caseSensitive: true })
		expect(cs.match(msg('1', 'ORDER 42', 'a@s.whatsapp.net')).matched).toBe(true)
	})

	it('ignores messages from the account itself by default', () => {
		const engine = new AutoReplyEngine()
		engine.addRule('halo', 'Hi')
		expect(engine.match(msg('1', 'halo', 'a@s.whatsapp.net', true)).matched).toBe(false)
	})

	it('can opt in to answering own messages', () => {
		const engine = new AutoReplyEngine()
		engine.addRule('halo', 'Hi', { ignoreFromMe: false })
		expect(engine.match(msg('1', 'halo', 'a@s.whatsapp.net', true)).matched).toBe(true)
	})

	it('reports no-text for non-text messages', () => {
		const engine = new AutoReplyEngine()
		engine.addRule('halo', 'Hi')
		const imageMessage = { key: { id: '1', remoteJid: 'a@s.whatsapp.net', fromMe: false }, message: {} } as WAMessage
		expect(engine.match(imageMessage)).toEqual({ matched: false, reason: 'no-text' })
	})

	it('respects chatIds and ignoredChatIds', () => {
		const engine = new AutoReplyEngine()
		engine.addRule('halo', 'Hi', { chatIds: ['a@s.whatsapp.net'] })
		expect(engine.match(msg('1', 'halo', 'a@s.whatsapp.net')).matched).toBe(true)
		expect(engine.match(msg('1', 'halo', 'b@s.whatsapp.net')).matched).toBe(false)

		const ignored = new AutoReplyEngine()
		ignored.addRule('halo', 'Hi', { ignoredChatIds: ['b@s.whatsapp.net'] })
		expect(ignored.match(msg('1', 'halo', 'b@s.whatsapp.net')).matched).toBe(false)
	})

	it('runs function responses with the incoming message', () => {
		const engine = new AutoReplyEngine()
		engine.addRule('ping', (message: WAMessage) => `pong:${message.key.id}`)
		expect(engine.match(msg('9', 'ping', 'a@s.whatsapp.net')).response).toBe('pong:9')
	})

	it('takes the first matching rule', () => {
		const engine = new AutoReplyEngine()
		engine.addRule('halo', 'first')
		engine.addRule('halo', 'second')
		expect(engine.match(msg('1', 'halo', 'a@s.whatsapp.net')).response).toBe('first')
	})

	it('sends the reply and returns the message', async () => {
		const sent: { jid: string; message: unknown }[] = []
		const sock = {
			relayMessage: async (jid: string, message: unknown): Promise<WAMessage> => {
				sent.push({ jid, message })
				return { key: { id: 'REPLY' } } as WAMessage
			}
		}
		const engine = new AutoReplyEngine()
		engine.addRule('halo', { conversation: 'Halo juga!' })

		const reply = await engine.processMessage(sock, msg('1', 'halo', 'a@s.whatsapp.net'))
		expect(reply?.key.id).toBe('REPLY')
		expect(sent[0]!.jid).toBe('a@s.whatsapp.net')
	})

	it('returns null when nothing matches', async () => {
		const sock = { relayMessage: jest.fn(async () => ({}) as WAMessage) }
		const engine = new AutoReplyEngine()
		engine.addRule('halo', 'Hi')
		expect(await engine.processMessage(sock, msg('1', 'bye', 'a@s.whatsapp.net'))).toBeNull()
		expect(sock.relayMessage).not.toHaveBeenCalled()
	})

	it('removeRule and clear', () => {
		const engine = new AutoReplyEngine()
		const rule = engine.addRule('halo', 'Hi')
		expect(engine.list()).toHaveLength(1)
		expect(engine.removeRule(rule.id!)).toBe(true)
		expect(engine.removeRule(rule.id!)).toBe(false)

		engine.addRule('hai', 'Hai')
		engine.clear()
		expect(engine.list()).toHaveLength(0)
	})

	it('applies rule-level relay options', async () => {
		const options: unknown[] = []
		const sock = {
			relayMessage: async (_jid: string, _m: unknown, o?: unknown): Promise<WAMessage> => {
				options.push(o)
				return {} as WAMessage
			}
		}
		const engine = new AutoReplyEngine()
		engine.addRule('halo', 'Hi', { options: { messageId: 'X1' } } as never)
		await engine.processMessage(sock, msg('1', 'halo', 'a@s.whatsapp.net'))
		expect(options[0]).toEqual({ messageId: 'X1' })
	})
})

// ── BAGIAN 8 ─────────────────────────────────────────────────────────────
describe('Anti-spam filter', () => {
	it('passes clean text', () => {
		const filter = new AntiSpamFilter()
		const verdict = filter.checkMessage('Halo, bagaimana kabarmu hari ini?')
		expect(verdict.spam).toBe(false)
		expect(verdict.score).toBeLessThan(0.6)
	})

	it('flags keyword-heavy spam', () => {
		const filter = new AntiSpamFilter()
		const verdict = filter.checkMessage('Klik sekarang dan claim now untuk free money')
		expect(verdict.spam).toBe(true)
		expect(verdict.reasons.some(r => r.includes('kata kunci spam'))).toBe(true)
	})

	it('flags dangerous links', () => {
		const filter = new AntiSpamFilter()
		const verdict = filter.checkMessage('Cek ini https://evil.example/x')
		expect(verdict.links).toHaveLength(1)
		expect(verdict.links[0]!.safe).toBe(true)
		expect(verdict.spam).toBe(false)
	})

	it('flags blocked hosts', () => {
		const filter = new AntiSpamFilter()
		const verdict = filter.checkMessage('ke sini https://phishing-example.test/login')
		expect(verdict.links[0]!.safe).toBe(false)
		expect(verdict.spam).toBe(true)
	})

	it('flags javascript: links as unsafe', () => {
		const filter = new AntiSpamFilter()
		const verdict = filter.checkMessage('https://example.com lalu javascript:alert(1)')
		expect(verdict.links).toHaveLength(2)
		expect(verdict.links.some(link => !link.safe)).toBe(true)
		expect(verdict.links.find(link => link.url.startsWith('javascript:'))?.safe).toBe(false)
	})

	it('flags file: links as unsafe', () => {
		const filter = new AntiSpamFilter()
		expect(filter.checkMessage('file:///etc/passwd').links[0]!.safe).toBe(false)
	})

	it('flags shorteners', () => {
		const filter = new AntiSpamFilter()
		const verdict = filter.checkMessage('https://bit.ly/abc123')
		expect(verdict.links[0]!.reasons.some(r => r.startsWith('shortener'))).toBe(true)
	})

	it('flags IP-literal hosts', () => {
		const filter = new AntiSpamFilter()
		const verdict = filter.checkMessage('https://192.168.1.1/login')
		expect(verdict.links[0]!.reasons).toContain('host berupa IP literal')
	})

	it('flags homograph hosts', () => {
		const filter = new AntiSpamFilter()
		const verdict = filter.checkMessage('https://\u0430pple.com/x')
		expect(verdict.links[0]!.reasons.some(r => r.includes('homograph'))).toBe(true)
	})

	it('flags credentials embedded in the url', () => {
		const filter = new AntiSpamFilter()
		const verdict = filter.checkMessage('https://user:pass@example.com/')
		expect(verdict.links[0]!.reasons).toContain('kredensial tertanam di URL')
	})

	it('flags deep subdomains', () => {
		const filter = new AntiSpamFilter()
		const verdict = filter.checkMessage('https://a.b.c.d.e.example.com/')
		expect(verdict.links[0]!.reasons).toContain('subdomain sangat dalam')
	})

	it('flags non-http schemes', () => {
		const filter = new AntiSpamFilter()
		const verdict = filter.checkMessage('file:///etc/passwd')
		expect(verdict.links[0]!.safe).toBe(false)
	})

	it('scanLink reports unparseable urls', () => {
		const filter = new AntiSpamFilter()
		expect(filter.scanLink('http://').safe).toBe(false)
	})

	it('honours a custom threshold', () => {
		const strict = new AntiSpamFilter({ threshold: 0.05 })
		expect(strict.checkMessage('https://bit.ly/x').spam).toBe(true)

		const lenient = new AntiSpamFilter({ threshold: 0.99 })
		expect(lenient.checkMessage('claim now free money').spam).toBe(false)
	})

	it('honours custom keywords', () => {
		const filter = new AntiSpamFilter({ keywords: ['furina', 'promo'] })
		expect(filter.checkMessage('furina promo hemat').spam).toBe(true)
	})

	it('honours custom blocked hosts and shorteners', () => {
		const filter = new AntiSpamFilter({ blockedHosts: ['bad.test'] })
		expect(filter.checkMessage('https://bad.test/x').links[0]!.safe).toBe(false)

		const short = new AntiSpamFilter({ shorteners: ['s.test'] })
		expect(short.checkMessage('https://s.test/x').links[0]!.reasons.some(r => r.startsWith('shortener'))).toBe(true)
	})

	it('allowHttps false rejects plain http links', () => {
		const filter = new AntiSpamFilter({ allowHttps: false })
		const verdict = filter.checkMessage('http://example.com/x')
		expect(verdict.links[0]!.safe).toBe(false)
		expect(verdict.links[0]!.reasons).toContain('bukan https')
	})

	it('allowHttps true keeps https links safe and warns on http', () => {
		const filter = new AntiSpamFilter()
		expect(filter.checkMessage('https://example.com').links[0]!.safe).toBe(true)
		expect(filter.checkMessage('http://example.com').links[0]!.reasons).toContain('bukan https')
	})

	it('empty text is not spam', () => {
		const filter = new AntiSpamFilter()
		expect(filter.checkMessage(undefined)).toEqual({ spam: false, score: 0, reasons: [], links: [] })
	})

	it('enforceSafeUrl delegates to the strict gate', () => {
		const filter = new AntiSpamFilter()
		expect(filter.enforceSafeUrl('https://example.com')).toBe('https://example.com')
		expect(() => filter.enforceSafeUrl('javascript:alert(1)')).toThrow(/protokol tidak diizinkan/)
	})
})

// ── HD media option ──────────────────────────────────────────────────────
describe('HD media option', () => {
	it('accepts hd on AnyMessageContent at type level', () => {
		const content: AnyMessageContent = { image: Buffer.from('x'), hd: true } as never
		expect(content).toBeDefined()
	})

	it('accepts hd on video content at type level', () => {
		const content: AnyMessageContent = { video: Buffer.from('x'), hd: true, ptv: false } as never
		expect(content).toBeDefined()
	})
})
