# Security Alerts (Socket.dev) - Batch 2 Remediation

## Tujuan
Membersihkan alert keamanan dependency batch kedua yang dilaporkan Socket.dev,
terutama paket deprecated `request` sisa CVE High/Critical pada dependency tree.

## Kondisi Sebelum
- `request` (deprecated) **sudah tidak ada** di tree — dipastikan lewat
  `yarn why request` (kosong) dan `node_modules/request` tidak ada. Paket
  `@octokit/request` (scoped, paket berbeda) masih ada dan tidak termasuk
  masalah ini.
- Alert High tersisa adalah dev-only: `basic-ftp` dan `markdown-it`, keduanya
  masuk via `typedoc` (devDependency).
- Alert lain (moderate/low): `ip-address`, `minimatch`, `glob`.

## Tindakan
### 1. `link-preview-js` 4.0.4 -> 5.0.1
Paket ini adalah **peer dependency opsional** dan di-import dinamis
(`await import('link-preview-js')`) di `src/Utils/link-preview.ts:45`, sehingga
bump major aman dari sisi API — `getLinkPreview` tetap diekspor di v5 (sudah
diverifikasi saat runtime). v5 memakai `undici` + `cheerio`, bukan `request`,
yang membuat `request` benar-benar hilang dari tree.

### 2. `resolutions` diperbarui
| Key | Resolution baru | Alasan |
|-----|-----------------|--------|
| `form-data` | `2.5.6` | CVE form-data |
| `lodash` | `4.18.1` | sudah aman, dipatok eksplisit |
| `qs` | `6.16.0` | DoS/parameter pollution |
| `tough-cookie` | `4.1.3` | CVE prototype pollution |
| `uuid` | `11.1.1` | CVE |
| `minimatch` | `11.0.1` | glob-parts amplification DoS |
| `glob` | `14.0.2` | ReDoS/DoS |
| `ip-address` | `10.7.4` | quadratic-time DoS |
| `markdown-it` | `14.3.3` | quadratic-time DoS (High) |
| `basic-ftp` | `6.2.1` | quadratic-time CPU DoS (High) |

Catatan: `form-data`, `qs`, `tough-cookie`, dan `uuid` tidak ada di dependency
tree saat ini, jadi resolusi tersebut inert — however aman jika di masa depan
sebuah dependency menariknya masuk.

## Verifikasi
- `yarn why request` -> kosong, exit 0 (dipastikan `node_modules/request` tidak ada).
- `yarn npm audit --recursive --environment production` -> **exit 0, "No audit suggestions"**.
- `yarn npm audit --recursive` turun dari **2 High + 6 Moderate** menjadi
  **1 Low + 1 Moderate**, keduanya dev-only dan non-CVE:
  - `deepmerge@4.3.1` (Low) — via `jest-config`, dev-only.
  - `eslint` (Moderate) — *deprecation notice* "no longer supported", bukan CVE.
- `yarn lint` -> 0 errors.
- `yarn test --runInBand` -> semua lulus.

## Untuk Pengguna Library
Yang perlu diperhatikan: **`link-preview-js` naik dari v4 ke v5 (major)** di
`peerDependencies`. Library ini hanya jadi peer optional (bukan dependency wajib),
dan pemakainya harus memenuhi `^5.0.1` bila mengaktifkan fitur link preview.
