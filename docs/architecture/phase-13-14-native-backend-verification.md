# Native Backend Verification & CI Validation — Fase 13.14

[Indeks](../index.md) · [Fase 13.13](phase-13-13-authstore-contract-remediation.md) · [Auth Store](../auth-stores.md) · [Harness Integrasi](../testing/auth-store-integration.md)

Tanggal: 2026-11-24. Branch `feat/reliability-audit`.
HEAD awal dan akhir: `d352727bbae2e33d687ad7c68c9145ac562d1fb6`.
Node.js utama: `v22.23.5`.
Yarn: `4.18.1`.

Status: **BLOCKED** untuk verifikasi native lengkap. SQLite dan Redis native lulus.
MongoDB native tidak dapat dijalankan di environment ini.

## 1. Executive Summary

- SQLite native: **PASS** (1 suite / 14 test setelah penambahan regression Phase 14).
- Redis native: **PASS dengan defect** (1 suite / 5 test).
- MongoDB native: **BLOCKED** (binary MongoDB tidak kompatibel dengan CPU environment).
- NekoDB native: **NOT RUN** (driver dan instance tidak tersedia).
- GitHub Actions: **NOT RUN** (workflow belum ada di remote branch).
- Dua defect kontrak Redis ditemukan: `getMany([])` dan `clear()` pada store kosong.
- Tidak ada production source yang diubah pada fase ini.

## 2. Repository Baseline

- Branch: `feat/reliability-audit`
- HEAD awal/akhir: `d352727bbae2e33d687ad7c68c9145ac562d1fb6`
- Working tree berisi perubahan lokal dan laporan Phase 13.9–13.13.
- Semua perubahan lokal dipertahankan.
- Tidak ada commit, push, tag, publish, atau release.
- `AGENTS.md` tidak diubah.

## 3. Environment

- OS: Linux PRoot/Termux `aarch64`.
- Node.js: `v22.23.5`.
- Yarn: `4.18.1`.
- Jest: `30.5.2`.
- TypeScript: `5.8.2`.
- Redis server: `7.4.2`, dibangun dari source di `/tmp/opencode/p1314-redis`.
- Redis client: `redis@6.4.0`.
- SQLite driver: `better-sqlite3@13.2.0`.
- MongoDB driver yang tersedia di `/tmp`: `mongodb@7.0.15` metadata, tetapi server tidak dapat dijalankan.
- CPU features: `fp asimd evtstrm aes pmull sha1 sha2 crc32 cpuid`; tidak ada fitur yang dibutuhkan MongoDB modern.

## 4. Backend Verification Matrix

| Backend | Driver | Service | CRUD | remove() | Persistence | Isolation | Concurrency | Lifecycle | Status |
|---|---|---|---|---|---|---|---|---|---|
| SQLite | `better-sqlite3@13.2.0` | File SQLite nyata | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** |
| Redis | `redis@6.4.0` | Redis `7.4.2` nyata | PASS | PASS | PASS | PASS | PASS | PASS | **PASS WITH DEFECTS** |
| MongoDB | `mongodb@7.0.15`/`6.0.16`/`5.0.31`/`4.4.29` | Tidak dapat dijalankan | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | **BLOCKED** |
| NekoDB | `@nekodb/client` tidak tersedia | Tidak tersedia | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | **NOT RUN** |

MongoDB tidak diuji native. Conformance mock MongoDB tetap lulus, tetapi itu bukan
bukti native.

## 5. AuthenticationState Integration

| Scenario | SQLite | Redis | MongoDB | NekoDB |
|---|---|---|---|---|
| Initial creds | PASS | PASS | NOT RUN | NOT RUN |
| Save creds | PASS | PASS | NOT RUN | NOT RUN |
| Reopen/restore | PASS | PASS | NOT RUN | NOT RUN |
| Signal key get/set | PASS | PASS | NOT RUN | NOT RUN |
| Remove key via `null` | PASS | PASS | NOT RUN | NOT RUN |
| Serialization round-trip | PASS | PASS | NOT RUN | NOT RUN |
| Isolation | PASS | PASS | NOT RUN | NOT RUN |

SQLite dan Redis diverifikasi melalui `realAuthState()` pada harness integrasi.
MongoDB suite ada, tetapi belum pernah dieksekusi native.

## 6. NekoDB Support Decision

Keputusan: **supported optional backend, tetapi unverified native**.

Bukti:

- `@nekodb/client` dideklarasikan sebagai optional peer dependency.
- `createNekoDBAuthStore` dan `useNekoDBAuth` diekspor dari `src/Utils/auth`.
- Dokumentasi `docs/auth-stores.md` menjelaskan backend NekoDB.
- Adapter menggunakan structural client dan collection `baileys_auth`.
- Conformance tests dengan mock lulus.
- Driver dan instance nyata tidak tersedia di environment ini.

NekoDB tetap public API. Tidak ada perubahan API, deprecation, atau penghapusan
backend pada fase ini. Status native: **NOT RUN**.

## 7. CI Validation

Tiga kategori dipisahkan:

1. YAML validation: **PASS**. Workflow `.github/workflows/auth-store-integration.yml`
   dapat diparse dan service `redis`/`mongodb` terbaca.
2. Local equivalent: **PASS WITH LIMITATIONS**.
   - SQLite native PASS.
   - Redis native PASS.
   - MongoDB native BLOCKED.
3. Actual GitHub Actions execution: **NOT RUN**.
   - Workflow belum ada di remote branch (`origin` hanya memiliki `master`).
   - `gh` CLI tidak tersedia.
   - Tidak dilakukan push untuk memaksakan eksekusi.

Langkah manual untuk maintainer setelah workflow tersedia di branch yang benar:

```bash
gh workflow run auth-store-integration.yml --ref feat/reliability-audit
```

## 8. Test Count Reconciliation

Konfigurasi Jest menemukan 79 file `*.test.ts`.

- Phase 13.12: 79 suites / 1.378 tests.
- Phase 13.13 run: Jest melaporkan `1 failed, 78 passed, 79 total` suites dan
  `1 failed, 1.382 passed, 1.383 total` tests. Angka `78 suites` pada laporan
  Phase 13.13 adalah jumlah suite yang lulus, bukan total suite.
- Fase 9 gagal pada Phase 13.13 hanya karena symlink driver `better-sqlite3`
  sementara terpasang; tanpa symlink, suite tersebut lulus.
- Oleh karena itu baseline yang benar adalah **79 suites / 1.383 tests**.
- Phase 14 menambah 3 test pada SQLite integration:
  - namespace isolation remove,
  - empty/repeated batch,
  - concurrent remove.
  SQLite integration naik dari 11 menjadi 14 test.
- Redis integration naik dari 5 menjadi 5 test karena assertion `remove()` true/false
  ditambahkan ke test yang sudah ada.
- AuthStore conformance tetap 37 tests.
- Lint tetap 0 errors / 1.360 warnings.

## 9. Findings

### F-14-01 — Redis `getMany([])` melanggar kontrak

- Severity: **High**
- Backend: Redis
- File: `src/Utils/auth-store.ts` (`createRedisAuthStore`)
- Reproduction:
  1. Buat store Redis.
  2. Panggil `store.getMany([])`.
- Expected: `{}`.
- Actual: `ERR wrong number of arguments for 'mget' command`.
- Dampak: migration/restore yang menyentuh destination kosong gagal.
- Rekomendasi: guard empty array sebelum memanggil `mGet`.

### F-14-02 — Redis `clear()` pada store kosong melanggar kontrak

- Severity: **Medium**
- Backend: Redis
- File: `src/Utils/auth-store.ts` (`createRedisAuthStore`)
- Reproduction:
  1. Buat store Redis tanpa record.
  2. Panggil `store.clear?.()`.
- Expected: resolve tanpa error.
- Actual: `ERR wrong number of arguments for 'del' command`.
- Dampak: cleanup store kosong gagal.
- Rekomendasi: guard empty key list sebelum memanggil `del`.

### F-14-03 — Migration destination-batch investigation gagal karena F-14-01

- Severity: **High**
- Backend: SQLite → Redis
- File: `src/__tests__/Utils/auth-integration/migration.integration.ts`
- Reproduction: jalankan combined native integration; arah `sqlite → redis` gagal
  saat destination kosong.
- Expected: destination tetap `{}`.
- Actual: migration gagal dengan error Redis `mget`.
- Dampak: native cross-backend migration belum terverifikasi untuk Redis.
- Rekomendasi: perbaiki F-14-01, lalu jalankan ulang.

### F-14-04 — MongoDB native tidak dapat dijalankan

- Severity: **Blocked (environment)**
- Backend: MongoDB
- Evidence:
  - MongoDB `7.0.15`: `Illegal instruction`.
  - MongoDB `6.0.16`: `Illegal instruction`, termasuk dengan `libcrypto.so.1.1`.
  - MongoDB `5.0.31`: `libcrypto.so.1.1: cannot open shared object file`.
  - MongoDB `4.4.29`: `Illegal instruction`.
- Dampak: tidak ada bukti native CRUD, remove, persistence, isolation, atau lifecycle.
- Rekomendasi: jalankan di CI Ubuntu x86_64 atau environment dengan CPU yang
  kompatibel.

### F-14-05 — NekoDB native tidak tersedia

- Severity: **Blocked (environment)**
- Backend: NekoDB
- Evidence: `@nekodb/client` tidak terpasang dan tidak ada instance test.
- Dampak: adapter structural hanya terverifikasi melalui mock.
- Rekomendasi: sediakan instance NekoDB terisolasi dan driver pada CI.

### F-14-06 — GitHub Actions belum dieksekusi

- Severity: **Blocked (process)**
- File: `.github/workflows/auth-store-integration.yml`
- Evidence: workflow untracked, remote hanya memiliki `master`, `gh` tidak tersedia.
- Dampak: service-container path belum terbukti.
- Rekomendasi: publish workflow ke branch yang benar, lalu jalankan manual.

## 10. Limitations

- MongoDB native: **BLOCKED**.
- NekoDB native: **NOT RUN**.
- Redis `clear()` kosong dan `getMany([])`: **FAIL**.
- Migration SQLite → Redis: **NOT VERIFIED**.
- GitHub Actions: **NOT RUN**.
- Tidak ada uji crash durability lintas proses.
- Tidak ada uji reconnect Redis/MongoDB.
- Tidak ada uji concurrency lintas proses.

## 11. Release Impact

Status: **NOT READY**.

Alasan:

1. MongoDB native belum terverifikasi.
2. Redis memiliki defect kontrak pada empty operations.
3. Cross-backend migration ke Redis belum terverifikasi.
4. GitHub Actions service-container path belum dijalankan.

## 12. Phase 13.15 Input

1. Perbaiki F-14-01 dan F-14-02 pada Redis adapter.
2. Tambahkan regression test untuk empty `getMany` dan empty `clear`.
3. Jalankan ulang migration SQLite → Redis.
4. Jalankan workflow GitHub Actions dengan service Redis/MongoDB.
5. Verifikasi MongoDB native pada environment yang kompatibel.
6. Putuskan apakah NekoDB tetap public supported API atau experimental.
7. Setelah native backend dan defect selesai, ulangi release gate.
