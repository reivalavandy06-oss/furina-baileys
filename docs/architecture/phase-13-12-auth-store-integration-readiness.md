# Auth Store Native Integration & Release Gate — Fase 13.12

[Indeks](../index.md) · [Fase 13.11](phase-13-11-node-compatibility-matrix.md) · [Auth Store](../auth-stores.md) · [Harness Integrasi](../testing/auth-store-integration.md)

Tanggal: 2026-11-23. Branch `feat/reliability-audit`.
HEAD awal dan akhir: `d352727bbae2e33d687ad7c68c9145ac562d1fb6`.
Node.js utama: `v22.23.5`. Consumer test: `v24.22.3` dan `v26.13.1`.
Yarn: `4.18.1` (`.yarn/releases/yarn-4.18.1.cjs`).

Status:

- **Infrastruktur integrasi: PASS WITH LIMITATIONS.**
- **Release gate: NOT READY.** Redis/MongoDB/NekoDB native belum berjalan, dan
  ditemukan defect kontrak `remove()` pada tiga adapter.

Tidak ada production source yang diubah pada fase ini. Perubahan Phase 13.10
yang belum di-commit tetap dipertahankan, termasuk `AGENTS.md` dan laporan fase
sebelumnya.

## A. Ringkasan Eksekusi

Perubahan fase ini:

- Menambahkan backend MongoDB ke readiness check, integration store builder, dan
  matrix runner.
- Menambahkan suite `mongodb.integration.ts`.
- Menambahkan native SQLite CAS, konflik dua koneksi, fallback `SELECT changes()`,
  dan close wrapper.
- Menambahkan workflow CI service container untuk SQLite/Redis/MongoDB.
- Memperbarui dokumentasi integration harness dan upgrade notes.

Tidak diubah:

- `package.json`, `yarn.lock`, dependency runtime, versi package.
- `src/Utils/auth-store.ts` dan source produksi lainnya pada fase ini.
- `AGENTS.md` dan tiga laporan fase sebelumnya.
- Workflow publish/release.

## B. Matriks Backend

| Backend | Driver | Instance test | CRUD/persistence | CAS | Lifecycle | Status |
|---|---|---|---|---|---|---|
| SQLite | `better-sqlite3@13.2.0` | File SQLite nyata di `/tmp` | PASS | PASS | PASS | **PASS** |
| Redis | `redis@6.4.0` dapat di-import | Tidak ada server | NOT RUN | N/A | NOT RUN | **NOT RUN** |
| MongoDB | `mongodb@7.9.1` dapat di-import | Tidak ada server | NOT RUN | N/A | NOT RUN | **NOT RUN** |
| NekoDB | `@nekodb/client` tidak tersedia | Tidak ada | NOT RUN | N/A | NOT RUN | **NOT RUN** |

Driver Redis/MongoDB dipasang hanya di `/tmp/opencode/p1312-drivers` untuk
memverifikasi import dan readiness. Symlink sementara ke `node_modules` sudah
dihapus setelah pengujian.

## C. Bukti SQLite Native

Perintah:

```bash
FURINA_TEST_SQLITE_DIR=/tmp/opencode/p1312-sqlite-base \
NODE_OPTIONS=--max-old-space-size=1024 \
node --import tsx scripts/check-integration-env.ts --run
```

Hasil:

```text
Test Suites: 4 skipped, 1 passed, 1 of 5 total
Tests:       27 skipped, 11 passed, 38 total
Time:        61.619 s
```

Cakupan yang lulus:

- Session sintetis belum terdaftar.
- Persistensi creds dan Signal key setelah reopen.
- Isolasi dua database/session.
- Backup dan restore.
- Penamaan record pre-key/session.
- `compareAndSet()` berhasil, gagal karena expected value salah, dan delete.
- Dua koneksi bersamaan: tepat satu conditional write menang.
- Fallback `SELECT changes()` ketika `run()` tidak mengembalikan metadata.
- `useSQLiteAuthState()` + `closeAuthState()`: write setelah close ditolak dan
  close kedua tetap resolve.

Fallback `changes()` memakai koneksi `better-sqlite3` nyata; hanya metadata
`run()` yang disembunyikan. Ini bukan implementasi SQLite palsu.

## D. Redis, MongoDB, dan NekoDB

- Redis: driver tersedia, tetapi tidak ada `redis-server`, Docker, atau Podman.
- MongoDB: driver tersedia, tetapi tidak ada `mongod`/service.
- NekoDB: driver dan instance tidak tersedia.
- Suite MongoDB sudah ditambahkan, tetapi **belum pernah dieksekusi**.
- Workflow `.github/workflows/auth-store-integration.yml` menyediakan service
  `redis:7.4-alpine` dan `mongo:8.0`; workflow belum dijalankan di GitHub.

Semua status di atas tetap `NOT RUN`, bukan PASS.

## E. Defect Kontrak `remove()`

`src/Types/Auth.ts` mendokumentasikan:

```ts
/** Delete a single record. Returns `true` when something was removed. */
remove(key: string): Promise<boolean>
```

Bukti native SQLite:

```text
remove-existing true
remove-absent true
```

Source inspection:

- SQLite (`createSQLiteAuthStore`) selalu mengembalikan `true`.
- Redis (`createRedisAuthStore`) selalu mengembalikan `true`.
- MongoDB (`createMongoAuthStore`) selalu mengembalikan `true`.
- File store dan NekoDB mengembalikan `false` bila record tidak ditemukan.

Dampak: caller yang memakai return value untuk membedakan “dihapus” dan “tidak
ada” mendapat hasil salah. Audit storage sebelumnya juga mencatat bahwa rollback
migrasi tidak memeriksa hasil `remove()`.

Defect ini **tidak diperbaiki** pada fase ini karena scope fase adalah
infrastruktur integrasi dan verifikasi. Perbaikan memerlukan perubahan produksi
dan regression test tersendiri.

## F. Consumer Node 24/26

Tarball dibuat dari source saat ini dan allowlist `files`, tanpa mengubah
`package.json` atau lockfile. `npm pack` normal menjalankan lifecycle `prepare`;
karena itu tarball staging dibuat manual agar tidak memicu build berulang.
Validasi lifecycle `npm pack` penuh tetap menjadi batas terpisah.

| Runtime | Install | CJS | ESM | TypeScript | SQLite wrapper |
|---|---|---|---|---|---|
| Node `24.22.3` / npm `11.19.1` | 60 packages | PASS | PASS | PASS | PASS |
| Node `26.13.1` / npm `10.9.9` | 62 packages | PASS | PASS | PASS | PASS |

Smoke CJS/ESM memeriksa export publik dan tidak menemukan internal seam.
TypeScript fixture `legacy.cts` lulus. Wrapper SQLite nyata juga lulus di kedua
runtime. npm 11 pada Node 24 menampilkan warning `allowScripts` untuk
`preinstall`/`prepare`; package tetap terpasang dan smoke lulus. Engine gate
`preinstall` tidak dieksekusi oleh kebijakan npm tersebut.

## G. Validasi

| Perintah | Runtime | Exit | Hasil |
|---|---|---:|---|
| `tsc --noEmit` | Node `22.23.5` | 0 | Tidak ada error |
| `node .yarn/releases/yarn-4.18.1.cjs lint` | Node `22.23.5` | 0 | 0 error, 1360 warning (baseline) |
| `NODE_OPTIONS=--max-old-space-size=1024 node .yarn/releases/yarn-4.18.1.cjs test` | Node `22.23.5` | 0 | 79 suite, 1378 test lulus |
| `node --import tsx scripts/check-integration-env.ts --run` | Node `22.23.5` | 0 | SQLite 11 test lulus; 27 skipped |
| `FURINA_TEST_REQUIRED_BACKENDS=sqlite,redis ... --run` | Node `22.23.5` | 2 | Required backend yang tidak ready menggagalkan runner |
| Consumer CJS/ESM/TypeScript/SQLite | Node `24.22.3`, `26.13.1` | 0 | Semua smoke lulus |
| YAML parse workflow | Node `22.23.5` | 0 | Workflow dan service key terbaca |

Full unit suite menghasilkan warning worker force-exit yang sudah ada; tidak ada
test gagal. `actionlint` tidak tersedia di environment ini.

## H. Release Gate

**Infrastruktur:** siap dipakai untuk native run berikutnya, termasuk MongoDB
dan CI service container.

**Release gate:** belum siap karena:

1. Redis/MongoDB/NekoDB native belum dieksekusi.
2. Defect return value `remove()` belum diperbaiki.
3. Workflow CI baru belum dijalankan di GitHub.
4. Node 20 sudah EOL; kebijakan `engines` belum diputuskan ulang.

Urutan yang disarankan:

1. Jalankan workflow integrasi di GitHub dan simpan hasil native.
2. Perbaiki kontrak `remove()` beserta regression test lintas adapter.
3. Putuskan kebijakan Node 20 pada fase dukungan berikutnya.
4. Ulangi release gate setelah native Redis/MongoDB dan defect selesai.

## I. Batas Bukti

- Tidak ada koneksi WhatsApp nyata.
- Tidak ada pengujian durability crash, reconnect, atau concurrency lintas
  proses.
- Redis/MongoDB/NekoDB belum diverifikasi native.
- Migration rollback tetap best-effort, bukan atomic.
- Tarball consumer bukan hasil lifecycle `npm pack` penuh.
- Defect `remove()` adalah temuan source + native SQLite; Redis/MongoDB source
  inspection belum diganti dengan native execution.
