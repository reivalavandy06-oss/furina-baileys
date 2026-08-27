// member labels: teach the bot "who" someone is, not just "which id" they own.
// roles per group + custom tags + activity tracking, all auto-captured.

export type FurinaGroupRole = 'owner' | 'admin' | 'member'

export interface MemberLabelData {
	lid: string
	pn: string | null
	pushname: string | null
	// labels you set yourself — automation never touches these
	labels: string[]
	// labels derived from activity — safe to overwrite
	autoLabels: string[]
	groupRoles: { [groupId: string]: FurinaGroupRole }
	activity: { [groupId: string]: number }
	firstSeen: number
	lastSeen: number
}

export interface MemberLabelsConfig {
	maxMembers?: number
	activeThreshold?: number
	autoPopulate?: boolean
}

export class MemberLabelsManager {
	private members = new Map<string, MemberLabelData>()
	private maxMembers: number
	private activeThreshold: number
	private sock: any

	constructor(sock: any, config: MemberLabelsConfig = {}) {
		this.sock = sock
		this.maxMembers = config.maxMembers ?? 5000
		this.activeThreshold = config.activeThreshold ?? 10

		if (config.autoPopulate !== false) {
			this.attachEventListeners()
		}
	}

	private attachEventListeners() {
		// every incoming message teaches us a bit more about the sender
		this.sock.ev.on('messages.upsert', ({ messages }: any) => {
			for (const msg of messages) {
				this.captureFromMessage(msg)
			}
		})

		// promote/demote/add/remove keeps groupRoles fresh in real time
		this.sock.ev.on('group-participants.update', (event: any) => {
			this.captureFromParticipantsUpdate(event)
		})
	}

	private pickJid(a: string | undefined, b: string | undefined, suffix: string): string | null {
		if (a && a.endsWith(suffix)) return a
		if (b && b.endsWith(suffix)) return b
		return null
	}

	private ensure(lid: string): MemberLabelData {
		let entry = this.members.get(lid)
		if (!entry) {
			entry = {
				lid,
				pn: null,
				pushname: null,
				labels: [],
				autoLabels: ['new_member'],
				groupRoles: {},
				activity: {},
				firstSeen: Date.now(),
				lastSeen: Date.now()
			}
			this.members.set(lid, entry)
			this.evictIfNeeded()
		}
		return entry
	}

	// drop the oldest-seen member so memory never blows up
	private evictIfNeeded(): void {
		if (this.members.size <= this.maxMembers) return

		let oldestKey: string | null = null
		let oldestTime = Infinity
		for (const [key, data] of this.members) {
			if (data.lastSeen < oldestTime) {
				oldestTime = data.lastSeen
				oldestKey = key
			}
		}
		if (oldestKey) this.members.delete(oldestKey)
	}

	private captureFromMessage(msg: any): void {
		const key = msg?.key
		if (!key || key.fromMe) return

		const lid = this.pickJid(key.participant, key.participantAlt, '@lid')
		const pn = this.pickJid(key.participant, key.participantAlt, '@s.whatsapp.net')
		if (!lid) return

		const groupId = typeof key.remoteJid === 'string' && key.remoteJid.endsWith('@g.us') ? key.remoteJid : null
		const entry = this.ensure(lid)

		if (pn && !entry.pn) entry.pn = pn
		if (msg.pushName && !entry.pushname) entry.pushname = msg.pushName
		entry.lastSeen = Date.now()

		if (groupId) {
			if (!entry.groupRoles[groupId]) entry.groupRoles[groupId] = 'member'

			const count = (entry.activity[groupId] ?? 0) + 1
			entry.activity[groupId] = count

			// chatty enough = active member
			if (count >= this.activeThreshold && !entry.autoLabels.includes('active_member')) {
				entry.autoLabels.push('active_member')
			}

			// talked a few times = not "new" anymore
			if (count >= 3 && entry.autoLabels.includes('new_member')) {
				entry.autoLabels = entry.autoLabels.filter((l) => l !== 'new_member')
			}
		}
	}

	private captureFromParticipantsUpdate(event: any): void {
		const groupId = event?.id
		if (!groupId || !Array.isArray(event.participants)) return

		for (const raw of event.participants) {
			const lid = typeof raw === 'string' ? raw : raw?.id
			if (!lid) continue

			const entry = this.ensure(lid)
			switch (event.action) {
				case 'promote':
					entry.groupRoles[groupId] = 'admin'
					break
				case 'demote':
					entry.groupRoles[groupId] = 'member'
					break
				case 'add':
				case 'join':
					if (!entry.groupRoles[groupId]) entry.groupRoles[groupId] = 'member'
					if (!entry.autoLabels.includes('new_member')) entry.autoLabels.push('new_member')
					break
				case 'remove':
				case 'leave':
					delete entry.groupRoles[groupId]
					break
				default:
					break
			}
			entry.lastSeen = Date.now()
		}
	}

	// ---- manual labeling: your rules, automation never overrides ----
	setLabel(lid: string, label: string): void {
		const entry = this.ensure(lid)
		if (!entry.labels.includes(label)) entry.labels.push(label)
	}

	removeLabel(lid: string, label: string): void {
		const entry = this.members.get(lid)
		if (!entry) return
		entry.labels = entry.labels.filter((l) => l !== label)
	}

	hasLabel(lid: string, label: string): boolean {
		return this.getAllLabels(lid).includes(label)
	}

	// ---- reads ----
	getLabel(lid: string): MemberLabelData | null {
		return this.members.get(lid) ?? null
	}

	getAllLabels(lid: string): string[] {
		const entry = this.members.get(lid)
		if (!entry) return []
		return [...entry.labels, ...entry.autoLabels]
	}

	getRoleInGroup(lid: string, groupId: string): FurinaGroupRole {
		const entry = this.members.get(lid)
		return entry?.groupRoles[groupId] ?? 'member'
	}

	filterByLabel(label: string): MemberLabelData[] {
		const out: MemberLabelData[] = []
		for (const entry of this.members.values()) {
			if (entry.labels.includes(label) || entry.autoLabels.includes(label)) out.push(entry)
		}
		return out
	}

	// ---- sync roles straight from server truth ----
	async syncGroupRoles(groupId: string): Promise<number> {
		try {
			const meta = await this.sock.groupMetadata(groupId)
			const participants: any[] = Array.isArray(meta?.participants) ? meta.participants : []

			for (const p of participants) {
				const id = p?.id
				if (!id) continue
				const entry = this.ensure(id)
				entry.groupRoles[groupId] = p.admin === 'superadmin' ? 'owner' : p.admin === 'admin' ? 'admin' : 'member'
			}
			return participants.length
		} catch (e) {
			return 0
		}
	}

	// ---- stats & housekeeping ----
	stats(): { totalMembers: number; maxMembers: number } {
		return { totalMembers: this.members.size, maxMembers: this.maxMembers }
	}

	clearAll(): void {
		this.members.clear()
	}

	// ---- persistence: you decide where to save it ----
	exportAll(): MemberLabelData[] {
		return Array.from(this.members.values())
	}

	importAll(data: MemberLabelData[]): void {
		if (!Array.isArray(data)) return
		for (const item of data) {
			if (item?.lid) this.members.set(item.lid, item)
		}
	}
}

// one manager per socket, no duplicate listeners ever
const managerInstances = new WeakMap<any, MemberLabelsManager>()

export function getMemberLabelsManager(sock: any, config?: MemberLabelsConfig): MemberLabelsManager {
	let manager = managerInstances.get(sock)
	if (!manager) {
		manager = new MemberLabelsManager(sock, config)
		managerInstances.set(sock, manager)
	}
	return manager
}
