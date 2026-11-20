#!/usr/bin/env node
// Reports whether real-backend integration tests can run, then optionally runs them.
//
// A backend that is unavailable is reported as NOT RUN. It is never counted as
// passing, and no integration test is launched for it.
//
// Usage: node --import tsx scripts/check-integration-env.ts [--run]
//
// Configuration is read from explicit environment variables only. `.env` is never
// read, and credentials are never printed. The suites themselves are excluded from
// the default unit run, which matches only `*.test.ts`.

import { spawn } from 'node:child_process'
import {
	CHECKS,
	isReady,
	type BackendCheck,
	type BackendName
} from '../src/__tests__/Utils/auth-integration/availability.ts'

const BACKENDS: BackendName[] = ['nekodb', 'sqlite', 'redis']

/** Blockers are read only through the availability guard, never off the union. */
const blocker = (check: BackendCheck): string | null => (check.available ? null : check.reason)

const printMatrix = (checks: Record<BackendName, BackendCheck>) => {
	console.log('| Backend | Real driver available | Isolated test instance | Integration status |')
	console.log('|---|---|---|---|')

	for (const backend of BACKENDS) {
		const check = checks[backend]
		console.log(
			isReady(check)
				? `| ${backend} | yes | ${check.isolation} | run |`
				: `| ${backend} | ${check.driver ? 'yes' : 'no'} | not verified | NOT RUN — ${blocker(check)} |`
		)
	}
}

const runIntegration = () =>
	new Promise<number>(resolve => {
		const child = spawn(
			'node',
			[
				'--experimental-vm-modules',
				'node_modules/jest/bin/jest.js',
				'--runInBand',
				'--testMatch',
				'**/*.integration.ts'
			],
			{ stdio: 'inherit' }
		)
		child.on('exit', code => resolve(code ?? 1))
		child.on('error', () => resolve(1))
	})

const main = async () => {
	const checks: Record<BackendName, BackendCheck> = {
		nekodb: await CHECKS.nekodb(),
		sqlite: await CHECKS.sqlite(),
		redis: await CHECKS.redis()
	}

	printMatrix(checks)

	if (!process.argv.includes('--run')) return

	const running = BACKENDS.filter(backend => checks[backend].available)
	const blocked = BACKENDS.filter(backend => !checks[backend].available)

	if (running.length === 0) {
		console.log('\nIntegration execution is BLOCKED: no real backend is available.')
		for (const backend of blocked) console.log(`  - ${backend}: ${blocker(checks[backend])}`)
		console.log('\nIntegration tests were NOT RUN. The default unit suite is unaffected.')
		process.exit(2)
	}

	console.log(`\nRunning integration tests for: ${running.join(', ')}`)
	console.log(`NOT RUN (no isolated backend): ${blocked.join(', ') || '(none)'}`)
	process.exit(await runIntegration())
}

main().catch(() => {
	console.error('Integration runner failed; test environment could not be verified.')
	process.exit(1)
})
