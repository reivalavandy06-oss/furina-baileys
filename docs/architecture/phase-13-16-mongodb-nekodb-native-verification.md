# MongoDB & NekoDB Native Verification — Fase 13.16

[Indeks](../index.md) · [Fase 13.15](phase-13-15-redis-migration-remediation.md) · [Auth Store](../auth-stores.md) · [Harness Integrasi](../testing/auth-store-integration.md)

Tanggal: 2026-11-24. Branch `feat/reliability-audit`.
HEAD awal dan akhir: `d352727bbae2e33d687ad7c68c9145ac562d1fb6`.
Node.js utama: `v22.23.5`.
Yarn: `4.18.1`.

Status: **BLOCKED**.

## 1. Executive Summary

- SQLite native verification: **PASS** (14 tests).
- Redis native verification: **PASS** (7 tests).
- MongoDB native verification: **BLOCKED**.
- NekoDB native verification: **BLOCKED**.
- Migration verification for available backends: **PASS** (16 passed, 20 skipped, 0 failed).
- No production source was changed in Phase 13.16.
- MongoDB `getMany([])` early-return optimization was **not performed** because native MongoDB baseline could not be established.
- AuthStore release readiness remains **NOT READY**.

## 2. Repository Baseline

- Branch: `feat/reliability-audit`
- HEAD awal/akhir: `d352727bbae2e33d687ad7c68c9145ac562d1fb6`
- Working tree sebelum fase berisi perubahan lokal dan laporan Phase 13.9–13.15.
- Semua perubahan lokal dipertahankan.
- Tidak ada commit, push, tag, publish, atau release.
- `AGENTS.md` tidak diubah.

## 3. Environment

- OS: Linux PRoot/Termux.
- Architecture: `aarch64`.
- CPU features: `fp asimd evtstrm aes pmull sha1 sha2 crc32 cpuid`.
- Node.js: `v22.23.5`.
- Yarn: `4.18.1`.
- Redis server: `7.4.2`.
- Redis client: `redis@6.4.0`.
- SQLite driver: `better-sqlite3@13.2.0`.
- MongoDB driver attempted: `mongodb@7.0.15` metadata; server binaries 7.0.15, 6.0.16, 5.0.31, 4.4.29, and 4.2.24 tested.
- NekoDB client attempted: `@nekodb/client@1.1.7`.
- Docker/Podman: not available.
- `mongod`, `mongosh`, `mongo`: not available.

## 4. Baseline Regression

| Suite | Expected | Actual | Status |
|---|---:|---:|---|
| Default Jest | 79 suites / 1393 tests | 79 suites / 1393 tests | PASS |
| SQLite native | 14 | 14 | PASS |
| SQLite CAS | 7 | 7 | PASS |
| Redis native | 7 | 7 | PASS |
| AuthStore conformance | 47 | 47 | PASS |
| Migration integration | 16 passed / 20 skipped / 0 failed | 16 passed / 20 skipped / 0 failed | PASS |

Conformance 47 tests are included in the default Jest suite and are not counted again.

## 5. MongoDB Native Results

Status: **BLOCKED**.

Attempted server binaries:

| Version | Result |
|---|---|
| MongoDB 7.0.15 | `Illegal instruction` |
| MongoDB 6.0.16 | `Illegal instruction` |
| MongoDB 5.0.31 | missing `libcrypto.so.1.1` |
| MongoDB 4.4.29 | `Illegal instruction` |
| MongoDB 4.2.24 | `Illegal instruction` |

No MongoDB service was started. No CRUD, `getMany([])`, `clear()`, `remove()`,
persistence, namespace isolation, lifecycle, or AuthenticationState integration
test was performed.

The repository does not declare `mongodb` as a dependency. A temporary `/tmp`
install was used only for environment inspection.

## 6. NekoDB Native Results

Status: **BLOCKED**.

NekoDB requires a caller-initialized remote `NekoDB` client with host, username,
and password. No isolated NekoDB service, credentials, or environment were
available. `@nekodb/client@1.1.7` was installed only in `/tmp` for inspection.

No native `search`, `get`, `getMany([])`, `remove()`, `clear()`, persistence,
lifecycle, or AuthenticationState integration test was performed.

## 7. Migration Matrix

| Source | Destination | Normal Migration | Partial-write | Recovery | Status |
|---|---|---|---|---|---|
| MongoDB | NekoDB | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| MongoDB | Redis | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| MongoDB | SQLite | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| NekoDB | MongoDB | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| NekoDB | SQLite | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| NekoDB | Redis | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| SQLite | MongoDB | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| SQLite | NekoDB | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Redis | MongoDB | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Redis | NekoDB | BLOCKED | BLOCKED | BLOCKED | BLOCKED |

Available backends only:

| Source | Destination | Normal Migration | Partial-write | Recovery | Status |
|---|---|---|---|---|---|
| SQLite | Redis | PASS | PASS | PASS | PASS |
| Redis | SQLite | PASS | PASS | PASS | PASS |

Phase 13.16 migration result: 16 passed, 20 skipped, 0 failed. The 20 skipped
tests are exactly the MongoDB/NekoDB directions listed above.

## 8. MongoDB Optimization

No optimization was performed.

Reason: native MongoDB baseline was blocked before any command-monitoring or
post-optimization comparison could be established.

No production source was changed.

## 9. Test Inventory

| Category | Count | Notes |
|---|---:|---|
| Default Jest unit/mock | 79 suites / 1393 tests | Includes 47 AuthStore conformance tests |
| SQLite native | 14 | PASS |
| SQLite CAS | 7 | PASS |
| Redis native | 7 | PASS |
| AuthStore conformance | 47 | Already included in default Jest |
| Migration integration | 16 passed / 20 skipped / 0 failed | Available directions only |
| MongoDB native | 0 | BLOCKED |
| NekoDB native | 0 | BLOCKED |

No double-counting: default unit tests and native integration tests are disjoint
by runner and file extension.

## 10. Findings

### F-16-01 — MongoDB native environment incompatible

- Severity: Blocked (environment)
- Evidence: `docs/architecture/evidence/phase-13-16/mongodb-baseline.log`
- Impact: No native MongoDB CRUD, `getMany([])`, `clear()`, `remove()`,
  persistence, namespace isolation, lifecycle, or AuthenticationState proof.
- Recommendation: Run on a compatible Linux/x86_64 or ARM environment with a
  working MongoDB server.

### F-16-02 — NekoDB native environment unavailable

- Severity: Blocked (environment)
- Evidence: `docs/architecture/evidence/phase-13-16/nekodb-baseline.log`
- Impact: No native NekoDB contract, persistence, lifecycle, or migration proof.
- Recommendation: Provide an isolated NekoDB instance and compatible
  `@nekodb/client`.

### F-16-03 — MongoDB `getMany([])` remains unverified

- Severity: Medium
- Status: Static audit only.
- Static behavior: likely returns `{}` via `find({ key: { $in: [] } })`, but still
  issues a `find` command.
- Recommendation: Verify and optimize only after native MongoDB baseline exists.

### F-16-04 — MongoDB empty `clear()` remains unverified

- Severity: Medium
- Static behavior: calls `deleteMany({})` on the store-scoped collection.
- Recommendation: Native verify collection ownership before considering changes.

### F-16-05 — GitHub Actions remains not run

- Severity: Blocked (process)
- Evidence: Phase 13.14.
- Impact: Service-container path remains unproven.

## 11. Limitations

- MongoDB native: BLOCKED.
- NekoDB native: BLOCKED.
- MongoDB optimization: NOT PERFORMED.
- GitHub Actions: NOT RUN.
- No crash-durability or reconnect tests across processes.
- No NekoDB service was available.

## 12. Release Readiness

Phase 13.16 status: **BLOCKED**.

Overall AuthStore release readiness: **NOT READY**.

Reasons:

1. MongoDB native verification is blocked.
2. NekoDB native verification is blocked.
3. GitHub Actions service-container path is not run.
4. Atomic migration cutover remains unguaranteed.

## 13. Phase 13.17 Inputs

1. Run MongoDB native verification on a compatible environment.
2. Run NekoDB native verification with an isolated instance.
3. Execute GitHub Actions service-container workflow.
4. Re-run all 20 previously skipped migration directions.
5. Evaluate MongoDB `getMany([])` optimization after native baseline.
6. Decide NekoDB support status.
7. Run final release gate after remaining blockers are resolved.

No production source was changed in Phase 13.16.
