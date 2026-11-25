# Phase 13.16 Baseline Manifest

- Branch: `feat/reliability-audit`
- HEAD: `d352727bbae2e33d687ad7c68c9145ac562d1fb6`
- Node.js: `v22.23.5`
- Yarn: `4.18.1`
- Default unit baseline: 79 suites / 1393 tests PASS.
- SQLite native baseline: 14 tests PASS.
- Redis native baseline: 7 tests PASS.
- Migration baseline: 16 passed, 20 skipped, 0 failed.
- MongoDB native baseline: BLOCKED.
- NekoDB native baseline: BLOCKED.
- TypeScript: PASS (`tsc --noEmit`).
- Lint: 0 errors / 1360 warnings.
- No production source changes were made in Phase 13.16.

## Relevant file hashes

10b9c8c023603c0deb2e8c0a8dd725e34ad2af1225a1d1f605c3b0a958f36c73  package.json
31336b9522b9862eb07b96bdada172f60ebb185598d8353a639508983df32868  jest.config.ts
a179a032cb75c77a870a297e04226c2dbb841e0f72c0d411a3cd2cf8178798fc  tsconfig.json
a19a3d3e7d050ef8b27e733c04fdddd422eb84af6214c77d2e1d86770df40ed7  src/Types/Auth.ts
5184f29188ac930af467040bed0395ed647ef5b2f44fdf9bd1614e8f6c3ff21f  src/Utils/auth-store.ts
05750eb3fa8fadad98e2d858341dc785997acc78638a64925950be90b0102408  src/Utils/auth/nekodb-auth.ts
e10fe30a475304eb7a1e8a0a9bd681a4b9a340b01a807c538d62702ac2d5b198  src/__tests__/Utils/auth/auth-store-conformance.test.ts
c5bd36f63eb7ec72b8cef62f3d9608144b56c2b621cb102d961d149b2d42f628  src/__tests__/Utils/auth-integration/sqlite.integration.ts
def58d5a29c2d3fd1979f1a7530f5f4ea5855448b7c86de2644550c7d9972a62  src/__tests__/Utils/auth-integration/redis.integration.ts
d0df64dc1d0d7df48e595929a231b4f6c138f5d06a2fd13b4646914c30d9c8e2  src/__tests__/Utils/auth-integration/mongodb.integration.ts
0232992e29a077cf387565cac886eee0b2c8ba7063605a839a20f3721eba64f1  src/__tests__/Utils/auth-integration/nekodb.integration.ts
f303bb97b80b52702bc26e95f59e8605f4a0d4ad49d2fe543e09f11b491b8ca1  src/__tests__/Utils/auth-integration/migration.integration.ts
71e99a47313ae2e60873950abc0685e278044b065f9b3aabf5ba2c56fa8c328e  .github/workflows/auth-store-integration.yml
