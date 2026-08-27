// LID Resolver - Complete bidirectional mapping system
// Handles LID ↔ PN (Phone Number) conversion with auto-population from messages

export interface FurinaLIDMapping {
	lid: string
	pn: string
	timestamp: number
}

export interface LIDResolverConfig {
	maxCacheSize?: number
	autoPopulate?: boolean
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

	private attachEventListeners() {
		// Auto-populate from incoming messages
		this.sock.ev.on('messages.upsert', async ({ messages }: any) => {
			for (const msg of messages) {
				await this.extractAndStoreMapping(msg)
			}
		})

		// Auto-populate from lid-mapping.update events (if available)
		this.sock.ev.on('lid-mapping.update', async ({ lid, pn }: any) => {
			await this.storeMapping(lid, pn)
		})
	}

	private async extractAndStoreMapping(msg: any) {
		if (!msg.key) return

		const { participant, participantAlt, remoteJid } = msg.key
		const fromMe = msg.key.fromMe

		if (fromMe) return

		// Try to extract LID and PN from message
		const lid = participant?.includes('@lid') ? participant : participantAlt?.includes('@lid') ? participantAlt : null
		const pn = participant?.includes('@s.whatsapp.net') ? participant : participantAlt?.includes('@s.whatsapp.net') ? participantAlt : null

		if (lid && pn) {
			await this.storeMapping(lid, pn)
		}
	}

	async storeMapping(lid: string, pn: string) {
		const timestamp = Date.now()
		const mapping: FurinaLIDMapping = { lid, pn, timestamp }

		// Store forward mapping (LID -> PN)
		this.mappings.set(lid, mapping)

		// Store reverse mapping (PN -> LID)
		this.reverseMappings.set(pn, mapping)

		// Enforce cache size limit
		if (this.mappings.size > this.maxCacheSize) {
			const oldestKey = this.mappings.keys().next().value
			if (oldestKey) {
				const oldMapping = this.mappings.get(oldestKey)
				if (oldMapping) {
					this.mappings.delete(oldestKey)
					this.reverseMappings.delete(oldMapping.pn)
				}
			}
		}

		// Try to store in signalRepository if available
		try {
			if (this.sock.signalRepository?.lidMapping?.storeLIDPNMappings) {
				await this.sock.signalRepository.lidMapping.storeLIDPNMappings([{ lid, pn }])
			}
		} catch (e) {
			// Silent fail if signalRepository not available
		}
	}

	async resolveLID(pn: string): Promise<string | null> {
		// Check cache first
		const cached = this.reverseMappings.get(pn)
		if (cached) return cached.lid

		// Try signalRepository
		try {
			if (this.sock.signalRepository?.lidMapping?.getLIDForPN) {
				const lid = await this.sock.signalRepository.lidMapping.getLIDForPN(pn)
				if (lid) {
					await this.storeMapping(lid, pn)
					return lid
				}
			}
		} catch (e) {
			// Silent fail
		}

		return null
	}

	async resolvePN(lid: string): Promise<string | null> {
		// Check cache first
		const cached = this.mappings.get(lid)
		if (cached) return cached.pn

		// Try signalRepository
		try {
			if (this.sock.signalRepository?.lidMapping?.getPNForLID) {
				const pn = await this.sock.signalRepository.lidMapping.getPNForLID(lid)
				if (pn) {
					await this.storeMapping(lid, pn)
					return pn
				}
			}
		} catch (e) {
			// Silent fail
		}

		return null
	}

	getMapping(lid: string): FurinaLIDMapping | null {
		return this.mappings.get(lid) ?? null
	}

	getAllMappings(): FurinaLIDMapping[] {
		return Array.from(this.mappings.values())
	}

	clearCache() {
		this.mappings.clear()
		this.reverseMappings.clear()
	}
}

// Singleton manager for global resolver instances
const resolverInstances = new WeakMap<any, LIDResolver>()

export function getLIDResolver(sock: any, config?: LIDResolverConfig): LIDResolver {
	let resolver = resolverInstances.get(sock)
	if (!resolver) {
		resolver = new LIDResolver(sock, config)
		resolverInstances.set(sock, resolver)
	}
	return resolver
}
