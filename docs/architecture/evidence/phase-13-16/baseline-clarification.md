# Baseline Clarification — Phase 13.15

Read-only audit. No production source, test assertions, Jest configuration, package metadata, or other files were changed.

## 1. SQLite CAS

- Test file: `src/__tests__/Utils/auth/sqlite-cas.test.ts`
- Default Jest discovery: included (`node --experimental-vm-modules node_modules/jest/bin/jest.js --listTests` contains this path).
- Exact command: `node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand --forceExit --testMatch '**/sqlite-cas.test.ts'`
- Exact summary: `Test Suites: 1 passed, 1 total`; `Tests: 7 passed, 7 total`.
- Evidence: `docs/architecture/evidence/phase-13-15/sqlite-cas-targeted.log`
- Result: all 7 SQLite CAS tests were run and passed.

## 2. AuthStore Conformance

- Test file: `src/__tests__/Utils/auth/auth-store-conformance.test.ts`
- Default Jest discovery: included.
- Exact command: `node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand --forceExit --testMatch '**/auth-store-conformance.test.ts'`
- Exact summary: `Test Suites: 1 passed, 1 total`; `Tests: 47 passed, 47 total`.
- Evidence: `docs/architecture/evidence/phase-13-15/auth-store-conformance-targeted.log`
- Result: all 47 AuthStore conformance tests passed.
- These 47 tests are part of the default Jest suite and are already included in `79 suites / 1393 tests`. They are not counted again in native integration totals.

## 3. Migration SQLite <-> Redis

- Test file: `src/__tests__/Utils/auth-integration/migration.integration.ts`
- Native proof:
  - Source/destination use `realStore('sqlite', ...)` and `realStore('redis', ...)`.
  - SQLite uses native `better-sqlite3`.
  - Redis uses a real Redis client connected to `redis://127.0.0.1:6379`.
  - The harness is not a mock for these directions.
- Exact command: `FURINA_TEST_SQLITE_DIR=/tmp/opencode/p1315-sqlite-base FURINA_TEST_REDIS_URL=redis://127.0.0.1:6379 NODE_OPTIONS=--max-old-space-size=1024 node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand --testMatch '**/*.integration.ts' --testPathPatterns 'migration.integration.ts' --forceExit`
- Exact summary: `Test Suites: 1 passed, 1 total`; `Tests: 20 skipped, 16 passed, 36 total`.
- Evidence: `docs/architecture/evidence/phase-13-15/F-14-03.after.log`
- Result: SQLite <-> Redis migration passed, including idempotent rerun and partial-write failure handling. The 20 skipped tests are MongoDB/NekoDB directions and do not include SQLite <-> Redis.

## 4. Reconciliation

- Default Jest: 79 suites / 1393 tests.
- Included in default Jest: `sqlite-cas.test.ts` (7 tests) and `auth-store-conformance.test.ts` (47 tests).
- Separate native/conformance integration evidence:
  - SQLite native: 1 suite / 14 tests.
  - Redis native: 1 suite / 7 tests.
  - Migration integration: 1 suite / 16 passed, 20 skipped, 0 failed.
- No double-counting: default unit tests and native integration tests are disjoint by runner and file extension.
