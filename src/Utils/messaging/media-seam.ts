// Internal media-preparation seam shared by the messaging helpers.
//
// Production resolves to the real `prepareWAMessageMedia`. Unit tests override
// it to avoid ffmpeg/network. This is NOT part of the public API.
import { prepareWAMessageMedia } from '../messages'

export type MediaPreparer = typeof prepareWAMessageMedia

let override: MediaPreparer | null = null

export const getMediaPreparer = (): MediaPreparer => override ?? prepareWAMessageMedia

export function setMediaPreparer(fn: MediaPreparer | null): void {
	override = fn
}
