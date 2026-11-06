// furina-baileys — scheduler.ts
// Message scheduling.
//
// A pure in-process scheduler: entries live in memory and are fired from a
// timer. There is no durability — a restart drops pending messages, which is
// the documented contract (a persistent queue would need a storage backend).

import type { WAMessage } from '../Types'

export interface ScheduledEntry {
	id: string
	jid: string
	content: unknown
	sendAt: Date
	createdAt: Date
	options?: Record<string, unknown>
}

export interface ScheduleOptions {
	/** relay options forwarded to `sock.relayMessage` */
	options?: Record<string, unknown>
	/** caller-supplied id (otherwise generated) */
	id?: string
}

export interface SchedulerResultSent {
	ok: true
	id: string
	message: WAMessage
}

export interface SchedulerResultFailed {
	ok: false
	id: string
	error: unknown
}

export type SchedulerResult = SchedulerResultSent | SchedulerResultFailed

/** Minimal socket surface the scheduler needs. */
export interface ScheduleSocket {
	relayMessage: (jid: string, message: unknown, options?: Record<string, unknown>) => Promise<WAMessage>
}

export interface SchedulerHooks {
	onSent?: (entry: ScheduledEntry, result: SchedulerResultSent) => void
	onError?: (entry: ScheduledEntry, error: unknown) => void
	onCancel?: (id: string) => void
}

const generateId = () => `sched_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

export class MessageScheduler {
	private timers = new Map<string, ReturnType<typeof setTimeout>>()
	private entries = new Map<string, ScheduledEntry>()
	private hooks: SchedulerHooks

	constructor(hooks: SchedulerHooks = {}) {
		this.hooks = hooks
	}

	/** Number of pending entries. */
	get size(): number {
		return this.entries.size
	}

	/**
	 * Schedules a message. `sendAt` in the past throws, because silently
	 * sending immediately hides caller bugs.
	 */
	schedule(
		sock: ScheduleSocket,
		jid: string,
		content: unknown,
		sendAt: Date | number,
		options: ScheduleOptions = {}
	): ScheduledEntry {
		const when = sendAt instanceof Date ? sendAt : new Date(sendAt)
		if (!Number.isFinite(when.getTime())) {
			throw new Error('[furina-scheduler] sendAt tidak valid')
		}
		if (when.getTime() <= Date.now()) {
			throw new Error('[furina-scheduler] sendAt harus di masa depan')
		}

		const id = options.id ?? generateId()
		const entry: ScheduledEntry = {
			id,
			jid,
			content,
			sendAt: when,
			createdAt: new Date(),
			options: options.options
		}

		this.clear(id)
		this.entries.set(id, entry)

		const timer = setTimeout(() => {
			void this.fire(sock, id)
		}, when.getTime() - Date.now())
		// Do not hold the event loop open just for scheduled messages.
		timer.unref?.()
		this.timers.set(id, timer)

		return entry
	}

	/** Cancels a pending entry. Returns true when something was cancelled. */
	cancel(id: string): boolean {
		const removed = this.clear(id)
		if (removed) this.hooks.onCancel?.(id)
		return removed
	}

	/** Cancels every pending entry. */
	cancelAll(): number {
		const ids = [...this.entries.keys()]
		for (const id of ids) this.cancel(id)
		return ids.length
	}

	/** Lists pending entries (copy). */
	list(): ScheduledEntry[] {
		return [...this.entries.values()]
	}

	/** Looks up a pending entry. */
	get(id: string): ScheduledEntry | undefined {
		return this.entries.get(id)
	}

	/** Drops all timers/entries without calling hooks. */
	dispose(): void {
		for (const timer of this.timers.values()) clearTimeout(timer)
		this.timers.clear()
		this.entries.clear()
	}

	private clear(id: string): boolean {
		const timer = this.timers.get(id)
		if (timer) clearTimeout(timer)
		const hadTimer = this.timers.delete(id)
		const hadEntry = this.entries.delete(id)
		return hadTimer || hadEntry
	}

	private async fire(sock: ScheduleSocket, id: string): Promise<void> {
		const entry = this.entries.get(id)
		if (!entry) return

		this.clear(id)

		try {
			const message = await sock.relayMessage(entry.jid, entry.content, entry.options)
			const result: SchedulerResultSent = { ok: true, id, message }
			this.hooks.onSent?.(entry, result)
		} catch (error) {
			this.hooks.onError?.(entry, error)
		}
	}
}
