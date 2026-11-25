# CI-Native Reliability Completion — Fase 13.17

[Indeks](../index.md) · [Fase 13.16](phase-13-16-mongodb-nekodb-native-verification.md) · [Auth Store](../auth-stores.md) · [Harness Integrasi](../testing/auth-store-integration.md)

Tanggal: 2026-11-24. Branch `feat/reliability-audit`.
HEAD awal dan akhir: `d352727bbae2e33d687ad7c68c9145ac562d1fb6`.
Node.js utama: `v22.23.5`.
Yarn: `4.18.1`.

Status: **BLOCKED** untuk release readiness. Backend yang tersedia (SQLite dan Redis) lulus; MongoDB, NekoDB, dan GitHub Actions tetap blocker.

## 1. Executive Summary

- SQLite native verification: **PASS** (14 tests).
- Redis native verification: **PASS** (7 tests).
- SQLite CAS verification: **PASS** (7 tests).
- AuthStore conformance: **PASS** (47 tests; termasuk dalam default Jest, tidak dihitung ulang).
- Migration verification untuk backend tersedia: **PASS** (16 passed, 20 skipped, 0 failed).
- Full integration reliability run: **PASS** (3 suites passed, 2 skipped; 37 tests passed, 22 skipped).
- MongoDB native verification: **BLOCKED**.
- NekoDB native verification: **BLOCKED**.
- GitHub Actions service-container run: **BLOCKED / NOT RUN**.
- Workflow CI diperbarui dengan runner dan image yang dipin; validasi YAML lulus.
- Tidak ada perubahan production source pada Fase 13.17.
- AuthStore release readiness: **NOT READY**.

## 2. Repository Baseline

- Branch: `feat/reliability-audit`
- HEAD awal/akhir: `d352727bbae2e33d687ad7c68c9145ac562d1fb6`
- Working tree berisi perubahan lokal dan laporan Phase 13.9–13.16; semua dipertahankan.
- Tidak ada commit, push, tag, publish, atau release.
- `AGENTS.md` tidak diubah pada Fase 13.17.
- Perubahan Fase 13.17 dibatasi pada dokumentasi, evidence, dan konfigurasi CI.

## 3. Environment

- OS: Linux PRoot/Termux.
- Architecture: `aarch64`.
- Node.js: `v22.23.5`.
- Yarn: `4.18.1`.
- Redis server lokal: `7.4.2` pada `127.0.0.1:6379`.
- SQLite driver: `better-sqlite3@13.2.0`.
- MongoDB driver kandidat: `mongodb@7.9.1`.
- MongoDB image kandidat: `mongo:8.0.38@sha256:479e85ced54ffb8a40dade1dcde2da2a9ae858515b9415e9cc54bfb8f0575d01`.
- Redis image kandidat: `redis:7.4.2-alpine@sha256:02419de7eddf55aa5bcf49efb74e88fa8d931b4d77c07eff8a6b2144472b6952`.
- NekoDB client kandidat: `@nekodb/client@1.1.7`.
- Docker/Podman: tidak tersedia.
- GitHub CLI: tidak tersedia.
- Remote branch `feat/reliability-audit`: tidak ada di `origin`.
- Remote `master`: `ccb92e9ca6b336a36d95fb1b64c740e54ab75933`.

## 4. Baseline Regression

| Suite | Hasil | Status |
|---|---:|---|
| Default Jest | 79 suites / 1393 tests | PASS |
| SQLite native | 14 tests | PASS |
| SQLite CAS | 7 tests | PASS |
| Redis native | 7 tests | PASS |
| AuthStore conformance | 47 tests | PASS |
| Migration integration | 16 passed / 20 skipped / 0 failed | PASS |
| Full available integration | 3 suites passed, 2 skipped; 37 tests passed, 22 skipped | PASS |

Catatan: run default Jest pertama memiliki satu timeout pada
`src/__tests__/binary/reconnection-sync-skip.test.ts`. Rerun default lulus
`79 suites / 1393 tests`, dan targeted rerun lulus `2/2`. Ini dicatat sebagai
sensitivitas beban/environment, bukan perubahan assertion.

Lint baseline yang dibawa dari Fase 13.16: 0 errors / 1360 warnings. Tidak ada
source yang berubah pada Fase 13.17, sehingga lint tidak dijalankan ulang.

## 5. MongoDB Native Results

Status: **BLOCKED**.

- Tidak ada Docker/Podman.
- Binary MongoDB yang diuji pada Fase 13.16 gagal dengan `Illegal instruction`
  atau missing `libcrypto.so.1.1`.
- Tidak ada service MongoDB yang dijalankan.
- Tidak ada CRUD, `getMany([])`, `clear()`, `remove()`, persistence, namespace
  isolation, lifecycle, atau AuthenticationState integration test.
- Optimasi MongoDB `getMany([])` **tidak dilakukan** karena baseline native
  tidak tersedia.
- Definisi CI kompatibel disiapkan pada `.github/workflows/auth-store-integration.yml`.

## 6. NekoDB Native Results

Status: **BLOCKED**.

- `@nekodb/client@1.1.7` adalah client library dengan koneksi WebSocket
  berparameter host, username, dan password.
- Tidak ditemukan server/self-host/deployment guide resmi atau image service
  resmi.
- Tidak ada instance terisolasi atau kredensial test-only.
- Tidak ada native search/get/getMany/clear/remove/persistence/lifecycle test.
- Status dukungan NekoDB tetap blocked, bukan verified.

## 7. Migration Matrix

| Source | Destination | Status |
|---|---|---|
| SQLite | Redis | PASS |
| Redis | SQLite | PASS |
| MongoDB | SQLite/Redis/NekoDB | BLOCKED |
| NekoDB | SQLite/Redis/MongoDB | BLOCKED |
| SQLite/Redis | MongoDB/NekoDB | BLOCKED |

Hasil migration: 16 passed, 20 skipped, 0 failed. 20 skipped tests adalah
arah yang melibatkan MongoDB atau NekoDB.

## 8. CI Workflow Audit

File: `.github/workflows/auth-store-integration.yml`

Perubahan audit:
- `runs-on`: `ubuntu-24.04`.
- Redis image: `redis:7.4.2-alpine@sha256:02419de7eddf55aa5bcf49efb74e88fa8d931b4d77c07eff8a6b2144472b6952`.
- MongoDB image: `mongo:8.0.38@sha256:479e85ced54ffb8a40dade1dcde2da2a9ae858515b9415e9cc54bfb8f0575d01`.
- Health check Redis dan MongoDB tetap aktif.
- Driver test dipasang: `better-sqlite3@13.2.0`, `redis@6.4.0`, `mongodb@7.9.1`.
- Backend wajib: `sqlite,redis,mongodb`.

Validasi:
- Semua workflow YAML lulus parse dengan `js-yaml 4.3.2`.
- File workflow divalidasi: `auth-store-integration.yml` dan workflow lainnya.

Blocker aktual:
- Workflow hanya ada lokal/untracked.
- Branch `feat/reliability-audit` tidak ada di remote.
- GitHub CLI tidak tersedia.
- Tidak ada push, jadi GitHub Actions tidak dapat dijalankan dari environment ini.
- Status: **NOT RUN / BLOCKED**.

## 9. Reliability Testing

Suite yang dijalankan pada backend tersedia:
- `src/__tests__/Utils/auth-integration/sqlite.integration.ts`
- `src/__tests__/Utils/auth-integration/redis.integration.ts`
- `src/__tests__/Utils/auth-integration/migration.integration.ts`

Cakupan yang terverifikasi:
- restore credential dan Signal key setelah reopen adapter baru;
- isolasi concurrent write antar database/table;
- backup dan restore store;
- record-key naming dan remove idempotency;
- empty batch dan repeated keys;
- concurrent remove;
- conditional write/delete (SQLite CAS);
- clear dan isolasi sibling namespace (Redis);
- migration SQLite ↔ Redis normal, idempotent rerun, partial-write failure, dan recovery.

Hasil:
- 3 suites passed.
- 2 suites skipped.
- 37 tests passed.
- 22 tests skipped.
- 0 failed.

Tidak ada remediation production yang dilakukan karena tidak ada defect yang
terbukti pada backend tersedia.

## 10. Remediation

Status: **NO PRODUCTION FIX PERFORMED**.

Alasan:
- SQLite dan Redis native lulus.
- Migration SQLite ↔ Redis lulus.
- MongoDB native blocked, sehingga optimasi `getMany([])` tidak dapat diverifikasi.
- NekoDB native blocked.
- GitHub Actions blocked.

Tidak ada perubahan pada `src/`, test assertion, package configuration, dependency,
atau workflow behavior selain audit/pinning.

## 11. Test Inventory

| Kategori | Hasil | Status |
|---|---:|---|
| Default Jest unit/mock | 79 suites / 1393 tests | PASS |
| SQLite native | 14 | PASS |
| SQLite CAS | 7 | PASS |
| Redis native | 7 | PASS |
| AuthStore conformance | 47 | PASS (included in default Jest) |
| Migration integration | 16 passed / 20 skipped / 0 failed | PASS |
| Full available integration | 3 suites passed, 2 skipped; 37 passed, 22 skipped | PASS |
| MongoDB native | 0 | BLOCKED |
| NekoDB native | 0 | BLOCKED |
| GitHub Actions | 0 | NOT RUN |

Tidak ada double-counting: default unit tests dan native integration tests terpisah
berdasarkan ekstensi file dan perintah runner.

## 12. Findings

### F-17-01 — MongoDB native environment incompatible

- Severity: Blocked (environment)
- Evidence: `docs/architecture/evidence/phase-13-17/mongodb-environment.log`
- Impact: tidak ada proof CRUD, `getMany([])`, `clear()`, `remove()`, persistence,
  namespace isolation, lifecycle, atau AuthenticationState.
- Recommendation: jalankan pada runner GitHub `ubuntu-24.04` dengan service
  `mongo:8.0.38`.

### F-17-02 — NekoDB native environment unavailable

- Severity: Blocked (environment)
- Evidence: `docs/architecture/evidence/phase-13-17/nekodb-environment.log`
- Impact: tidak ada proof contract, persistence, lifecycle, atau migration.
- Recommendation: sediakan instance NekoDB terisolasi dan kredensial test-only,
  atau putuskan status dukungan NekoDB.

### F-17-03 — GitHub Actions tidak dapat dijalankan dari environment ini

- Severity: Blocked (process)
- Evidence: `docs/architecture/evidence/phase-13-17/remote-branch-check.log`
- Impact: service-container path tetap belum terbukti.
- Recommendation: push branch setelah review, atau jalankan workflow melalui PR
  yang memiliki remote branch. Tidak dilakukan pada fase ini.

### F-17-04 — Default Jest flakiness under load

- Severity: Low
- Evidence: `docs/architecture/evidence/phase-13-17/baseline-default-jest.log`
- Impact: satu timeout pada `reconnection-sync-skip.test.ts` pada run pertama.
- Mitigation: rerun lulus; targeted rerun lulus `2/2`.
- Recommendation: pantau dengan serial/low-RAM command bila diperlukan.

## 13. Limitations

- MongoDB native: BLOCKED.
- NekoDB native: BLOCKED.
- MongoDB `getMany([])` optimization: NOT PERFORMED.
- GitHub Actions: NOT RUN.
- Tidak ada crash-durability test lintas proses baru pada fase ini.
- Tidak ada NekoDB service.

## 14. Release Readiness

Phase 13.17 status: **BLOCKED**.

Overall AuthStore release readiness: **NOT READY**.

Alasan:
1. MongoDB native verification blocked.
2. NekoDB native verification blocked.
3. GitHub Actions service-container path not run.
4. Atomic migration cutover tetap tidak dijanjikan.

## 15. Cleanup

- Redis service lokal dihentikan.
- Temporary symlink `node_modules/better-sqlite3` dihapus.
- Temporary symlink `node_modules/redis` dihapus.
- Tidak ada commit, push, tag, publish, atau release.
- `git diff --check` lulus.

## 16. Next Inputs

1. Jalankan workflow GitHub Actions pada branch remote/PR.
2. Jalankan native MongoDB pada `ubuntu-24.04` dengan `mongo:8.0.38`.
3. Sediakan instance NekoDB terisolasi atau putuskan deprecation/support status.
4. Jalankan ulang 20 migration directions yang skipped.
5. Evaluasi optimasi MongoDB `getMany([])` setelah baseline native ada.
6. Jalankan final release gate.

Tidak ada production source yang diubah pada Fase 13.17.
