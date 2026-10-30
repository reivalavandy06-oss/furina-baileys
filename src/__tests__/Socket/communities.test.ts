import { Boom } from '@hapi/boom'
import { extractCommunityMetadata } from '../../Socket/communities'
import type { BinaryNode } from '../../WABinary'

const minimalCommunityNode = (
	tag: 'community' | 'group',
	overrides: Partial<BinaryNode['attrs']> = {}
): BinaryNode => ({
	tag,
	attrs: {
		id: '120363000000000000',
		creation: '1700000000',
		s_t: '1700000000',
		subject: 'Test Community',
		...overrides
	},
	content: []
})

describe('extractCommunityMetadata', () => {
	it('parses a valid <community> node', () => {
		const result: BinaryNode = {
			tag: 'iq',
			attrs: { type: 'result' },
			content: [minimalCommunityNode('community')]
		}

		const meta = extractCommunityMetadata(result)

		expect(meta.id).toBe('120363000000000000@g.us')
		expect(meta.subject).toBe('Test Community')
	})

	it('falls back to a <group> node when <community> is missing (Issue #2753)', () => {
		const result: BinaryNode = {
			tag: 'iq',
			attrs: { type: 'result' },
			content: [minimalCommunityNode('group', { id: '120363000000000001', subject: 'Group As Community' })]
		}

		const meta = extractCommunityMetadata(result)

		expect(meta.id).toBe('120363000000000001@g.us')
		expect(meta.subject).toBe('Group As Community')
	})

	it('prefers <community> over <group> when both are present', () => {
		const result: BinaryNode = {
			tag: 'iq',
			attrs: { type: 'result' },
			content: [
				minimalCommunityNode('community', { subject: 'Community Node' }),
				minimalCommunityNode('group', { subject: 'Group Node' })
			]
		}

		expect(extractCommunityMetadata(result).subject).toBe('Community Node')
	})

	it('throws a Boom 502 when neither <community> nor <group> is present', () => {
		const result: BinaryNode = { tag: 'iq', attrs: { type: 'result' }, content: [] }

		const captured = captureThrow(() => extractCommunityMetadata(result))
		expect(captured).toBeInstanceOf(Boom)
		expect((captured as Boom).output.statusCode).toBe(502)
		expect((captured as Error).message).toBe('missing community/group node in metadata')
	})
})

const captureThrow = (fn: () => unknown): unknown => {
	try {
		fn()
	} catch (err) {
		return err
	}

	throw new Error('expected function to throw')
}
