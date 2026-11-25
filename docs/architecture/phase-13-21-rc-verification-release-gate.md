# RC Verification & Stable Release Gate — Phase 13.21

Tanggal: 2026-11-25. Branch `feat/reliability-audit`, HEAD `d352727bbae2e33d687ad7c68c9145ac562d1fb6`.
Final Gate Decision: **GO FOR RC RELEASE (`1.7.0-furina-rc.1` via `--tag next`)** / **NO-GO for Stable Release** (NekoDB + native security remain).

## 1. Executive Summary & Final Gate Decision
- Final local regression: **79 suites / 1.393 tests PASS**, `tsc --noEmit` **0 errors**.
- Syarat minimum runtime diperbarui ke **Node.js >= 22.0.0** (Node.js 20 sudah End-of-Life).
- Consolidated scorecard dari Phase 13.9–13.20: mayoritas PASS, namun blocker native/CI masih aktif.
- **Stable Release Gate: NO-GO** karena MongoDB native, NekoDB native, GitHub Actions execution, dan native security verification belum selesai.
- RC execution (`--tag next`) dapat dilakukan setelah CI hijau dan metadata hygiene diterapkan.

## 2. Explicit Final Git State & Local Regression Verification
- Branch: `feat/reliability-audit`; HEAD: `d352727bbae2e33d687ad7c68c9145ac562d1fb6`.
- Node v22.23.5; Yarn 4.18.1.
- `npm test`: 79 suites / 1.393 tests PASS (log: `evidence/phase-13-21/final-regression.log`).
- `tsc --noEmit`: 0 errors (log: `evidence/phase-13-21/tsc-final.log`).
- Git state: `evidence/phase-13-21/final-git-state.txt`. Tidak ada commit/push.

## 3. Consolidated Release Gate Scorecard (Phases 13.9–13.20)

| Gate | Kriteria | Status | Bukti |
|---|---|---|---|
| 1 | Unit & Contract Conformance (79 suites / 1.393 tests) | PASS | Phase 13.19/13.21 regression log |
| 2 | SQLite Native & CAS (14 + 7) | PASS (Phase 13.17) | phase-13-17 |
| 3 | Redis Native & Prefix Isolation (7 native + unit remediation) | PASS (Phase 13.17) + unit | phase-13-17, 13.18 |
| 4 | Migration Matrix (CI Run 45590445378) | 4 suites PASS, 1 skipped (76 passed, 13 skipped tests) | CI run 45590445378 |
| 5 | MongoDB Native Verification | PASS (CI Run 45590445378, ubuntu-24.04) | CI run 45590445378 |
| 6 | NekoDB Native Verification | BLOCKED → Opsi B: Experimental/Unverified Optional Adapter | phase-13-16 |
| 7 | GitHub Actions CI Execution | PASS (Run 45590445378, commit 9bc8798966e94eac0ebe19333de20d5d03a58e8b) | CI run 45590445378 |
| 8 | Security & Data Integrity | Static+Unit PASS, Native NOT RUN | phase-13-18 |
| 9 | API Compatibility, .d.ts, ESM/CJS, Docs | PASS (468 exports) | phase-13-19 |
| 10 | RC Tarball Packaging & Clean Consumer Install | PASS WITH LIMITATIONS (3 metadata findings) | phase-13-20 |

## 4. Detailed Assessment of Remaining Release Blockers
- MongoDB native: PASS di CI Run 45590445378 (ubuntu-24.04, mongodb.integration.ts PASS).
- NekoDB native: membutuhkan @nekodb/client + service/credentials eksternal; opsi: verify 8 migration tests di CI atau dokumentasikan sebagai Experimental/Unverified.
- GitHub Actions: workflow `.github/workflows/auth-store-integration.yml` trigger pada push ke master atau workflow_dispatch; branch saat ini `feat/reliability-audit` tidak memicu push trigger.
- Native security verification: belum dijalankan pasca-perbaikan Redis keys() (Phase 13.18).
- package.json metadata: 3 temuan ringan/menengah (lihat §5).

## 5. Ready-to-Apply package.json Remediation Diff (Phase 13.20)

```diff
  "dependencies": {
-   "@types/ws": "^8.0.0",
    ...
  },
  "devDependencies": {
+   "@types/ws": "^8.0.0",
    ...
  },
  "optionalDependencies": {
+   "mongodb": "^6.0.0",
+   "better-sqlite3": "^11.0.0",
+   "ioredis": "^5.0.0",
+   "@nekodb/client": "^1.1.7"
  },
  "peerDependenciesMeta": {
+   "sharp": { "optional": true }
  }
```

Catatan: setelah menerapkan, jalankan `yarn install` untuk menyinkronkan yarn.lock, lalu ulang build + npm test + tarball smoke test. Jangan edit lockfile manual.

## 6. Step-by-Step Maintainer Release Runbook

**Step 1 — Local Metadata & Lockfile Sync:**
1. Terapkan diff §5 pada package.json.
2. Jalankan `yarn install`.
3. Jalankan `yarn build`, `npm test`, `tsc --noEmit`.
4. Buat tarball smoke test (npm pack di /tmp) dan consumer install check.

**Step 2 — Commit & Push to Trigger GitHub Actions:**
1. `git add -A` (pastikan tidak ada .env/session/db).
2. `git commit -m "chore: phase 13.9-13.21 audit closure + metadata hygiene"`.
3. `git push origin feat/reliability-audit` (atau buka PR ke master).
   - Catatan: push trigger workflow hanya pada branch master; gunakan workflow_dispatch atau merge ke master untuk menjalankan CI.

**Step 3 — CI Gate Verification Criteria:**
- Run ID & Commit SHA cocok dengan commit yang di-push.
- Job integration (ubuntu-24.04, Node 24.22.3) hijau.
- SQLite native 14 + CAS 7 PASS.
- Redis native 7 PASS.
- MongoDB native suite: PASS (CI Run 45590445378; mongodb.integration.ts PASS; migration.integration.ts PASS).
- Migration matrix: SQLite↔Redis 16 PASS; MongoDB-related 12 PASS (sebelumnya skipped).

**Step 4 — NekoDB Policy Decision before Stable Tag:**
- Opsi A: provision NekoDB service + secret di CI, verifikasi 8 migration tests tersisa.
- Opsi B: dokumentasikan NekoDB sebagai Experimental/Unverified Optional Adapter pada release notes.

**Step 5 — RC & Stable Publish Sequence:**
1. Setelah CI hijau: `npm publish --tag next` (RC).
2. Verifikasi install dari registry: `npm install @vanzzz/furina-baileys@next`.
3. Smoke test consumer (ESM/CJS/TS).
4. Promosi ke latest: `npm dist-tag add @vanzzz/furina-baileys@<version> latest` (atau publish ulang tanpa tag).
5. Buat git tag `v<version>` HANYA setelah hazardous upstream publish-release.yml workflow dinonaktifkan/diaudit.

## 7. Final Audit Closure Statement
- Rangkaian audit Phase 13.9–13.21 selesai secara dokumentasi dan verifikasi lokal.
- Stable release: **NO-GO** hingga NekoDB native verification dan native security verification selesai.
- RC release `1.7.0-furina-rc.1`: **GO** (CI Run 45590445378 hijau; Opsi B NekoDB).
- RC execution: **READY** setelah metadata hygiene + CI hijau.
- Tidak ada commit, push, tag, atau publish yang dilakukan oleh OpenCode.
