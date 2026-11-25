# Release Candidate Preparation — Phase 13.20

Status: **PASS WITH LIMITATIONS**. Overall AuthStore release readiness: **NOT READY**.

Tanggal: 2026-11-25. Branch `feat/reliability-audit`, HEAD `d352727bbae2e33d687ad7c68c9145ac562d1fb6`.

## 1. Executive Summary
- Audit packaging, dependency hygiene, dan clean consumer install dari tarball nyata.
- Tarball RC: `vanzzz-furina-baileys-1.6.0-furina.tgz` — 2.1 MB compressed, 19.0 MB unpacked, 1409 files.
- Leakage check: **0** file test/docs/evidence/.env masuk tarball.
- Clean consumer install: **PASS** (62 packages, 0 vulnerabilities).
- ESM + CJS + TS strict consumer check: **PASS** (468 exports).
- Runtime smoke (useMultiFileAuthState): **PASS**.
- Tidak ada perubahan source/config; tidak ada publish.

## 2. Repository Baseline & Phase 13.19 Closure Summary
- Phase 13.19: full Jest 79/1393 PASS, tsc 0 errors, consumer verification PASS.
- Phase 13.20 tidak mengubah source; baseline tetap valid.

## 3. package.json Metadata, Entrypoints & Dependency Hygiene
- name: @vanzzz/furina-baileys, version 1.6.0-furina, license Apache-2.0.
- main: ./lib/cjs/index.js, module: ./lib/esm/index.js, types: ./lib/cjs/index.d.ts.
- exports: "." dengan types/import/require → semua menunjuk file build yang ada.
- files: lib/**, WAProto/**, LICENSE, README.md, CHANGELOG.md, engine-requirements.js.
- engines: ^20.19.0 || >=22.12.0.
- Findings:
  - F1: `@types/ws` terdaftar di `dependencies` (seharusnya devDependencies) — Low.
  - F2: Optional drivers (mongodb, redis/ioredis, better-sqlite3) tidak dideklarasikan di peerDependencies/optionalDependencies, padahal lazy-loaded — Medium (consumer tidak tahu cara menginstal driver opsional).
  - F3: `sharp` peer dependency tidak ditandai optional di peerDependenciesMeta — Low.
  - F4: Subpath exports (mis. `/auth`) tidak diekspos; hanya root "." — Info (sesuai desain saat ini).

## 4. Release Candidate Tarball Audit
- Size: 2.1 MB compressed / 19.0 MB unpacked.
- Total files: 1409.
- Top-level: CHANGELOG.md, LICENSE, README.md, WAProto/, engine-requirements.js, lib/, package.json.
- Completeness: lib/cjs + lib/esm + WAProto + .d.ts + package.json masuk.
- Leakage: 0 (no __tests__, .test.ts, docs/architecture, evidence, .env).

## 5. Clean Consumer Tarball Installation Results
- Install: PASS (62 packages, 0 vulnerabilities).
- ESM runtime: PASS (468 exports).
- CJS require: PASS (468 exports).
- TS strict (Node16): PASS (0 errors).
- Runtime smoke (useMultiFileAuthState): PASS.

## 6. Findings & Severity
- F1 (Low): @types/ws di dependencies.
- F2 (Medium): optional drivers tidak dideklarasikan.
- F3 (Low): sharp peer not marked optional.
- F4 (Info): no subpath exports.

## 7. Pre-RC Remediation Checklist
- Pindahkan @types/ws ke devDependencies.
- Tambahkan mongodb, redis/ioredis, better-sqlite3 ke optionalDependencies/peerDependenciesMeta (optional: true).
- Tandai sharp optional di peerDependenciesMeta.
- Pertimbangkan subpath exports untuk auth (opsional).

## 8. Remaining Blockers & Overall Release Readiness
- MongoDB native: BLOCKED.
- NekoDB native: BLOCKED.
- GitHub Actions: NOT RUN.
- Native security verification: NOT RUN.
- Overall: **NOT READY**.

## 9. Inputs for Phase 13.21
- Apply remediation checklist (F1–F4) sebelum RC final.
- Native backend verification.
- CI execution evidence.
- Stable release gate.
