
import { hkdf } from './crypto'

class LTHashAntiTampering {
    private expandIndex(index: Buffer): Buffer {
        return hkdf(index, 128, { info: '' })
    }

    private xorBuffers(a: Buffer, b: Buffer): Buffer {
        const result = Buffer.alloc(a.length)
        for(let i = 0; i < a.length; i++) {
            // FIX Error TS2532 Object is possibly 'undefined'
            result[i] = (a[i] ?? 0) ^ (b[i] ?? 0)
        }
        return result
    }

    subtractThenAdd(base: Uint8Array, subBuffs: Uint8Array[], addBuffs: Uint8Array[]): Uint8Array {
        let current = Buffer.from(base)
        for(const removal of subBuffs) {
            const expanded = this.expandIndex(Buffer.from(removal))
            current = this.xorBuffers(current, expanded)
        }
        for(const addition of addBuffs) {
            const expanded = this.expandIndex(Buffer.from(addition))
            current = this.xorBuffers(current, expanded)
        }
        return current
    }
}

export const LT_HASH_ANTI_TAMPERING = new LTHashAntiTampering()