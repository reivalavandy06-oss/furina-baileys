// quarantine.ts — persistensi grup yang kena 403
//
// Kenapa file terpisah: kalau grup dibombardir ulang setiap bot start, skor
// ban naik terus dan grup yang tadinya bisa dikirim lagi malah rusak.
// Follow the CRMChannelRegistryStore pattern (registry.ts) — JSON file, load
// sinkron di constructor, tulis hanya saat berubah.
//
// Isi file sengaja minimal: JID grup, waktu, dan status code. Tidak ada stack
// atau payload mentah yang bisa bocor ke disk.

import * as fs from 'fs'

export const DEFAULT_QUARANTINE_FILE = 'furina-broadcast-quarantine.json'

// Bump kalau bentuk file berubah, supaya file versi lama diabaikan dengan
// sengaja dan bukan dibaca setengah jadi.
const FILE_VERSION = 1

export interface QuarantineEntry {
	// Epoch ms saat grup masuk quarantine.
	at: number
	// Status code yang memicu quarantine. Angka saja, aman disimpan.
	code: number
}

interface QuarantineFile {
	version: number
	entries: Record<string, QuarantineEntry>
}

export class BroadcastQuarantineStore {
	private path: string
	private entries = new Map<string, QuarantineEntry>()

	constructor(filePath: string) {
		this.path = filePath
		this.load()
	}

	// Muat sekali di constructor. Kalau file corrupt atau versinya beda, mulai
	// dari kosong dan beri tahu operator — diam-diam mengulang 403 ke grup yang
	// sama justru bahaya.
	private load(): void {
		try {
			if (!fs.existsSync(this.path)) return
			const parsed = JSON.parse(fs.readFileSync(this.path, 'utf8'))
			if (parsed?.version !== FILE_VERSION) {
				console.warn('[QUARANTINE] versi file tidak dikenal, quarantine diabaikan:', this.path)
				return
			}
			const raw = parsed?.entries
			if (!raw || typeof raw !== 'object') return

			for (const [jid, value] of Object.entries(raw)) {
				const at = Number((value as QuarantineEntry)?.at)
				if (!Number.isFinite(at)) continue
				const code = Number((value as QuarantineEntry)?.code)
				this.entries.set(jid, { at, code: Number.isFinite(code) ? code : 0 })
			}
		} catch (err) {
			this.entries.clear()
			console.warn('[QUARANTINE] file tidak bisa dibaca, mulai kosong:', (err as Error)?.message ?? err)
		}
	}

	// Tulis lewat file sementara lalu rename: rename atomik di filesystem yang
	// sama, jadi file tidak pernah tertinggal dalam keadaan terpotong.
	private save(): boolean {
		const payload: QuarantineFile = {
			version: FILE_VERSION,
			entries: Object.fromEntries(this.entries)
		}
		const tmp = `${this.path}.tmp`
		try {
			fs.writeFileSync(tmp, JSON.stringify(payload, null, 2))
			fs.renameSync(tmp, this.path)
			return true
		} catch (err) {
			console.warn('[QUARANTINE] gagal menyimpan state:', (err as Error)?.message ?? err)
			try {
				if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
			} catch {
				// best effort bersih-bersih file sisa
			}
			return false
		}
	}

	has(jid: string): boolean {
		return this.entries.has(jid)
	}

	get(jid: string): QuarantineEntry | null {
		return this.entries.get(jid) ?? null
	}

	// Idempoten: tambah group yang sama dua kali tetap satu entry.
	// Mengembalikan false kalau gagal ditulis, supaya pemanggil bisa tahu
	// state-nya cuma hidup di memori.
	add(jid: string, code: number): boolean {
		const existing = this.entries.get(jid)
		if (existing && existing.code === code) return true

		this.entries.set(jid, { at: Date.now(), code })
		return this.save()
	}

	remove(jid: string): boolean {
		if (!this.entries.delete(jid)) return true
		return this.save()
	}

	clear(): boolean {
		if (this.entries.size === 0) return true
		this.entries.clear()
		return this.save()
	}

	list(): string[] {
		return Array.from(this.entries.keys())
	}

	get size(): number {
		return this.entries.size
	}
}