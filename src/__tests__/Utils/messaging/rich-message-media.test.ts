import { afterAll } from '@jest/globals'
import { proto } from '../../../../WAProto'
import {
	__setMediaPreparer,
	buildAlbumMessage,
	sendAlbum,
	sendStatusMentions
} from '../../../Utils/messaging/rich-message'
import type { FurinaSocket } from '../../../Utils/messaging/types'
import type { WAMessage } from '../../../Types'

// Media paths must never touch the network/ffmpeg in unit tests.
__setMediaPreparer((async (content: { caption?: string; video?: unknown }) => {
	const caption = content.caption
	return 'video' in content ? { videoMessage: { caption } } : { imageMessage: { caption } }
}) as never)
afterAll(() => __setMediaPreparer(null))

const imageBuffer = () => Buffer.alloc(16, 1)
const videoBuffer = () => {
	const buffer = Buffer.alloc(16, 0)
	buffer.write('ftyp', 4, 'ascii')
	return buffer
}

const makeSock = () => {
	const calls: { jid: string; content: proto.IMessage; options?: unknown }[] = []
	const sock = {
		relayMessage: async (jid: string, content: proto.IMessage, options?: unknown) => {
			calls.push({ jid, content, options })
			return { key: { id: `M${calls.length}`, remoteJid: jid } } as WAMessage
		},
		waUploadToServer: async () => ({ mediaUrl: 'https://mmg.example/x', directPath: '/x' })
	} as unknown as FurinaSocket

	return { sock, calls }
}

describe('buildAlbumMessage', () => {
	it('counts images and videos', () => {
		const { albumMessage } = buildAlbumMessage([imageBuffer(), videoBuffer()])
		expect(albumMessage.expectedImageCount).toBe(1)
		expect(albumMessage.expectedVideoCount).toBe(1)
	})
})

describe('sendAlbum (mocked media)', () => {
	it('relays every media with the same mediagroup id', async () => {
		const { sock, calls } = makeSock()
		const results = await sendAlbum(sock, '6281234567890@s.whatsapp.net', [imageBuffer(), imageBuffer()], 'cap')

		expect(results).toHaveLength(2)
		expect(calls).toHaveLength(2)

		const groupIds = calls.map(
			call => (call.options as { additionalAttributes?: Record<string, string> }).additionalAttributes?.mediagroup
		)
		expect(groupIds[0]).toBeTruthy()
		expect(groupIds[0]).toBe(groupIds[1])
	})

	it('normalizes the jid and captions only the first media', async () => {
		const { sock, calls } = makeSock()
		await sendAlbum(sock, '6281234567890:5@s.whatsapp.net', [imageBuffer(), imageBuffer()], 'cap')

		expect(calls[0]!.jid).toBe('6281234567890@s.whatsapp.net')
		expect(calls[0]!.content.imageMessage?.caption).toBe('cap')
		expect(calls[1]!.content.imageMessage?.caption).toBeFalsy()
	})

	it('sends video media for video buffers', async () => {
		const { sock, calls } = makeSock()
		await sendAlbum(sock, '6281234567890@s.whatsapp.net', [videoBuffer()])
		expect(calls[0]!.content.videoMessage).toBeDefined()
	})
})

describe('sendStatusMentions media (mocked media)', () => {
	it('builds an image message for image statuses', async () => {
		const { sock, calls } = makeSock()
		await sendStatusMentions(sock, { image: imageBuffer(), text: 'cap' }, ['628111@s.whatsapp.net'])

		expect(calls[0]!.content.imageMessage?.caption).toBe('cap')
	})

	it('builds a video message for video statuses', async () => {
		const { sock, calls } = makeSock()
		await sendStatusMentions(sock, { video: videoBuffer() }, ['628111@s.whatsapp.net'])
		expect(calls[0]!.content.videoMessage).toBeDefined()
	})
})
