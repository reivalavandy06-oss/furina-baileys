# Phase 13.17 Baseline Manifest

- Branch: `feat/reliability-audit`
- HEAD: `d352727bbae2e33d687ad7c68c9145ac562d1fb6`
- Node.js: `v22.23.5`
- Yarn: `4.18.1`
- Default Jest baseline: 79 suites / 1393 tests PASS.
- First default run: one timeout in `reconnection-sync-skip.test.ts`; rerun PASS.
- SQLite native: 14 tests PASS.
- Redis native: 7 tests PASS.
- SQLite CAS: 7 tests PASS.
- AuthStore conformance: 47 tests PASS.
- Migration: 16 passed, 20 skipped, 0 failed.
- Full available integration: 3 suites passed, 2 skipped; 37 passed, 22 skipped.
- MongoDB native: BLOCKED.
- NekoDB native: BLOCKED.
- GitHub Actions: NOT RUN.
- Lint carried from Phase 13.16: 0 errors / 1360 warnings.
- TypeScript carried from Phase 13.16: PASS.
- No production source changed in Phase 13.17.

Relevant hashes:
- `893635e2506fad1acc7990d7d5559af69bc5970711463c0e5a6ef4ddb5ef3266` `.github/workflows/auth-store-integration.yml`
- `10b9c8c023603c0deb2e8c0a8dd725e34ad2af1225a1d1f605c3b0a958f36c73` `package.json`
- `31336b9522b9862eb07b96bdada172f60ebb185598d8353a639508983df32868` `jest.config.ts`
- `a179a032cb75c77a870a297e04226c2dbb841e0f72c0d411a3cd2cf8178798fc` `tsconfig.json`
