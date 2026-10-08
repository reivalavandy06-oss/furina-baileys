import { MemberLabelsManager } from '../../Utils/member-labels'

// Device suffix dirotasi WhatsApp, tapi label/role harus nempel ke satu orang.
const LID_12 = '99887766:12@lid'
const LID_34 = '99887766:34@lid'
const LID_CANONICAL = '99887766@lid'
const GROUP = '1234567890-1234567891@g.us'

const makeSock = () => ({ ev: { on: () => {} } })

describe('MemberLabelsManager key normalization', () => {
	it('resolves two device JIDs to a single member entry', () => {
		const manager = new MemberLabelsManager(makeSock(), { autoPopulate: false })

		manager.setLabel(LID_12, 'vip')
		manager.setLabel(LID_34, 'admin')

		expect(manager.stats().totalMembers).toBe(1)
		expect(manager.getAllLabels(LID_CANONICAL).sort()).toEqual(['admin', 'new_member', 'vip'])
	})

	it('reads labels back through any device variant', () => {
		const manager = new MemberLabelsManager(makeSock(), { autoPopulate: false })

		manager.setLabel(LID_12, 'vip')

		expect(manager.hasLabel(LID_34, 'vip')).toBe(true)
		expect(manager.getLabel(LID_CANONICAL)?.lid).toBe(LID_CANONICAL)
	})

	it('removes a label via a different device variant', () => {
		const manager = new MemberLabelsManager(makeSock(), { autoPopulate: false })

		manager.setLabel(LID_12, 'vip')
		manager.removeLabel(LID_34, 'vip')

		expect(manager.getAllLabels(LID_CANONICAL)).toEqual(['new_member'])
	})

	it('keeps group roles on the one canonical entry', () => {
		const manager = new MemberLabelsManager(makeSock(), { autoPopulate: false })

		manager.setLabel(LID_12, 'vip')
		// role diset via device berbeda harusnya ketemu entry yang sama
		const entry = manager.getLabel(LID_34)!
		entry.groupRoles[GROUP] = 'admin'

		expect(manager.getRoleInGroup(LID_CANONICAL, GROUP)).toBe('admin')
		expect(manager.stats().totalMembers).toBe(1)
	})

	it('stores the canonical JID on the record so export is stable', () => {
		const manager = new MemberLabelsManager(makeSock(), { autoPopulate: false })

		manager.setLabel(LID_12, 'vip')

		expect(manager.exportAll().map(m => m.lid)).toEqual([LID_CANONICAL])
	})

	it('canonicalizes keys and records on importAll', () => {
		const manager = new MemberLabelsManager(makeSock(), { autoPopulate: false })

		manager.importAll([
			{
				lid: LID_12,
				pn: null,
				pushname: null,
				labels: ['a'],
				autoLabels: [],
				groupRoles: {},
				activity: {},
				firstSeen: 1,
				lastSeen: 2
			},
			{
				lid: LID_34,
				pn: null,
				pushname: null,
				labels: ['b'],
				autoLabels: [],
				groupRoles: {},
				activity: {},
				firstSeen: 1,
				lastSeen: 2
			}
		])

		// Dua record = satu orang, jadi satu entry. importAll last-write-wins
		// per key, jadi record terakhir yang label-nya yang bertahan.
		expect(manager.stats().totalMembers).toBe(1)
		expect(manager.getAllLabels(LID_CANONICAL)).toEqual(['b'])
		expect(manager.exportAll()[0]?.lid).toBe(LID_CANONICAL)
	})

	it('counts messages from two devices as one member', () => {
		const listeners: Record<string, (payload: any) => void> = {}
		const sock = {
			ev: {
				on: (event: string, handler: any) => {
					listeners[event] = handler
				}
			}
		}
		const manager = new MemberLabelsManager(sock)

		const groupMessage = (participant: string) => ({
			key: { id: `m-${participant}`, remoteJid: GROUP, participant, participantAlt: participant, fromMe: false },
			pushName: 'Someone'
		})

		listeners['messages.upsert']?.({ messages: [groupMessage(LID_12)] })
		listeners['messages.upsert']?.({ messages: [groupMessage(LID_34)] })

		expect(manager.stats().totalMembers).toBe(1)
		const entry = manager.getLabel(LID_CANONICAL)!
		expect(entry.activity[GROUP]).toBe(2)
		expect(manager.getRoleInGroup(LID_34, GROUP)).toBe('member')
	})
})
