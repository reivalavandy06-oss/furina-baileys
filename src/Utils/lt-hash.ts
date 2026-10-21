import { hkdf } from './crypto'

/**
 * LT Hash is a summation based hash algorithm that maintains the integrity of a piece of data
 * over a series of mutations. You can add/remove mutations and it'll return a hash equal to
 * if the same series of mutations was made sequentially.
 *
 * Pure-JS port of the upstream algorithm (pre whatsapp-rust-bridge). That package is
 * ESM-only — its exports map has no `require` condition — so the CJS build of this
 * library cannot load it, while app-state patch hashing only needs plain hkdf anyway.
 */
const o = 128

class LTHashAntiTampering {
	salt: string

	constructor(salt: string) {
		this.salt = salt
	}

	add(e: Uint8Array, addList: Uint8Array[]): Uint8Array {
		for (const item of addList) {
			e = this.mixSingle(e, item, (a, b) => a + b)
		}

		return e
	}

	subtract(e: Uint8Array, subtractList: Uint8Array[]): Uint8Array {
		for (const item of subtractList) {
			e = this.mixSingle(e, item, (a, b) => a - b)
		}

		return e
	}

	subtractThenAdd(e: Uint8Array, subtractList: Uint8Array[], addList: Uint8Array[]): Uint8Array {
		const subtracted = this.subtract(e, subtractList)
		return this.add(subtracted, addList)
	}

	private expandIndex(index: Uint8Array): Uint8Array {
		return new Uint8Array(hkdf(Buffer.from(index), o, { info: this.salt }))
	}

	private mixSingle(e: Uint8Array, t: Uint8Array, op: (a: number, b: number) => number): Uint8Array {
		const derived = this.expandIndex(t)
		const base = new DataView(e.buffer, e.byteOffset, e.byteLength)
		const expanded = new DataView(derived.buffer, derived.byteOffset, derived.byteLength)
		const out = new Uint8Array(base.byteLength)
		const view = new DataView(out.buffer)

		for (let offset = 0; offset < base.byteLength; offset += 2) {
			view.setUint16(offset, op(base.getUint16(offset, true), expanded.getUint16(offset, true)), true)
		}

		return out
	}
}

export const LT_HASH_ANTI_TAMPERING = new LTHashAntiTampering('WhatsApp Patch Integrity')
