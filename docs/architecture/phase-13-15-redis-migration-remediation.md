# Redis Contract Remediation & SQLite-to-Redis Migration Reliability — Fase 13.15

[Indeks](../index.md) · [Fase 13.14](phase-13-14-native-backend-verification.md) · [Auth Store](../auth-stores.md) · [Harness Integrasi](../testing/auth-store-integration.md)

Tanggal: 2026-11-24. Branch `feat/reliability-audit`.
HEAD awal dan akhir: `d352727bbae2e33d687ad7c68c9145ac562d1fb6`.
Node.js utama: `v22.23.5`.
Yarn: `4.18.1`.

Status: **PASS WITH LIMITATIONS**.

## 1. Executive Summary

- F-14-01 direproduksi dan diperbaiki: `getMany([])` sekarang mengembalikan `{}` tanpa memanggil `MGET`.
- F-14-02 direproduksi dan diperbaiki: `clear()` pada store kosong sekarang resolve tanpa error.
- `clear()` diimplementasikan dengan `SCAN`, namespace exact filter, dan batch deletion.
- F-14-03 root cause terbukti adalah F-14-01, bukan kehilangan data migrasi.
- Migration SQLite → Redis lulus setelah remediation: 16 passed, 20 skipped, 0 failed.
- Idempotency migration terverifikasi pada arah yang tersedia.
- TypeScript, lint, full unit suite, dan native regression lulus.
- MongoDB native dan GitHub Actions tetap blocker luar scope.

## 2. Repository Baseline

- Branch: `feat/reliability-audit`
- HEAD awal/akhir: `d352727bbae2e33d687ad7c68c9145ac562d1fb6`
- Working tree sebelum fase berisi perubahan lokal dan laporan Phase 13.9–13.14.
- Semua perubahan lokal dipertahankan.
- Tidak ada commit, push, tag, publish, atau release.
- `AGENTS.md` tidak diubah.

## 3. Pre-13.15 Gate

### F-14-01 — Redis `getMany([])`

- Reproduction status: **REPRODUCED**.
- Evidence: `docs/architecture/evidence/phase-13-15/F-14-01-02.before.log`
- Expected: `{}`.
- Actual: `ERR wrong number of arguments for 'mget' command`.
- Root cause: `createRedisAuthStore.getMany` langsung memanggil `client.mGet([])`.
- Process exit code reproduction: `0` (error tertangkap dan dicatat).

### F-14-02 — Redis `clear()` on empty store

- Reproduction status: **REPRODUCED**.
- Evidence: `docs/architecture/evidence/phase-13-15/F-14-01-02.before.log`
- Expected: resolve tanpa error.
- Actual: `ERR wrong number of arguments for 'del' command`.
- Root cause: `createRedisAuthStore.clear` langsung memanggil `client.del([])`.
- Populated store clear lulus sebelum remediation.

### F-14-03 — SQLite → Redis migration

- Reproduction status: **REPRODUCED**.
- Evidence: `docs/architecture/evidence/phase-13-15/F-14-03.before.log`
- Failure: `ERR wrong number of arguments for 'mget' command`.
- Root cause: destination kosong memanggil `getMany([])` saat verification snapshot.
- Data loss: **tidak terbukti**. Source tetap utuh; migration gagal sebelum success.
- After remediation: `docs/architecture/evidence/phase-13-15/F-14-03.after.log`
  - 16 passed, 20 skipped, 0 failed.

## 4. Test Inventory

Overlap dijelaskan secara eksplisit: full unit suite dan native integration suite adalah
kategori terpisah. Integration tests tidak termasuk default unit runner.

| Kategori | Sebelum | Sesudah | Status |
|---|---:|---:|---|
| Unit/mock suites | 79 | 79 | PASS |
| Unit/mock tests | 1383 | 1393 | PASS |
| SQLite native | 14 | 14 | PASS |
| SQLite CAS | 7 | 7 | PASS |
| Redis native | 5 | 7 | PASS |
| AuthStore conformance | 37 | 47 | PASS |
| Migration native | 13 passed / 1 failed / 20 skipped | 16 passed / 0 failed / 20 skipped | PASS |

Total native/conformance yang lulus di environment ini: 91 tests; 20 skipped.
Combined native: 3 suites passed, 2 skipped; 37 passed, 22 skipped.

## 5. Redis `getMany` Remediation

- File: `src/Utils/auth-store.ts`
- Old behavior: `client.mGet([])` dipanggil untuk input kosong.
- New behavior: early return `{}` sebelum command Redis.
- Network command proof: `MGET_CALLS 0`.
- Regression:
  - AuthStore conformance: 47 tests PASS.
  - Redis native: 7 tests PASS.
  - Full unit suite: 79 suites / 1393 tests PASS.

## 6. Redis `clear` Remediation

- File: `src/Utils/auth-store.ts`
- Implementasi baru:
  - cursor-based `SCAN`,
  - pattern `MATCH` dengan escape glob metacharacters,
  - exact `startsWith(prefix)` filter pada sisi client,
  - empty result early return,
  - batch deletion dengan `UNLINK` jika tersedia, fallback `DEL`,
  - batch size 100.
- Empty store: resolve tanpa error.
- Sibling namespace: preserved.
- Error propagation: scan dan delete errors tetap dilempar.
- SCAN bukan snapshot konsisten terhadap concurrent mutation; limitation ini
  didokumentasikan dan tidak diklaim atomic.
- Regression:
  - Redis native: 7 tests PASS.
  - AuthStore conformance: 47 tests PASS.
  - Repro after: `UNLINK_CALLS 0`, `DEL_CALLS 0`.

## 7. Migration Root Cause

F-14-03 root cause adalah F-14-01. Migration memanggil `getMany(await store.keys())`
pada destination kosong, sehingga `getMany([])` melempar error Redis. Ini bukan
kehilangan data dan bukan partial migration.

Source SQLite tetap tidak berubah. Migration hanya membaca melalui `AuthStore`.

## 8. Migration Design

- Read-only source: migration hanya memanggil `keys()` dan `getMany()` pada source.
- Tidak ada SQL write pada source.
- Key mapping deterministik melalui kontrak `AuthStore`.
- Serialization tetap BufferJSON sesuai adapter.
- Writes dilakukan melalui `setMany()`.
- Verification dilakukan dengan readback dan comparison.
- Atomicity: **tidak dijanjikan**. `setMany` adalah batch sequential, bukan
  transaksi atomic.
- Idempotency: migration yang dijalankan ulang menghasilkan destination yang sama.
- Recovery: partial failure tidak dilaporkan sebagai success; source tetap utuh.
- Destination safety: namespace test khusus; tidak ada clear global.

## 9. Migration Verification

| Scenario | Source Count | Destination Count | Source Checksum | Destination Checksum | Result |
|---|---:|---:|---|---|---|
| SQLite → Redis normal | 3 | 3 | canonical match | canonical match | PASS |
| Redis → SQLite normal | 3 | 3 | canonical match | canonical match | PASS |
| Idempotent rerun | 3 | 3 | canonical match | canonical match | PASS |
| Partial write failure | 3 | 0 | unchanged | empty | PASS (no false success) |
| Empty destination before fix | 3 | 0 | unchanged | empty | FAIL (F-14-01) |
| Empty destination after fix | 3 | 3 | canonical match | canonical match | PASS |

Checksum dibandingkan melalui canonical record set yang diurutkan berdasarkan key.
Payload sensitif tidak dicetak.

## 10. Regression Results

| Group | Baseline | Final | Status |
|---|---:|---:|---|
| Unit/mock suites | 79 | 79 | PASS |
| Unit/mock tests | 1383 | 1393 | PASS |
| SQLite native | 14 | 14 | PASS |
| SQLite CAS | 7 | 7 | PASS |
| Redis native | 5 | 7 | PASS |
| AuthStore conformance | 37 | 47 | PASS |
| Migration integration | 13 passed / 1 failed / 20 skipped | 16 passed / 0 failed / 20 skipped | PASS |
| Combined native | 2 passed / 1 failed / 2 skipped | 3 passed / 0 failed / 2 skipped | PASS |
| TypeScript | PASS | PASS | PASS |
| Lint | 0 errors / 1360 warnings | 0 errors / 1360 warnings | PASS |

## 11. Findings

### F-15-01 — Redis empty input contract fixed

- Severity: High
- Root cause: `mGet([])` langsung dipanggil.
- Fix: early return `{}`.
- Regression: conformance + Redis native.
- Remaining limitation: none for empty input.

### F-15-02 — Redis empty clear fixed

- Severity: Medium
- Root cause: `del([])` langsung dipanggil.
- Fix: SCAN dengan early return jika tidak ada key.
- Regression: conformance + Redis native.
- Remaining limitation: SCAN is not a consistent snapshot under concurrent mutation.

### F-15-03 — Migration false failure root cause fixed

- Severity: High
- Root cause: F-15-01.
- Fix: tidak ada perubahan migration; perbaikan Redis contract cukup.
- Regression: migration integration 16 passed.
- Remaining limitation: atomic cutover tidak dijamin.

### F-15-04 — MongoDB native remains blocked

- Severity: Blocked (environment)
- Evidence: Phase 13.14.
- Remaining limitation: no native CRUD/remove/persistence/isolation/lifecycle proof.

### F-15-05 — NekoDB native remains not run

- Severity: Blocked (environment)
- Remaining limitation: driver and isolated instance unavailable.

### F-15-06 — GitHub Actions remains not run

- Severity: Blocked (process)
- Remaining limitation: workflow not present on remote branch.

## 12. Evidence Manifest

- `docs/architecture/evidence/phase-13-15/baseline-environment.txt`
- `docs/architecture/evidence/phase-13-15/F-14-01-02.before.log`
- `docs/architecture/evidence/phase-13-15/F-14-03.before.log`
- `docs/architecture/evidence/phase-13-15/F-14-01-02.after.log`
- `docs/architecture/evidence/phase-13-15/combined.after.log`
- `docs/architecture/evidence/phase-13-15/test-inventory.before.txt`
- `docs/architecture/evidence/phase-13-15/test-inventory.after.txt`
- `docs/architecture/evidence/phase-13-15/baseline-manifest.md`

## 13. Remaining Blockers

1. MongoDB native verification blocked by CPU incompatibility.
2. NekoDB native verification not run.
3. GitHub Actions service-container workflow not run.
4. Atomic migration cutover not guaranteed by current architecture.

## 14. Release Impact

Phase 13.15 completion status: **PASS WITH LIMITATIONS**.

Overall AuthStore release readiness: **NOT READY**.

Alasan:

1. Redis contract defects fixed and verified.
2. SQLite-to-Redis migration verified for available backends.
3. MongoDB native remains blocked.
4. NekoDB native remains not run.
5. GitHub Actions remains not run.

## 15. Phase 13.16 Inputs

1. Run GitHub Actions service-container workflow.
2. Verify MongoDB native on a compatible environment.
3. Decide NekoDB support status.
4. Evaluate whether atomic cutover is required for release.
5. Run final release gate after remaining blockers are resolved.
