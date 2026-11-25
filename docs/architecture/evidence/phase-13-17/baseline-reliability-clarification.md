# Baseline Reliability Clarification — Phase 13.17

Read-only clarification. No production source, test assertion, Jest configuration, or package metadata was changed.

## 1. Reconciliation of `npm run test:integration`

Source log:
`docs/architecture/evidence/phase-13-17/reliability-integration-native.log`

Command:
`FURINA_TEST_REQUIRED_BACKENDS=sqlite,redis FURINA_TEST_SQLITE_DIR=/tmp/opencode/p1317-reliability FURINA_TEST_REDIS_URL=redis://127.0.0.1:6379 NODE_OPTIONS=--max-old-space-size=1024 node --import tsx scripts/check-integration-env.ts --run`

Result:
- Test Suites: 2 skipped, 3 passed, 3 of 5 total
- Tests: 22 skipped, 37 passed, 59 total
- Exit code: 0

The 22 skipped tests are not 22 ordinary test cases from one migration file. They are 22 `it.skip` markers:

1. Migration normal directions that could not run: 10 skipped.
   Blocked directions in `src/__tests__/Utils/auth-integration/migration.integration.ts`:
   - mongodb → nekodb
   - mongodb → redis
   - mongodb → sqlite
   - nekodb → mongodb
   - nekodb → sqlite
   - nekodb → redis
   - sqlite → mongodb
   - sqlite → nekodb
   - redis → mongodb
   - redis → nekodb

   Each blocked direction contributes one skip marker in the normal migration suite.

2. Migration partial-write investigation for the same 10 blocked directions: 10 skipped.
   Each blocked direction contributes one skip marker in the
   `migration destination-batch failure investigation` suite.

3. MongoDB backend suite: 1 skipped.
   `src/__tests__/Utils/auth-integration/mongodb.integration.ts` is wrapped by
   `integrationSuite('auth state conformance', 'mongodb', ...)`. When MongoDB is
   unavailable, the wrapper declares one `it.skip('no isolated real backend is
   available for this run')`. The file contains 7 test cases, but none of them
   was executed.

4. NekoDB backend suite: 1 skipped.
   `src/__tests__/Utils/auth-integration/nekodb.integration.ts` is wrapped by
   `integrationSuite('auth state conformance', 'nekodb', ...)`. When NekoDB is
   unavailable, the wrapper declares one `it.skip('no isolated real backend is
   available for this run')`. The file contains 5 test cases, but none of them
   was executed.

Total: 10 + 10 + 1 + 1 = 22 skipped.

The 37 passed tests are:
- SQLite integration suite: 14 tests passed.
- Redis integration suite: 7 tests passed.
- Migration available directions: 16 tests passed.
  - sqlite → redis: 7 tests
  - redis → sqlite: 7 tests
  - partial-write investigation for the two available directions: 2 tests

No backend was reported as PASS merely because it was skipped.

## 2. Default Unit Suite Verification

Phase 13.17 evidence exists and was executed during the phase:

1. First run:
   - File: `docs/architecture/evidence/phase-13-17/baseline-default-jest.log`
   - Timestamp: `2026-11-24T10:30:20Z`
   - Command: `npm test`
   - Result: 1 failed, 1392 passed, 1393 total; 1 failed suite, 78 passed suites, 79 total
   - Failure: timeout in `src/__tests__/binary/reconnection-sync-skip.test.ts`
   - Exit code: 1

2. Rerun:
   - File: `docs/architecture/evidence/phase-13-17/baseline-default-jest-rerun.log`
   - Timestamp: `2026-11-24T10:56:31Z`
   - Command: `npm test`
   - Result: 1393 passed, 1393 total; 79 passed suites, 79 total
   - Exit code: 0

Therefore the default unit suite was executed in Phase 13.17 and the final rerun
shows no regression: 79 suites / 1393 tests PASS.

The 47 AuthStore conformance tests are included in the default Jest suite through
`src/__tests__/Utils/auth/auth-store-conformance.test.ts`. They are not counted
again in the native integration category.

## 3. Reliability Scenario Details

### a. Connection recovery

Status: NOT DIRECTLY VERIFIED at native backend level.

What ran:
- Default unit tests include `src/__tests__/binary/reconnection-sync-skip.test.ts`
  and `src/__tests__/binary/connection-deadlock.test.ts`. The final default rerun
  passed all 1393 tests.

What did not run:
- No native SQLite/Redis integration test opens a socket, drops it, reconnects,
  and verifies in-flight operation recovery.
- The native suites verify data after creating a fresh adapter, not live socket
  reconnection.

Reference:
- `docs/architecture/evidence/phase-13-17/baseline-default-jest-rerun.log`
- `src/__tests__/binary/reconnection-sync-skip.test.ts`
- `src/__tests__/binary/connection-deadlock.test.ts`

### b. Persistence after restart

Status: PASS.

Verified scenarios:
- SQLite: `restores credentials and Signal keys after reopening the same database`
  in `src/__tests__/Utils/auth-integration/sqlite.integration.ts`.
- Redis: `restores credentials and Signal keys from a fresh adapter instance`
  in `src/__tests__/Utils/auth-integration/redis.integration.ts`.

Evidence:
- `docs/architecture/evidence/phase-13-17/reliability-integration-native.log`
- `docs/architecture/evidence/phase-13-17/baseline-sqlite-native.log`
- `docs/architecture/evidence/phase-13-17/baseline-redis-native.log`

### c. Concurrent operations

Status: PASS.

Verified scenarios:
- SQLite: concurrent writes in different databases remain isolated.
- SQLite: concurrent remove of the same record allows exactly one success.
- SQLite: concurrent conditional writes on a shared database allow exactly one success.
- Redis: concurrent writes in different tables remain isolated.

References:
- `src/__tests__/Utils/auth-integration/sqlite.integration.ts`
- `src/__tests__/Utils/auth-integration/redis.integration.ts`
- `docs/architecture/evidence/phase-13-17/reliability-integration-native.log`

### d. Resource lifecycle

Status: PASS for SQLite owned wrapper; partially verified for Redis.

Verified scenarios:
- SQLite: `closes an owned SQLite wrapper and rejects writes afterwards`.
- SQLite: repeated `closeAuthState()` resolves without error.
- Redis: no dedicated native close/disposal test was run in the integration suite.
  Default unit coverage includes `src/__tests__/Utils/auth-integration/disposal-safety.test.ts`.

References:
- `src/__tests__/Utils/auth-integration/sqlite.integration.ts`
- `src/__tests__/Utils/auth-integration/disposal-safety.test.ts`
- `docs/architecture/evidence/phase-13-17/reliability-integration-native.log`

### e. Partial-write recovery

Status: PASS.

Verified scenarios:
- Migration partial-write investigation wraps a real destination store and fails
  `setMany` synthetically.
- Result: migration throws with cause `synthetic destination batch write failure`.
- Source remains complete.
- Destination remains empty.
- Normal migration and idempotent rerun also pass for sqlite → redis and
  redis → sqlite.

References:
- `src/__tests__/Utils/auth-integration/migration.integration.ts`
- `docs/architecture/evidence/phase-13-17/baseline-migration-native.log`
- `docs/architecture/evidence/phase-13-17/migration-native.log`
- `docs/architecture/evidence/phase-13-17/reliability-integration-native.log`

### f. Process recovery

Status: BLOCKED / NOT VERIFIED.

What exists:
- Unit-level compensating recovery and storage fault tests.
- In-memory rollback behavior in migration tests.

What does not exist in Phase 13.17:
- No cross-process crash test.
- No durable journal or resume mechanism.
- No verification that a process killed during migration can resume automatically.

References:
- `src/__tests__/Utils/auth/compensating-recovery.test.ts`
- `src/__tests__/Utils/auth/recovery-regressions.test.ts`
- `docs/architecture/phase-13-17-ci-native-reliability.md`, section 13

## 4. Still Blocked

- MongoDB native: BLOCKED.
- NekoDB native: BLOCKED.
- GitHub Actions service-container run: BLOCKED / NOT RUN.
- MongoDB `getMany([])` optimization: NOT PERFORMED.
- Cross-process crash recovery: NOT VERIFIED.
