export const deferred = () => {
	let release!: () => void
	const promise = new Promise<void>(resolve => {
		release = resolve
	})
	return { promise, release }
}

type Point = { operation: string; phase: 'before' | 'after' }
type Rule = Point & { remaining: number; error?: Error; gate?: ReturnType<typeof deferred> }

/** Records operation names only: payloads, credentials and key bytes never enter the trace. */
export class StorageFaults {
	readonly trace: Point[] = []
	private rules: Rule[] = []
	private gates = new Set<ReturnType<typeof deferred>>()
	private unavailable?: Error

	fail(operation: string, phase: Point['phase'] = 'before', nth = 1, error = new Error('synthetic storage failure')) {
		this.rules.push({ operation, phase, remaining: nth, error })
		return error
	}

	hold(operation: string, phase: Point['phase'] = 'before') {
		const gate = deferred()
		const entered = deferred()
		this.gates.add(gate)
		this.rules.push({ operation, phase, remaining: 1, gate })
		this.arrivals.set(gate, entered)
		return { entered: entered.promise, release: gate.release }
	}

	private arrivals = new Map<ReturnType<typeof deferred>, ReturnType<typeof deferred>>()

	disconnect(error = new Error('synthetic connection unavailable')) {
		this.unavailable = error
		return error
	}

	reconnect() {
		this.unavailable = undefined
	}

	private visit(operation: string, phase: Point['phase']) {
		this.trace.push({ operation, phase })
		if (this.unavailable) throw this.unavailable
		const rule = this.rules.find(item => item.operation === operation && item.phase === phase)
		if (!rule || --rule.remaining > 0) return
		this.rules.splice(this.rules.indexOf(rule), 1)
		if (rule.error) throw rule.error
		if (rule.gate) this.arrivals.get(rule.gate)?.release()
		return rule.gate
	}

	sync<T>(operation: string, action: () => T): T {
		if (this.visit(operation, 'before')) throw new Error('Cannot hold a synchronous driver operation')
		const result = action()
		if (this.visit(operation, 'after')) throw new Error('Cannot hold a synchronous driver operation')
		return result
	}

	async async<T>(operation: string, action: () => Promise<T>): Promise<T> {
		const before = this.visit(operation, 'before')
		if (before) await before.promise
		if (this.unavailable) throw this.unavailable
		const result = await action()
		const after = this.visit(operation, 'after')
		if (after) await after.promise
		if (this.unavailable) throw this.unavailable
		return result
	}

	dispose() {
		for (const gate of this.gates) gate.release()
		this.gates.clear()
		this.arrivals.clear()
		this.rules = []
		this.reconnect()
	}
}
