import { createBackendChecks } from './availability'

const config = {
	FURINA_TEST_REDIS_URL: 'redis://127.0.0.1:1',
	FURINA_TEST_NEKODB_HOST: 'test.invalid',
	FURINA_TEST_NEKODB_USERNAME: 'synthetic',
	FURINA_TEST_NEKODB_PASSWORD: 'synthetic',
	FURINA_TEST_NEKODB_TEST_INSTANCE: '1'
}

describe('integration readiness with test doubles', () => {
	it.each(['redis', 'nekodb', 'sqlite'] as const)('blocks %s if its driver is absent', async backend => {
		const checks = createBackendChecks(config, async () => {
			throw new Error('synthetic missing driver')
		})
		expect(await checks[backend]()).toMatchObject({ available: false, driver: false })
	})
	it('requires a Redis test endpoint even with a driver', async () => {
		const checks = createBackendChecks({}, async () => ({}))
		expect(await checks.redis()).toMatchObject({ available: false, driver: true })
	})
	it.each(['https://test.invalid', 'not-a-url', 'redis://test.invalid'])('rejects unsafe endpoint %s', async url => {
		const checks = createBackendChecks({ FURINA_TEST_REDIS_URL: url }, async () => ({}))
		expect(await checks.redis()).toMatchObject({ available: false })
	})
	it('rejects glob prefixes and a false Neko isolation assertion', async () => {
		const checks = createBackendChecks(
			{ ...config, FURINA_TEST_REDIS_PREFIX: '*', FURINA_TEST_NEKODB_TEST_INSTANCE: 'false' },
			async () => ({})
		)
		expect(await checks.redis()).toMatchObject({ available: false })
		expect(await checks.nekodb()).toMatchObject({ available: false })
	})
	it('reuses namespaces for reopening and separates independent runs', async () => {
		const checks = createBackendChecks(config, async () => ({}))
		for (const backend of ['redis', 'nekodb', 'sqlite'] as const) {
			expect(await checks[backend]()).toEqual(await checks[backend]())
			expect(await checks[backend]()).not.toEqual(await createBackendChecks(config, async () => ({}))[backend]())
		}
	})
})
