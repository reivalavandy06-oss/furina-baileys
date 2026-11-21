import { fork } from 'child_process'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'
import { createFileAuthStore } from '../../../Utils/auth-store'
import { migrateAuthState } from '../../../Utils/auth/migration-manager'

describe('process interruption with isolated synthetic file records', () => {
	it.each(['snapshot', 'partial', 'verify', 'rollback'])(
		'characterizes %s crash and offline retry',
		async point => {
			const root = await mkdtemp(join(tmpdir(), 'furina-crash-'))
			const child = fork(fileURLToPath(new URL('./fixtures/crash-child.ts', import.meta.url)), [root, point], {
				execArgv: ['--import', 'tsx'],
				stdio: ['ignore', 'ignore', 'ignore', 'ipc']
			})
			const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
			let timer: NodeJS.Timeout | undefined
			try {
				await new Promise<void>((resolve, reject) => {
					timer = setTimeout(() => reject(new Error('Synthetic child did not reach its IPC barrier')), 60_000)
					child.once('message', message =>
						message === 'ready' ? resolve() : reject(new Error('Unexpected fixture IPC'))
					)
					child.once('error', reject)
					child.once('exit', () => reject(new Error('Synthetic child exited before the crash barrier')))
				})
				clearTimeout(timer)
				child.kill('SIGKILL')
				await exited
				const source = await createFileAuthStore(join(root, 'source'))
				const destination = await createFileAuthStore(join(root, 'destination'))
				expect(await source.keys()).toHaveLength(100)
				expect(await destination.get('sentinel')).toBe('retained')
				const count = (await destination.keys()).filter(key => key !== 'sentinel').length
				if (point === 'snapshot') expect(count).toBe(1)
				if (point === 'partial') expect(count).toBe(40)
				if (point === 'verify') expect(count).toBe(100)
				if (point === 'rollback') expect(count).toBeGreaterThan(0)
				await migrateAuthState(source, destination)
				expect(await destination.get('record-99')).toBe('synthetic-99')
				expect(await destination.get('sentinel')).toBe('retained')
			} finally {
				clearTimeout(timer)
				if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
				await exited
				await rm(root, { recursive: true, force: true })
			}
		},
		90_000
	)
})
