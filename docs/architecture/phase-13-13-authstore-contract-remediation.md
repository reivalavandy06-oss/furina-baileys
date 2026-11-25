# AuthStore Contract Remediation — Fase 13.13

[Indeks](../index.md) · [Fase 13.12](phase-13-12-auth-store-integration-readiness.md) · [Auth Store](../auth-stores.md) · [API Compatibility](api-compatibility-audit.md)

Tanggal: 2026-11-23. Branch `feat/reliability-audit`.
HEAD awal dan akhir: `d352727bbae2e33d687ad7c68c9145ac562d1fb6`.
Node.js utama: `v22.23.5`.
Yarn: `4.18.1`.

Status: **READY WITH LIMITATIONS**.

## 1. Executive Summary

- `remove()` adalah kontrak `Promise<boolean>` yang dideklarasikan:
  “Delete a single record. Returns `true` when something was removed.”
- Implementasi File dan NekoDB sudah mengikuti kontrak tersebut.
- Implementasi SQLite, Redis, dan MongoDB sebelum fase ini selalu mengembalikan
  `true`, termasuk ketika record tidak ditemukan.
- Phase 13.13 memperbaiki tiga adapter tersebut dengan perubahan minimal:
  - SQLite memakai affected row count dari `run()` atau fallback `SELECT changes()`.
  - Redis memakai hasil `del()`.
  - MongoDB memakai `deletedCount`.
- Mock MongoDB diperbaiki agar `deletedCount` mencerminkan penghapusan sebenarnya.
- Regression test conformance ditambahkan untuk semua backend.
- Semua test yang dijalankan lulus. Redis/MongoDB/NekoDB native tetap `NOT RUN`.

## 2. Repository Baseline

- Branch: `feat/reliability-audit`
- HEAD awal/akhir: `d352727bbae2e33d687ad7c68c9145ac562d1fb6`
- Working tree sebelum fase berisi perubahan lokal dan laporan Phase 13.9–13.12.
- Semua perubahan lokal dipertahankan.
- Tidak ada commit, push, tag, publish, atau release.
- `AGENTS.md` tidak diubah oleh fase ini.

## 3. MongoDB Scope Clarification

MongoDB adapter **sudah production source** sebelum Phase 13.12.

Bukti:

- `src/Utils/auth-store.ts` mengekspor `createMongoAuthStore` dan
  `useMongoDBAuthState`.
- `src/Types/Auth.ts` dan `docs/auth-stores.md` mendokumentasikan MongoDB.
- Published package `1.5.0-furina` dan `1.6.0-furina` memuat `useMongoDBAuthState`.
- Commit pengenalan: `27e4386 feat(auth): add conformance tests, backup/restore, and migration manager`.

Phase 13.12 hanya menambahkan:

- readiness check MongoDB,
- builder integration MongoDB,
- suite `mongodb.integration.ts`,
- workflow service container.

Jadi ringkasan Phase 13.12 yang menyebut “tidak ada production source changes”
mengacu pada fase tersebut, bukan pada seluruh repository. MongoDB adapter
sendiri bukan hasil penambahan Phase 13.12.

## 4. AuthStore Contract

Kontrak saat ini:

```ts
interface AuthStore {
	readonly backend: string
	get(key: string): Promise<string | null>
	getMany(keys: string[]): Promise<Record<string, string>>
	set(key: string, value: string): Promise<void>
	setMany(entries: Record<string, string>): Promise<void>
	compareAndSet?(key: string, expected: string, replacement: string | null): Promise<boolean>
	remove(key: string): Promise<boolean>
	keys(): Promise<string[]>
	clear?(): Promise<void>
	close?(): Promise<void>
}
```

Semantik `remove()` yang berlaku berdasarkan interface, JSDoc, dan dokumen:

- `true` jika record ditemukan dan dihapus.
- `false` jika record tidak ditemukan.
- Error backend tetap dilempar; tidak disembunyikan.
- File backend dan NekoDB sudah mengikuti semantik ini sejak awal.

## 5. remove() Investigation

| Backend | Sebelum | Sesudah | Bukti |
|---|---|---|---|
| File | `true`/`false` | Tidak berubah | `unlink` try/catch |
| SQLite | Selalu `true` | `direct > 0`, lalu fallback `changes()` | `DELETE FROM ... WHERE key = ?` |
| MongoDB | Selalu `true` | `deletedCount > 0` | `deleteOne()` result |
| Redis | Selalu `true` | `deleted > 0`, fallback `true` bila driver tidak melaporkan | `del()` result |
| NekoDB | `true`/`false` | Tidak berubah | `resolveId()` + `delete()` |

Published package `1.5.0-furina` dan `1.6.0-furina` memiliki JSDoc yang sama
dan implementasi yang sama: SQLite/Redis/MongoDB selalu `true`. Oleh karena itu
perubahan ini memperbaiki kontrak yang sudah dideklarasikan, bukan mengubah
return type.

## 6. Backend Behavior Matrix

| Backend | Existing key | Missing key | Repeated remove | Error behavior | Isolation | Status |
|---|---|---|---|---|---|---|
| File | `true` | `false` | `false` | ENOENT tidak dilempar; IO lain dilempar | Folder isolation | Mock/unit PASS |
| SQLite | `true` | `false` | `false` | Driver sync/invalid count dilempar | DB/session isolation | Mock + native PASS |
| MongoDB | `true` | `false` | `false` | Invalid `deletedCount` dilempar | Collection isolation | Mock PASS; native NOT RUN |
| Redis | `true` | `false` | `false` | Driver error dilempar; fallback `true` bila result tidak number | Prefix isolation | Mock PASS; native NOT RUN |
| NekoDB | `true` | `false` | `false` | Delete error dilempar | Collection isolation | Mock/unit PASS |

## 7. Remediation

Perubahan:

- `src/Utils/auth-store.ts`: `createSQLiteAuthStore`, `createMongoAuthStore`,
  `createRedisAuthStore`.
- `src/__tests__/Utils/auth/mock-stores.ts`: `makeFakeMongoCollection.deleteOne`.
- `src/__tests__/Utils/auth/auth-store-conformance.test.ts`: regression test
  “reports whether remove() actually deleted a record”.

Tidak diubah:

- `AuthStore` interface dan return type.
- Public exports.
- `package.json`, `yarn.lock`, `engines`.
- `AGENTS.md` dan laporan sebelumnya.
- Workflow publish/release.

## 8. Regression Results

| Test group | Runtime | Hasil | Catatan |
|---|---|---:|---|
| AuthStore conformance | `v22.23.5` | 37 PASS | 5 backend adapter; mock SQLite/Redis/Mongo/Neko + File |
| SQLite CAS | `v22.23.5` | 7 PASS | Tidak terpengaruh |
| Native SQLite integration | `v22.23.5` | 1 suite / 11 test PASS | 27 skipped |
| Full unit suite | `v22.23.5` | 78 suite / 1.383 test PASS | 1 gagal tanpa driver symlink, lulus setelah symlink dihapus |
| Lint | `v22.23.5` | 0 error / 1.360 warning | Baseline tetap |
| TypeScript | `v22.23.5` | PASS | `tsc --noEmit` |

Catatan: suite unit menambah 5 test pada conformance, sehingga total test naik
dari 1.378 menjadi 1.383.

## 9. CI Status

- Workflow `.github/workflows/auth-store-integration.yml` tervalidasi secara sintaks
  YAML.
- Local equivalent: SQLite native PASS; Redis/MongoDB/NekoDB `NOT RUN`.
- GitHub Actions execution: **NOT RUN**, karena perubahan belum dipush dan
  service container belum dijalankan.

## 10. Limitations

- Redis native tidak tersedia.
- MongoDB native tidak tersedia.
- NekoDB native tidak tersedia.
- Rollback migration tetap best-effort, bukan atomic.
- Driver Redis/MongoDB dipasang hanya di `/tmp`, bukan package metadata.
- Symlink `node_modules/better-sqlite3`, `redis`, dan `mongodb` sudah dihapus.

## 11. Release Impact

Status: **READY WITH LIMITATIONS**.

Masalah utama kontrak `remove()` diperbaiki. Namun native Redis/MongoDB/NekoDB
belum dijalankan, sehingga release candidate belum dapat dinyatakan fully
verified.

## 12. Phase 13.14 Input

1. Jalankan workflow GitHub Actions dengan service Redis/MongoDB.
2. Tambahkan native regression untuk `remove()` pada Redis dan MongoDB.
3. Audit NekoDB native jika driver/instance tersedia.
4. Putuskan kebijakan Node 20 dan engine gate.
5. Jalankan full release gate setelah native backend PASS.
