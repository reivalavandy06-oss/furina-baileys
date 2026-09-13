// furina-baileys — lid-resolver.ts
// Bidirectional LID ↔ PN mapping dengan auto-populate dari berbagai event.
//
// Sumber mapping:
//   1. messages.upsert       → group (participant/participantAlt) + private (remoteJid/remoteJidAlt)
//   2. lid-mapping.update    → event resmi dari Baileys
//   3. messaging-history.set → batch sync saat bot pertama connect
//   4. contacts.upsert       → kontak baru disave
//   5. contacts.update       → kontak yang berubah
//
// Keterbatasan:
//   LID → PN cuma bisa dari cache/signalRepository. USync nggak support arah ini
//   karena WhatsApp sengaja sembunyiin PN dari LID untuk privacy.

import type { Contact } from '../Types'

export interface FurinaLIDMapping {
	lid: string
	pn: string
	timestamp: number
}

export interface LIDResolverConfig {
	maxCacheSize?: number
	autoPopulate?: boolean
}

// Normalisasi JID: buang device suffix (123456:0@lid → 123456@lid).
// Tanpa ini, mapping ke-store dua kali untuk device berbeda.
export function normalizeJid(jid: string): string {
	if (!jid) return jid
	const at = jid.indexOf('@')
	if (at === -1) return jid
	const user = jid.slice(0, at).split(':')[0]
	return `${user}${jid.slice(at)}`
}

export class LIDResolver {
	private mappings = new Map<string, FurinaLIDMapping>()
	private reverseMappings = new Map<string, FurinaLIDMapping>()
	private maxCacheSize: number
	private autoPopulate: boolean
	private sock: any

	constructor(sock: any, config: LIDResolverConfig = {}) {
		this.sock = sock
		this.maxCacheSize = config.maxCacheSize ?? 10000
		this.autoPopulate = config.autoPopulate ?? true

		if (this.autoPopulate) {
			this.attachEventListeners()
		}
	}

	// ===== FURINA: EVENT LISTENERS =====

	private attachEventListeners() {
		// Pesan masuk & pesan sendiri (fromMe nggak di-skip — bot butuh capture
		// mapping saat dia kirim ke LID juga)
		this.sock.ev.on('messages.upsert', async ({ messages }: any) => {
			for (const msg of messages) {
				await this.extractAndStoreMapping(msg)
			}
		})

		// Event resmi Baileys saat mapping baru diketahui
		this.sock.ev.on('lid-mapping.update', async ({ lid, pn }: any) => {
			if (lid && pn) await this.storeMapping(lid, pn)
		})

		// History sync saat bot pertama connect — batch besar mapping
		this.sock.ev.on('messaging-history.set', async (data: any) => {
			if (Array.isArray(data?.contacts)) {
				for (const c of data.contacts) await this.extractFromContact(c)
			}
			if (Array.isArray(data?.lidPnMappings)) {
				for (const pair of data.lidPnMappings) {
					if (pair?.lid && pair?.pn) await this.storeMapping(pair.lid, pair.pn)
				}
			}
		})

		// Kontak baru disave → mapping muncul
		this.sock.ev.on('contacts.upsert', async (contacts: Contact[]) => {
			for (const c of contacts) await this.extractFromContact(c)
		})

		// Kontak yang di-update
		this.sock.ev.on('contacts.update', async (updates: Partial<Contact>[]) => {
			for (const c of updates) await this.extractFromContact(c)
		})
	}

	// ===== FURINA: EXTRACTION =====

	private async extractAndStoreMapping(msg: any) {
		if (!msg?.key) return

		const { participant, participantAlt, remoteJid, remoteJidAlt } = msg.key

		// Kumpulin semua kandidat dari group + private
		const candidates = [participant, participantAlt, remoteJid, remoteJidAlt].filter(
			(j): j is string => typeof j === 'string' && j.length > 0
		)

		const lidJids = candidates.filter((j) => j.endsWith('@lid'))
		const pnJids = candidates.filter((j) => j.endsWith('@s.whatsapp.net') || j.endsWith('@hosted'))

		// Butuh minimal 1 LID + 1 PN untuk bikin mapping
		if (!lidJids.length || !pnJids.length) return

		for (const lid of lidJids) {
			for (const pn of pnJids) {
				await this.storeMapping(lid, pn)
			}
		}
	}

	private async extractFromContact(c: Partial<Contact>) {
		if (!c) return

		const lid = c.lid ?? (c.id?.endsWith('@lid') ? c.id : null)
		const pn = c.phoneNumber ?? (c.id?.endsWith('@s.whatsapp.net') ? c.id : null)

		if (lid && pn) await this.storeMapping(lid, pn)
	}

	// ===== FURINA: STORAGE =====

	async storeMapping(lid: string, pn: string) {
		const normLid = normalizeJid(lid)
		const normPn = normalizeJid(pn)
		const timestamp = Date.now()
		const mapping: FurinaLIDMapping = { lid: normLid, pn: normPn, timestamp }

		this.mappings.set(normLid, mapping)
		this.reverseMappings.set(normPn, mapping)

		// Enforce cache size — buang yang paling lama
		if (this.mappings.size > this.maxCacheSize) {
			const oldestKey = this.mappings.keys().next().value
			if (oldestKey) {
				const old = this.mappings.get(oldestKey)
				if (old) {
					this.mappings.delete(oldestKey)
					this.reverseMappings.delete(old.pn)
				}
			}
		}

		// Sinkron ke signalRepository biar persist antar restart
		try {
			if (this.sock.signalRepository?.lidMapping?.storeLIDPNMappings) {
				await this.sock.signalRepository.lidMapping.storeLIDPNMappings([{ lid: normLid, pn: normPn }])
			}
		} catch {
			// signalRepository opsional
		}
	}

	// ===== FURINA: RESOLVE =====

	async resolveLID(pn: string): Promise<string | null> {
		const normPn = normalizeJid(pn)

		// 1. Cache internal
		const cached = this.reverseMappings.get(normPn)
		if (cached) return cached.lid

		// 2. signalRepository (sumber resmi)
		try {
			const lid = await this.sock.signalRepository?.lidMapping?.getLIDForPN?.(normPn)
			if (lid) {
				await this.storeMapping(lid, normPn)
				return normalizeJid(lid)
			}
		} catch {
			// silent — signalRepository opsional
		}

		return null
	}

	async resolvePN(lid: string): Promise<string | null> {
		const normLid = normalizeJid(lid)

		// 1. Cache internal
		const cached = this.mappings.get(normLid)
		if (cached) return cached.pn

		// 2. signalRepository
		try {
			const pn = await this.sock.signalRepository?.lidMapping?.getPNForLID?.(normLid)
			if (pn) {
				const normPn = normalizeJid(pn)
				await this.storeMapping(normLid, normPn)
				return normPn
			}
		} catch {
			// silent
		}

		// 3. Miss — USync nggak support arah LID → PN (limitation WhatsApp).
		// Mapping cuma bisa dari pesan masuk / history sync / contacts.
		console.debug(
			`[furina-resolver] resolvePN miss: ${lid}. ` +
			`Mapping belum ke-capture. LID → PN nggak bisa lewat USync.`
		)
		return null
	}

	// ===== FURINA: CACHE ACCESS =====

	getMapping(lid: string): FurinaLIDMapping | null {
		return this.mappings.get(normalizeJid(lid)) ?? null
	}

	getAllMappings(): FurinaLIDMapping[] {
		return Array.from(this.mappings.values())
	}

	clearCache() {
		this.mappings.clear()
		this.reverseMappings.clear()
	}
}

// Singleton per socket
const resolverInstances = new WeakMap<any, LIDResolver>()

export function getLIDResolver(sock: any, config?: LIDResolverConfig): LIDResolver {
	let resolver = resolverInstances.get(sock)
	if (!resolver) {
		resolver = new LIDResolver(sock, config)
		resolverInstances.set(sock, resolver)
	}
	return resolver
}