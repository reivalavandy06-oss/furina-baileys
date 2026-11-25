# Phase 13.17 Test Inventory

- Branch: `feat/reliability-audit`
- HEAD: `d352727bbae2e33d687ad7c68c9145ac562d1fb6`
- Default Jest: 79 suites / 1393 tests PASS.
- SQLite native: 14 PASS.
- SQLite CAS: 7 PASS.
- Redis native: 7 PASS.
- AuthStore conformance: 47 PASS (included in default Jest).
- Migration integration: 16 passed / 20 skipped / 0 failed.
- Full available integration: 3 suites passed, 2 skipped; 37 passed, 22 skipped.
- MongoDB native: 0, BLOCKED.
- NekoDB native: 0, BLOCKED.
- GitHub Actions: 0, NOT RUN.

Integration files:
- `src/__tests__/Utils/auth-integration/sqlite.integration.ts`
- `src/__tests__/Utils/auth-integration/redis.integration.ts`
- `src/__tests__/Utils/auth-integration/mongodb.integration.ts`
- `src/__tests__/Utils/auth-integration/nekodb.integration.ts`
- `src/__tests__/Utils/auth-integration/migration.integration.ts`

No double-counting: default unit tests and native integration tests are disjoint by
file extension and runner command.
