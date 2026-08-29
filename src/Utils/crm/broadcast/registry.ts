// registry.ts — registry channel persist ke file JSON
// Kenapa ada: upstream Baileys TIDAK punya API list channel (issue #1903),
// jadi kita simpan sendiri channel yang pernah di-resolve biar user
// nggak perlu paste link berulang-ulang.
//
// Default file: furina-broadcast-channel.json (bisa custom / null = disable)

import * as fs from 'fs'
import type { CRMChannelRegistry } from '../types'

export const DEFAULT_REGISTRY_FILE = 'furina-broadcast-channel.json'

export class CRMChannelRegistryStore {
	private path: string
	private channels: CRMChannelRegistry[] = []

	constructor(filePath: string = DEFAULT_REGISTRY_FILE) {
		this.path = filePath
		this.load()
	}

	// Muat dari disk (aman kalau file rusak/hilang)
	private load(): void {
		try {
			if (fs.existsSync(this.path)) {
				const raw = fs.readFileSync(this.path, 'utf8')
				const parsed = JSON.parse(raw)
				this.channels = Array.isArray(parsed?.channels) ? parsed.channels : []
			}
		} catch (err) {
			// File corrupt → mulai kosong, jangan crash
			this.channels = []
		}
	}

	// Simpan ke disk
	private save(): void {
		try {
			fs.writeFileSync(this.path, JSON.stringify({ channels: this.channels }, null, 2))
		} catch (err) {
			console.warn('[REGISTRY] gagal save:', (err as any)?.message ?? err)
		}
	}

	// Tambah / update channel (keyed by jid, anti-duplikat)
	add(entry: CRMChannelRegistry): void {
		const idx = this.channels.findIndex((c) => c.jid === entry.jid)

		if (idx >= 0) {
			this.channels[idx] = entry
		} else {
			this.channels.push(entry)
		}

		this.save()
	}

	// Hapus channel dari registry
	remove(jid: string): void {
		this.channels = this.channels.filter((c) => c.jid !== jid)
		this.save()
	}

	// Ambil satu channel
	get(jid: string): CRMChannelRegistry | null {
		return this.channels.find((c) => c.jid === jid) ?? null
	}

	// List semua channel tersimpan
	list(): CRMChannelRegistry[] {
		return [...this.channels]
	}
}
