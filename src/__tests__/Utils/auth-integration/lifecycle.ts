/// <reference lib="es2021.promise" />

type Status = 'pending' | 'running' | 'succeeded' | 'failed' | 'timed-out' | 'blocked'
export interface DisposalResult {
	label: string
	status: Status
	error?: unknown
	completion?: Promise<void>
	eventualStatus?: 'succeeded' | 'failed'
}
interface Entry extends DisposalResult {
	dispose: () => void | Promise<void>
	dependencies: Array<{ label: string; requireSuccess: boolean }>
}

export const createDisposalRegistry = ({ timeoutMs = 10_000 }: { timeoutMs?: number } = {}) => {
	const entries = new Map<string, Entry>()
	let disposing: Promise<void> | undefined
	const assertOpen = () => {
		if (disposing) throw new Error('Cannot create or register resources during or after cleanup')
	}
	const track = (
		labelOrDispose: string | (() => void | Promise<void>),
		dispose?: () => void | Promise<void>
	): string => {
		assertOpen()
		const label = typeof labelOrDispose === 'string' ? labelOrDispose : `resource-${entries.size + 1}`
		const action = typeof labelOrDispose === 'function' ? labelOrDispose : dispose
		if (!action || entries.has(label)) throw new Error('Invalid or duplicate cleanup label')
		entries.set(label, { label, dispose: action, status: 'pending', dependencies: [] })
		return label
	}
	const addDependency = (label: string, dependency: string, requireSuccess = false) => {
		assertOpen()
		const entry = entries.get(label)
		if (!entry || !entries.has(dependency)) throw new Error('Unknown cleanup dependency')
		entry.dependencies.push({ label: dependency, requireSuccess })
	}
	const disposeAll = (): Promise<void> => {
		if (disposing) return disposing
		disposing = Promise.resolve().then(async () => {
			const errors: unknown[] = []
			const visiting = new Set<string>()
			const visit = async (entry: Entry): Promise<void> => {
				if (visiting.has(entry.label)) throw new Error('Circular cleanup dependency')
				if (entry.status !== 'pending') return
				visiting.add(entry.label)
				for (const dependency of entry.dependencies) {
					const parent = entries.get(dependency.label)!
					await visit(parent)
					if (
						!['succeeded', 'failed'].includes(parent.status) ||
						(dependency.requireSuccess && parent.status !== 'succeeded')
					) {
						entry.status = 'blocked'
						entry.error = new Error(`Cleanup dependency unresolved: ${parent.label}`)
						errors.push(entry.error)
						visiting.delete(entry.label)
						return
					}
				}
				visiting.delete(entry.label)
				entry.status = 'running'
				const operation = Promise.resolve().then(entry.dispose)
				entry.completion = operation
				void operation.then(
					() => {
						entry.eventualStatus = 'succeeded'
					},
					error => {
						entry.eventualStatus = 'failed'
						entry.error = error
					}
				)
				let timedOut = false
				try {
					await new Promise<void>((resolve, reject) => {
						const timer = setTimeout(() => {
							timedOut = true
							entry.status = 'timed-out'
							reject(new Error(`Cleanup timed out and may still be running: ${entry.label}`))
						}, timeoutMs)
						operation.then(
							() => {
								clearTimeout(timer)
								resolve()
							},
							error => {
								clearTimeout(timer)
								reject(error)
							}
						)
					})
					entry.status = 'succeeded'
				} catch (error) {
					if (!timedOut) entry.status = 'failed'
					entry.error = error
					errors.push(error)
				}
			}
			for (const entry of [...entries.values()].reverse()) {
				try {
					await visit(entry)
				} catch (error) {
					entry.status = 'failed'
					entry.error = error
					errors.push(error)
				}
			}
			if (errors.length) {
				const error = new AggregateError(errors, 'Integration resource cleanup failed')
				Object.defineProperty(error, 'results', { get: () => getResults() })
				throw error
			}
		})
		return disposing
	}
	const getResults = (): DisposalResult[] =>
		[...entries.values()].map(({ label, status, error, completion, eventualStatus }) => ({
			label,
			status,
			error,
			completion,
			eventualStatus
		}))
	return { track, disposeAll, assertOpen, addDependency, getResults }
}
