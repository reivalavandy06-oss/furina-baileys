// Wrapper for REAL backend integration suites.
//
// A backend that cannot be exercised is reported as SKIPPED with the blocker in
// the suite title. It is never reported as passed, and it never appears in the
// default unit run — only `*.integration.ts` files are matched by the dedicated
// integration script.
//
// Jest requires suites to be declared synchronously, so the async availability
// probe is resolved at module scope (top-level await, ESM ts-jest) and the
// `describe` body itself stays synchronous.

import { CHECKS, isReady, type BackendName, type Readiness } from './availability'
import { createIntegrationStores } from './stores'

export const integrationSuite = async (
	label: string,
	backend: BackendName,
	body: (ready: Readiness, stores: ReturnType<typeof createIntegrationStores>) => void
): Promise<void> => {
	const check = await CHECKS[backend]()

	if (!isReady(check)) {
		describe(`${label} — NOT RUN: ${check.reason}`, () => {
			// Skipped, not passed: the suite was declared but never exercised.
			it.skip('no isolated real backend is available for this run', () => {
				throw new Error(`suite never executed: ${check.reason}`)
			})
		})
		return
	}

	const ready = check
	const stores = createIntegrationStores()

	describe(`${label} — real ${backend} (namespace per run)`, () => {
		// The context registers cleanup in dependency order, including failed setup.
		afterAll(async () => {
			await stores.disposeAll()
		})

		body(ready, stores)
	})
}

/**
 * Migration suites need BOTH backends, so they cannot use this wrapper. They
 * resolve their directions up front (see `migration.integration.ts`) and declare
 * synchronous suites with the same "skipped, not passed" marker.
 */
export const blockedMarker = (reason: string): void => {
	describe(`— NOT RUN: ${reason}`, () => {
		it.skip('no isolated real backend is available for this run', () => {
			throw new Error(`suite never executed: ${reason}`)
		})
	})
}
