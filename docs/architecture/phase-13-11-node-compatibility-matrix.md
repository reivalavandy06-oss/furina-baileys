# Node.js Compatibility Matrix — Fase 13.11

[Indeks](../index.md) · [Audit Fase 13.9](phase-13-9-post-remediation-audit.md) · [Native Backend Fase 13.10](phase-13-10-native-backend-integration.md)

Tanggal: 2026-11-22. Branch `feat/reliability-audit`.
HEAD awal dan akhir: `d352727bbae2e33d687ad7c68c9145ac562d1fb6`.
Yarn: `4.18.1` (`.yarn/releases/yarn-4.18.1.cjs`).

Mode: audit + test only. Tidak ada source, test existing, package metadata, lockfile, workflow, atau `AGENTS.md` yang diubah. Perubahan lokal Phase 13.10 tetap dipertahankan.

## 1. Executive Summary

- Kompatibilitas teknis package terverifikasi pada Node `20.20.2`, `22.23.5`, `24.22.3`, dan `26.13.1`.
- Build, typecheck, CJS/ESM smoke, dan TypeScript fixtures lulus pada semua runtime yang diuji.
- Full suite (79/1373) lulus pada Node `22.23.5`.
- Targeted compatibility tests (managed-auth 8/8 dan sqlite-cas 7/7) lulus pada Node `24.22.3` dan `26.13.1`.
- Node `20.20.2` hanya diverifikasi sebagai legacy compatibility, bukan target dukungan jangka panjang.
- Node `24` dan `26` secara teknis kompatibel pada pengujian yang dilakukan.
- Deklarasi `engines` saat ini (`^20.19.0 || >=22.12.0`) secara teknis berjalan, tetapi bagian Node 20 sudah EOL dan sebaiknya dipertimbangkan untuk dihapus pada fase dukungan berikutnya.
- Tidak ada bug kompatibilitas yang terbukti.

Overall decision: **READY WITH LIMITATIONS**.

## 2. Repository Baseline

Sebelum audit:

```text
 M AGENTS.md
 M src/Utils/auth-store.ts
 M src/Utils/auth/index.ts
 M src/Utils/auth/owned-resource.ts
 M src/Utils/link-preview.ts
 M src/__tests__/Utils/auth/mock-stores.ts
 M src/__tests__/Utils/auth/sqlite-cas.test.ts
?? docs/architecture/phase-13-9-post-remediation-audit.md
?? docs/architecture/phase-13-10-native-backend-integration.md
```

Sesudah audit:

```text
 M AGENTS.md
 M src/Utils/auth-store.ts
 M src/Utils/auth/index.ts
 M src/Utils/auth/owned-resource.ts
 M src/Utils/link-preview.ts
 M src/__tests__/Utils/auth/mock-stores.ts
 M src/__tests__/Utils/auth/sqlite-cas.test.ts
?? docs/architecture/phase-13-9-post-remediation-audit.md
?? docs/architecture/phase-13-10-native-backend-integration.md
?? docs/architecture/phase-13-11-node-compatibility-matrix.md
```

Semua perubahan pengguna dipertahankan. `AGENTS.md` tidak dimodifikasi.

## 3. Node.js Support Policy

Deklarasi aktual:

```json
"engines": {
  "node": "^20.19.0 || >=22.12.0"
}
```

Status resmi lini Node.js pada audit ini:

| Lini | Versi terbaru yang diuji/tersedia | Status resmi | Rekomendasi dukungan |
|---|---:|---|---|
| Node 20 | `20.20.2` | EOL (Iron) | Hanya legacy compatibility, bukan target baru |
| Node 22 | `22.23.5` | Maintenance LTS (Jod) | Didukung |
| Node 24 | `24.22.3` | Maintenance LTS (Krypton) | Didukung |
| Node 26 | `26.13.1` | Active LTS (Lithium) | Didukung / direkomendasikan |
| Node 27 | Alpha | Bukan target produksi | Tidak didukung |

Evaluasi:

- Node 20 masih lulus secara teknis pada `20.20.2`, tetapi lini Node 20 telah EOL.
- Keberhasilan Node 20 tidak berarti Node 20 layak direkomendasikan untuk pengguna baru.
- Node 22, 24, dan 26 kompatibel secara teknis pada pengujian yang dilakukan.
- Rekomendasi kebijakan: pertahankan deklarasi saat ini untuk kompatibilitas, tetapi pertimbangkan penghapusan Node 20 pada rilis berikutnya. Perubahan `engines` tidak dilakukan pada fase ini.

## 4. Runtime Matrix

| Node version | Engine check | Build | Tests | CJS | ESM | TypeScript | Consumer install | Status |
|---|---|---|---|---|---|---|---|---|
| `20.20.2` | PASS (dalam `^20.19.0`) | PASS (build artifacts loaded) | NOT RUN (full suite tidak dijalankan) | PASS | PASS | PASS | PARTIALLY VERIFIED (Phase 13.8) | PASS WITH LIMITATIONS |
| `22.23.5` | PASS | PASS | PASS (79 suites / 1373 tests) | PASS | PASS | PASS | PASS (Phase 13.8) | PASS |
| `24.22.3` | PASS (dalam `>=22.12.0`) | PASS (build artifacts loaded) | PASS (managed-auth 8/8, sqlite-cas 7/7) | PASS | PASS | PASS | NOT RUN | PASS WITH LIMITATIONS |
| `26.13.1` | PASS (dalam `>=22.12.0`) | PASS (build artifacts loaded) | PASS (managed-auth 8/8, sqlite-cas 7/7) | PASS | PASS | PASS | NOT RUN | PASS WITH LIMITATIONS |

Catatan:

- `20.19.0`, `22.12.0`, dan exact latest patch lain tidak diuji secara terpisah.
- Node 24/26 consumer tarball install tidak diulang pada fase ini; smoke CJS/ESM dan TypeScript fixtures dijalankan langsung terhadap build artifacts.
- Node 27 Alpha tidak termasuk matriks.

## 5. Build and Static Checks

Perintah build:

```bash
node .yarn/releases/yarn-4.18.1.cjs build
```

Runtime: `v22.23.5`
Exit code: `0`
Log: `/tmp/opencode/p1311-build.log`

TypeScript:

```bash
node .yarn/releases/yarn-4.18.1.cjs tsc
```

Runtime: `v22.23.5`
Exit code: `0`
Log: `/tmp/opencode/phase1310-tsc.log`

Lint:

```bash
node .yarn/releases/yarn-4.18.1.cjs lint
```

Runtime: `v22.23.5`
Exit code: `0`
Result: `0 errors, 1360 warnings`
Log: `/tmp/opencode/phase1310-lint.log`

## 6. Test Evidence

### Full suite — Node 22.23.5

```bash
NODE_OPTIONS=--max-old-space-size=2048 node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand --forceExit --testMatch '**/*.test.ts'
```

Exit code: `0`
Result: `Test Suites: 79 passed, 79 total`; `Tests: 1373 passed, 1373 total`
Log: `/tmp/opencode/p1311-full22.log`

### Managed Auth — Node 24.22.3

```bash
NODE_OPTIONS=--max-old-space-size=2048 node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand --forceExit --testMatch '**/managed-auth.test.ts'
```

Exit code: `0`
Result: `1 suite, 8 tests passed`
Log: `/tmp/opencode/p1311-managed24.log`

### Managed Auth — Node 26.13.1

Exit code: `0`
Result: `1 suite, 8 tests passed`
Log: `/tmp/opencode/p1311-managed26.log`

### SQLite CAS — Node 24.22.3

Exit code: `0`
Result: `1 suite, 7 tests passed`
Log: `/tmp/opencode/p1311-cas24.log`

### SQLite CAS — Node 26.13.1

Exit code: `0`
Result: `1 suite, 7 tests passed`
Log: `/tmp/opencode/p1311-cas26.log`

### CJS/ESM smoke

Script: `/tmp/opencode/p1311-smoke.js`

Hasil:

```text
v20.20.2: SMOKE OK, CJS 468, ESM 469
v22.23.5: SMOKE OK, CJS 468, ESM 469
v24.22.3: SMOKE OK, CJS 468, ESM 469
v26.13.1: SMOKE OK, CJS 468, ESM 469
```

Perbedaan ESM hanya `__esModule`, yang diharapkan.

### TypeScript fixtures

Fixtures:

- `/tmp/opencode/phase138-types/tsconfig.cjs.json`
- `/tmp/opencode/phase138-types/tsconfig.esm.json`
- `/tmp/opencode/phase138-types/tsconfig.headers.json`

Hasil:

- Node `24.22.3`: cjs `0`, esm `0`, headers `0`
- Node `26.13.1`: cjs `0`, esm `0`, headers `0`

Node `22.23.5` juga lulus pada Phase 13.9 (`0` untuk ketiganya).

## 7. Findings

### F-001 — Node 20 EOL
- Severity: Medium
- Runtime: Node 20
- Evidence: Node 20.20.2 masih lulus teknis, tetapi lini Node 20 berstatus EOL.
- Impact: pengguna baru tidak sebaiknya diarahkan ke Node 20.
- Recommendation: pertimbangkan penghapusan Node 20 pada rilis berikutnya; jangan ubah `engines` pada fase ini.

### F-002 — Deklarasi `engines` terlalu luas secara kebijakan
- Severity: Low
- File: `package.json`
- Evidence: `^20.19.0 || >=22.12.0` mengizinkan Node 20 EOL.
- Impact: secara teknis berjalan, tetapi tidak ideal sebagai rekomendasi dukungan jangka panjang.
- Recommendation: pertimbangkan `^22.12.0 || ^24.0.0 || ^26.0.0` pada fase dukungan berikutnya.

### F-003 — Consumer install tidak diulang untuk Node 24/26
- Severity: Low
- Runtime: Node 24/26
- Evidence: Phase 13.8 consumer install dilakukan pada Node 20.20.2 dan 22.23.5.
- Impact: install path tidak diverifikasi ulang pada Node 24/26.
- Recommendation: ulangi consumer install pada Phase 13.12 jika diperlukan.

### F-004 — Native backend tetap unverified
- Severity: High
- Component: Auth Store
- Evidence: Phase 13.10 menandai semua backend `NOT RUN`.
- Impact: kompatibilitas Node tidak membuktikan kompatibilitas database native.
- Recommendation: jalankan native integration saat driver/service tersedia.

## 8. Limitations

- Full suite tidak dijalankan pada Node 20.20.2, 24.22.3, dan 26.13.1.
- Consumer tarball install tidak diulang pada Node 24/26.
- Exact minimum versions (`20.19.0`, `22.12.0`) tidak diuji.
- Node 24/26 diuji dengan targeted tests, bukan full suite.
- Native backend behavior tetap `NOT RUN`.
- Node 27 Alpha tidak diuji dan bukan target.

## 9. Release Readiness

Decision: **READY WITH LIMITATIONS**

Dasar:

- Build, typecheck, CJS/ESM, dan TypeScript lulus pada Node 20/22/24/26.
- Full suite lulus pada Node 22.
- Targeted API/lifecycle/CAS tests lulus pada Node 24/26.
- Node 20 EOL dan consumer install Node 24/26 belum diulang.
- Native backend belum terverifikasi.

Bukan izin untuk publish atau release.

## 10. Next Phase Recommendation

Phase 13.12 sebaiknya fokus pada:

1. Rekomendasi dukungan Node.js dan keputusan `engines`.
2. Consumer install verification pada Node 24/26.
3. Native backend integration jika driver/service tersedia.
4. Persiapan RC hanya setelah native integration dan support policy diputuskan.

Stop condition: Phase 13.11 selesai. Tidak melanjutkan Phase 13.12 secara otomatis.
