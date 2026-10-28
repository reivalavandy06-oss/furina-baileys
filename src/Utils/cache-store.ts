import { LRUCache } from 'lru-cache'
import type { CacheStore } from '../Types/Socket'

export class LRUCacheStore<V extends {} = {}> implements CacheStore {
	private cache: LRUCache<string, V>

	constructor(options: { max?: number; ttl?: number } = {}) {
		this.cache = new LRUCache<string, V>({
			max: options.max ?? 0,
			ttl: options.ttl ? options.ttl * 1000 : undefined,
			ttlAutopurge: true,
			allowStale: false,
		})
	}

	get<T = V>(key: string): T | undefined {
		return this.cache.get(key) as T | undefined
	}

	set<T = V>(key: string, value: T): boolean {
		this.cache.set(key, value as unknown as V)
		return true
	}

	del(key: string): boolean {
		return this.cache.delete(key)
	}

	flushAll(): void {
		this.cache.clear()
	}

	close(): void {}

	mget<T = V>(keys: string[]): Promise<Record<string, T | undefined>> {
		const result: Record<string, T | undefined> = {}
		for (const key of keys) {
			result[key] = this.cache.get(key) as T | undefined
		}
		return Promise.resolve(result)
	}

	mset<T = V>(entries: { key: string; value: T }[]): boolean {
		for (const { key, value } of entries) {
			this.cache.set(key, value as unknown as V)
		}
		return true
	}

	mdel(keys: string[]): boolean {
		let deleted = false
		for (const key of keys) {
			if (this.cache.delete(key)) {
				deleted = true
			}
		}
		return deleted
	}
}