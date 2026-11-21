import { createFileAuthStore } from '../../../../Utils/auth-store'
import { migrateAuthState } from '../../../../Utils/auth/migration-manager'
import { join } from 'path'

async function main() {
	const [root, point] = process.argv.slice(2)
	if (!root || !point || !process.send) throw new Error('Synthetic crash fixture requires IPC and a private directory')
	const source = await createFileAuthStore(join(root, 'source'))
	const destination = await createFileAuthStore(join(root, 'destination'))
	await source.setMany(
		Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`record-${index}`, `synthetic-${index}`]))
	)
	await destination.set('record-0', 'old-value')
	await destination.set('sentinel', 'retained')
	const pause = async (): Promise<never> => {
		process.send?.('ready')
		return new Promise<never>(() => undefined)
	}
	let phase = ''
	await migrateAuthState(
		source,
		{
			...destination,
			getMany: async keys => {
				const found = await destination.getMany(keys)
				if (point === 'verify' && phase === 'verify') await pause()
				return found
			},
			setMany: async entries => {
				if (point === 'snapshot') await pause()
				let written = 0
				for (const [key, value] of Object.entries(entries)) {
					await destination.set(key, value)
					if (++written === 40) {
						if (point === 'partial') await pause()
						if (point === 'rollback') throw new Error('synthetic write failure')
					}
				}
			},
			set: async (key, value) => {
				await destination.set(key, value)
				if (point === 'rollback' && phase === 'rollback') await pause()
			},
			remove: async key => {
				const removed = await destination.remove(key)
				if (point === 'rollback' && phase === 'rollback') await pause()
				return removed
			}
		},
		{
			onProgress: step => {
				phase = step
			}
		}
	)
	throw new Error('Crash barrier was not reached')
}
void main().catch(() => process.exit(1))
