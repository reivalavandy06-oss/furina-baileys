// furina-baileys — panorama-profile.ts
// Panorama profile pictures (square + wide banner pair).
//
// WhatsApp's panorama profile expects two images derived from one source:
// a square crop (typically 640x640) and a wide banner crop. We reuse the same
// optional image libraries as the media pipeline — `sharp` when available,
// otherwise `jimp`.

import { Boom } from '@hapi/boom'
import type { WAMediaUpload } from '../Types'

export interface PanoramaProfileResult {
	/** square crop, e.g. 640x640 */
	square: Buffer
	/** wide banner crop, capped at `maxWidth` */
	wide: Buffer
	squareWidth: number
	squareHeight: number
	wideWidth: number
	wideHeight: number
	/** which optional library produced the crops */
	processor: 'sharp' | 'jimp'
}

export interface PanoramaProfileOptions {
	/** square crop side length; default 640 */
	squareSize?: number
	/** banner max width; default 1280 */
	maxWidth?: number
	/** banner aspect (w/h); default 3 */
	bannerAspect?: number
	/** square crop origin; default 'center' */
	focus?: 'center' | 'top' | 'bottom' | 'left' | 'right'
}

const JIMP_SPECIFIER = 'jimp'
const SHARP_SPECIFIER = 'sharp'

type SharpFactory = (buffer: Buffer) => {
	resize: (
		width: number,
		height: number,
		opts: { fit: string; position: string }
	) => {
		toBuffer: () => Promise<Buffer>
	}
}

interface JimpInstance {
	resize: (opts: { w: number; h: number }) => JimpInstance
	getBuffer: (mime: string, options: unknown) => Promise<Buffer>
}

interface ImageProcessor {
	processor: 'sharp' | 'jimp'
	resize: (buffer: Buffer, size: { width: number; height: number }) => Promise<Buffer>
}

const loadProcessor = async (): Promise<ImageProcessor> => {
	// Optional peer dependencies: never installed by default. The specifiers are
	// held in variables so TypeScript cannot resolve them statically.
	const [jimp, sharp] = await Promise.all([
		import(/* webpackIgnore: true */ JIMP_SPECIFIER).catch(() => undefined),
		import(/* webpackIgnore: true */ SHARP_SPECIFIER).catch(() => undefined)
	])

	if (sharp) {
		const lib = (sharp as unknown as { default?: unknown }).default ?? sharp
		return {
			processor: 'sharp',
			resize: async (buffer, size) =>
				await (lib as unknown as SharpFactory)(buffer)
					.resize(size.width, size.height, { fit: 'cover', position: 'centre' })
					.toBuffer()
		}
	}

	if (jimp) {
		const Jimp = jimp.Jimp ?? jimp.default
		return {
			processor: 'jimp',
			resize: async (buffer, size) =>
				await Jimp.read(buffer).then((image: JimpInstance) =>
					// jimp's `resize`/`cover` mutate in place and chain back to the image.
					image.resize({ w: size.width, h: size.height }).getBuffer('image/png', {})
				)
		}
	}

	throw new Boom('Tidak ada image processing library (install `sharp` atau `jimp`)', { statusCode: 400 })
}

const toBuffer = async (media: WAMediaUpload): Promise<Buffer> => {
	if (Buffer.isBuffer(media)) return media
	if (typeof media === 'string') {
		if (/^https?:\/\//i.test(media)) {
			const response = await fetch(media)
			if (!response.ok) {
				throw new Boom(`gagal mengunduh media: HTTP ${response.status}`, { statusCode: 400 })
			}
			return Buffer.from(await response.arrayBuffer())
		}
		const { readFile } = await import('fs/promises')
		return await readFile(media)
	}
	throw new Boom('media harus Buffer, path, atau URL http(s)', { statusCode: 400 })
}

/**
 * Produces the square + banner pair for a panorama profile picture.
 * Throws when neither `sharp` nor `jimp` is installed.
 */
export const buildPanoramaProfileImages = async (
	media: WAMediaUpload,
	options: PanoramaProfileOptions = {}
): Promise<PanoramaProfileResult> => {
	const squareSize = options.squareSize ?? 640
	const maxWidth = options.maxWidth ?? 1280
	const aspect = options.bannerAspect ?? 3

	const buffer = await toBuffer(media)
	const processor = await loadProcessor()

	const square = await processor.resize(buffer, { width: squareSize, height: squareSize })
	const wideHeight = Math.round(maxWidth / aspect)
	const wide = await processor.resize(buffer, { width: maxWidth, height: wideHeight })

	return {
		square,
		wide,
		squareWidth: squareSize,
		squareHeight: squareSize,
		wideWidth: maxWidth,
		wideHeight,
		processor: processor.processor
	}
}

/** Computes the banner height for a given max width and aspect. */
export const panoramaBannerHeight = (maxWidth: number, aspect = 3): number => Math.round(maxWidth / aspect)

// ── socket integration ───────────────────────────────────────────────────
/** Minimal shape of the socket methods this helper relies on. */
export interface PanoramaSocket {
	waUploadToServer: (path: string, opts: { mediaType: string }) => Promise<{ mediaUrl: string; directPath: string }>
	query: (node: unknown, timeoutMs?: number) => Promise<unknown>
	updateProfilePicture?: (jid: string, media: Buffer) => Promise<boolean>
	logger?: { info?: (...args: unknown[]) => void; error?: (...args: unknown[]) => void }
}

export interface UpdatePanoramaOptions extends PanoramaProfileOptions {
	/** IQ timeout in ms; default 15s */
	timeoutMs?: number
}

/**
 * Sets a panorama profile picture: generates the square + banner pair, uploads
 * them, and applies them to the account.
 *
 * NOTE: NEEDS VERIFICATION — the exact IQ node WhatsApp uses for panorama
 * profile pictures is not part of the bundled proto. The upload step is the
 * standard media path; the panorama-specific stanza may need adjusting against
 * a live account.
 */
export const updatePanoramaProfilePicture = async (
	sock: PanoramaSocket,
	jid: string,
	media: WAMediaUpload,
	options: UpdatePanoramaOptions = {}
): Promise<{ ok: boolean; appliedVia?: string; note: string }> => {
	const images = await buildPanoramaProfileImages(media, options)

	// waUploadToServer expects a file path, so stage the buffers first.
	const { mkdtemp, writeFile, rm } = await import('fs/promises')
	const { tmpdir } = await import('os')
	const { join } = await import('path')

	const folder = await mkdtemp(join(tmpdir(), 'furina-panorama-'))
	const squarePath = join(folder, 'square.png')
	const widePath = join(folder, 'wide.png')
	await writeFile(squarePath, images.square)
	await writeFile(widePath, images.wide)

	try {
		await Promise.all([
			sock.waUploadToServer(squarePath, { mediaType: 'image' }),
			sock.waUploadToServer(widePath, { mediaType: 'image' })
		])
	} finally {
		await rm(folder, { recursive: true, force: true }).catch(() => {})
	}

	if (typeof sock.updateProfilePicture === 'function') {
		const applied = await sock.updateProfilePicture(jid, images.square)
		return {
			ok: !!applied,
			appliedVia: 'updateProfilePicture',
			note: 'square applied via socket helper; banner needs a panorama-specific IQ stanza (NEEDS VERIFICATION)'
		}
	}

	// Fall back to an explicit panorama IQ stanza.
	const result = (await sock.query(
		{
			tag: 'iq',
			attrs: { to: jid, type: 'set', xmlns: 'w:profile:picture' },
			content: [
				{
					tag: 'picture',
					attrs: {
						type: 'image',
						id: 'panorama',
						'panorama-banner-width': String(images.wideWidth),
						'panorama-banner-height': String(images.wideHeight)
					}
				}
			]
		},
		options.timeoutMs ?? 15_000
	)) as { attrs?: { type?: string } } | undefined

	return {
		ok: result?.attrs?.type !== 'error',
		note: 'panorama IQ stanza sent — NEEDS VERIFICATION against a live account'
	}
}
