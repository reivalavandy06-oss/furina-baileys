/// <reference lib="es2021.promise" />

export const createDisposalRegistry = () => {
	const handles: Array<() => void | Promise<void>> = []
	let disposing: Promise<void> | undefined
	let finished = false
	const track = (dispose: () => void | Promise<void>) => {
		if (finished || disposing) throw new Error('Cannot register resources during or after cleanup')
		handles.push(dispose)
	}
	const disposeAll = (): Promise<void> => {
		if (disposing) return disposing
		disposing = Promise.resolve().then(async () => {
			const errors: unknown[] = []
			while (handles.length) {
				try {
					await handles.pop()?.()
				} catch (error) {
					errors.push(error)
				}
			}
			finished = true
			if (errors.length) throw new AggregateError(errors, 'Integration resource cleanup failed')
		})
		return disposing
	}
	return { track, disposeAll }
}
