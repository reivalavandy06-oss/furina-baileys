Integrasi Auth Store (Backend Nyata)

Pengujian integrasi auth store dengan backend **nyata** — bukan mock. Tidak ada driver
palsu di sini: yang tidak tersedia dilaporkan `NOT RUN`, tidak pernah dilaporkan lolos.

[Dokumentasi utama](../README.md) · **Navigasi docs:** [beranda](index.md)

---

## 1. Arsitektur integrasi

Dua permukaan produksi harus dibedakan, dan keduanya diuji lewat file terpisah:

| Permukaan | Fungsi produksi | Dipakai untuk |
|---|---|---|
| `{ state, saveCreds }` | `useSQLiteAuthState`, `useRedisAuthState`, `useMongoDBAuthState`, `useNekoDBAuth` | jalur auth (`makeWASocket({ auth })`) |
| `AuthStore` mentah | `createSQLiteAuthStore`, `createRedisAuthStore`, `createNekoDBAuthStore`, `createMongoAuthStore` | backup / migrasi (membutuhkan `AuthStore`, **bukan** pembungkus state) |

Pemetaannya bukan pilihan gaya: `useXAuthState()` mengembalikan `ReturnType<typeof makeAuthStateFromStore>`,
yaitu `{ state, saveCreds }` — objek itu **bukan** `AuthStore`. Menggunakannya sebagai
`AuthStore` akan gagal kompilasi, dan itu memang disengaja.

Susunan file:

```
src/__tests__/Utils/auth-integration/
  availability.ts            probe ketersediaan + isolasi, per backend
  suite.ts                    wrapper suite; suite tak tersedia → skip, bukan lolos
  stores.ts                   pembangun client nyata + `AuthStore` nyata
  sqlite.integration.ts       konformansi sesi, persistensi restart, backup/restore
  redis.integration.ts        konformansi sesi, backup/restore, layout record key
  nekodb.integration.ts       konformansi sesi, backup/restore
  migration.integration.ts   6 arah migrasi + investigasi atomicity
scripts/check-integration-env.ts   matriks ketersediaan + runner
```

Aturan pemisahan runner:

- unit test: `*.test.ts` — inilah yang dijalankan `npm test`
- integrasi: `*.integration.ts` — **tidak** pernah ikut `npm test`

Karena `testMatch` bawaan hanya `**/*.test.ts`, menambah file integrasi tidak
mengubah jumlah suite maupun jumlah test unit. Selama fase ini kedua angka tetap
utuh (baseline: **66 suite / 1.269 test**).

### Probe ketersediaan

Dua pertanyaan ditanya terpisah, karena keduanya bisa gagal sendiri-sendiri:

- **driver** — paket npm-nya benar-benar bisa di-resolve
- **isolasi** — endpoint yang akan ditulis aman untuk ditulis (tidak produksi)

Format kembaliannya union bertenaga (`BackendCheck`), dan `.reason` hanya dibaca
setelah guard `isReady()`. Tidak ada properti yang diakses dari sisi union yang salah.

## 2. Driver backend yang dibutuhkan

| Backend | Driver | Status repo | Sifat |
|---|---|---|---|
| SQLite | `better-sqlite3` | optional peer dep | embedded, tidak perlu server |
| Redis | `redis` | optional peer dep | server |
| NekoDB | `@nekodb/client` | optional peer dep | server ber-auth |
| MongoDB | `mongodb` | optional peer dep | server — **di luar fase ini** |

Semua bersifat opsional. Driver di-resolve lewat spesifier **variabel**, sama seperti
kode produksi, sehingga TypeScript tidak pernah mewajibkan paket yang tidak dipasang.
Probe selalu dijalankan lebih dulu; driver hanya di-import setelah backend dinyatakan siap.

## 3. Infrastruktur terisolasi yang dibutuhkan

| Backend | Yang wajib ada | Kenapa |
|---|---|---|
| SQLite | tidak ada yang perlu dikonfigurasi | DB embedded, cukup file sementara |
| Redis | `FURINA_TEST_REDIS_URL` | endpoint Redis khusus test |
| NekoDB | `FURINA_TEST_NEKODB_HOST`, `FURINA_TEST_NEKODB_USERNAME`, `FURINA_TEST_NEKODB_PASSWORD`, `FURINA_TEST_NEKODB_TEST_INSTANCE` | endpoint NekoDB khusus test, plus penanda isolasi eksplisit |
| NekoDB (opsional) | `FURINA_TEST_NEKODB_NAMESPACE` | nama koleksi; kalau kosong dibuat otomatis unik per proses |
| Redis (opsional) | `FURINA_TEST_REDIS_PREFIX` | awalan key; kalau kosong dibuat otomatis unik per proses |
| SQLite (opsional) | `FURINA_TEST_SQLITE_DIR` | folder DB; kalau kosong dibuat otomatis unik per proses |
| Redis (opsional) | `FURINA_TEST_ALLOW_REMOTE_REDIS` | hanya untuk instance terisolasi non-loopback |

Konfigurasi dibaca **hanya** dari variabel lingkungan eksplisit. `.env` tidak pernah
dibaca, dan kredensial tidak pernah dicetak — matriks hanya melaporkan nama variabel
yang belum diisi.

Endpoint Redis non-loopback hanya diterima bila `FURINA_TEST_ALLOW_REMOTE_REDIS`
disetel, karena berarti penulis test sudah memastikan instance itu terisolasi.

## 4. Setup file sementara (SQLite)

SQLite adalah database embedded, jadi ia tidak butuh server maupun URL produksi.
Kesiapan SQLite **hanya** bergantung pada driver `better-sqlite3` tersedia —
variabel `SQLITE_*` tidak jadi prasyarat untuk test file sementara terisolasi.

Saat driver tersedia, tiap eksekusi:

1. membuat satu direktori sementara unik per proses (konsekuensi `mkdtempSync`)
2. membuat file database sementara per namespace test
3. membuat tabelnya sendiri bila store dibangun langsung (karena `createSQLiteAuthStore` murni; pembuat tabel ada di `useSQLiteAuthState`)
4. menutup koneksi saat teardown
5. menghapus **hanya** direktori sementara yang dibuat test itu

Direktori yang diminta eksplisit lewat `FURINA_TEST_SQLITE_DIR` dibiarkan utuh — hanya
direktori sementara yang dibuat otomatis yang dihapus.

## 5. Isolasi namespace (Redis)

Setiap eksekusi memakai awalan unik per proses. Semua key test berada di bawah awalan itu.

Cleanup menghapus **hanya** key milik namespace eksekusi ini:

```text
keys(ns + '*')  →  del(...)   # kalau ada
```

Yang tidak pernah dilakukan:

- `FLUSHDB`
- `FLUSHALL`
- menghapus key di luar namespace test
- mencetak kredensial koneksi

Sisi test memakai `createRedisAuthStore(client, prefix)` dengan `prefix` yang selalu
berawalan dari namespace eksekusi, jadi parking test tetap di bawah awalan yang dibersihkan.

## 6. Syarat isolasi NekoDB

- host dipilih eksplisit sebagai instance test lewat `FURINA_TEST_NEKODB_TEST_INSTANCE`; tanpa itu endpoint dianggap tak terbukti aman dan suite jadi `NOT RUN`
- koleksi memakai nama unik per proses; test **tidak** pernah menyentuh koleksi produksi
- cleanup memanggil `clear()` dari store produksi atas koleksi eksekusi ini, sehingga hanya dokumen bertanda owner yang dihapus — dokumen asing dan koleksi lain aman
- kredensial tidak pernah dicetak

Kalau isolasi tak bisa dipastikan, backend ditandai `NOT RUN`, bukan dijalankan.

## 7. Memeriksa ketersediaan backend

```bash
node --import tsx scripts/check-integration-env.ts
```

Skrip menjalankan `tsx`, sudah menjadi devDependency repo (`^4.20.3`), sehingga tidak
menambah dependensi baru. Field `type` root di `package.json` tetap tidak ada.

Keluarannya matriks per backend: driver, isolasi, status. Contoh lingkungan saat fase ini
dikerjakan:

```text
| Backend | Real driver available | Isolated test instance | Integration status |
|---|---|---|---|
| nekodb | no | not verified | NOT RUN — credentials not configured: ... |
| sqlite | no | not verified | NOT RUN — better-sqlite3 not installed |
| redis | no | not verified | NOT RUN — FURINA_TEST_REDIS_URL not set |
```

## 8. Menjalankan test integrasi

```bash
node --import tsx scripts/check-integration-env.ts --run
# atau lewat package.json
npm run test:integration
```

Perilaku runner:

- semua backend siap → suite backend itu berjalan
- sebagian siap → hanya backend siap yang berjalan, sisanya ditandai `NOT RUN` dan hasilnya dipisah
- tak ada yang siap → exit code non-nol (2) dengan penjelasan eksplisit bahwa integrasi terblokir; tidak ada test yang dilaporkan lolos

Suite backend yang tak tersedia tetap **dideklarasikan** dengan penjelasan blocker di judulnya,
lalu ditandai `skipped` — bukan `passed`. Jest menuntut setiap suite punya minimal satu test, jadi
penanda skip inilah bentuk "tidak dijalankan" yang jujur di jepretan hasil jest.

Waktu eksekusi terpantuh besar karena `ts-jest` melakukan full type-check per file
(satu file unit biasa saja sekitar 4,5 menit di lingkungan pengembangan fase ini). Integrasi
murni bersifat opsional, jadi biayanya tidak memengaruhi alur normal.

## 9. Arah migrasi yang didukung

Semua enam arah dipertahankan:

| # | Dari | Ke |
|---|---|---|
| 1 | NekoDB | SQLite |
| 2 | NekoDB | Redis |
| 3 | SQLite | NekoDB |
| 4 | SQLite | Redis |
| 5 | Redis | NekoDB |
| 6 | Redis | SQLite |

Syaratnya ketat: kedua backend harus benar-benar siap. Kalau salah satu tidak,
arah itu `NOT RUN` — tidak ada arah yang diuji "separuh" dan tidak ada yang dilaporkan
lolos.

Setiap arah menguji saat backend nyata: memindahkan seluruh sesi dan membiarkan sumber
utuh, mempertahankan record tujuan yang tak ada di backup, menimpa record tujuan yang cocok,
isolasi sesi bersamaan, penolakan migrasi store ke dirinya sendiri, serta pelaporan
verifikasi tak cocok tanpa merusak sumber.

## 10. Status cakupan backend nyata

**Pada fase ini: 0 backend nyata teruji.**

Di lingkungan saat dokumentasi ditulis, `better-sqlite3`, `redis`, dan `@nekodb/client`
**semuanya tidak terpasang**; `redis-server` tidak tersedia; `.env` tidak ada; tidak ada
kredensial maupun endpoint test terisolasi yang dikonfigurasi.

Konsekuensinya, dan ini harus dibaca apa adanya:

- **jumlah backend nyata yang benar-benar diuji: 0**
- **jumlah backend `NOT RUN`: 3** (SQLite, Redis, NekoDB)
- **belum ada satu pun test integrasi nyata yang benar-benar dieksekusi di sini**
- penelitian atomicity migrasi terhadap layanan nyata **belum** terverifikasi

Yang sudah diverifikasi hanya: harness memuat, melaporkan `NOT RUN` dengan alasan, exit code `--run`
saat semua terblokir, dan tidak mengganggu suite unit maupun paket npm.

## 11. Keterbatasan yang diketahui

- **belum ada backend nyata yang teruji** — seluruh isi dokumen ini adalah kesiapan, bukan hasil
- **semantik backend nyata belum terverifikasi** — perilaku `better-sqlite3`, `redis`, dan
  `@nekodb/client` pada kondisi nyata (encoding nilai, error koneksi, recovery) belum diobservasi
- **backup, restore, dan recovery belum diuji pada backend nyata** — misal kegagalan saat
  menulis credential, atau koneksi Redis terputus di tengah operasi
- **isolasi sesi pada backend nyata belum diuji** — yang sudah ada hanya pembuktian pada mock
- **upsert NekoDB memang tidak atomic** — `nekodb-auth.ts` melakukan `search` lalu `insert`
  atau `update`, dua langkah terpisah; serialisasi per key di dalamnya hanya melindungi satu
  proses, dan perekaman atomic lintas proses belum terverifikasi
- **tidak ada transaksi di `AuthStore`** — `migrateAuthState` memanggil `setMany` **sekali** untuk
  seluruh sesi; sebagian backend mengimplementasikannya sebagai loop per key (SQLite, Redis, dan
  NekoDB semuanya loop), jadi "atomic" hanya sebaik driver yang dipakai
- **partial write per-record sulit diprobe lewat seam `AuthStore`** — karena produksi mengeluarkan
  satu `setMany`, kegagalan yang disuntikkan di batas batch hanya membuktikan batch gagal; untuk
  melihat sisa record sebagian dibutuhkan kegagalan di dalam loop milik backend itu sendiri
- **`AuthStore.close()` bersifat opsional** — SQLite tidak mengekspos `close` lewat store, jadi
  penutupan koneksinya ditangani harness; `useRedisAuthState` tidak mengembalikan koneksinya ke
  pemanggil, sehingga test sisi state memakai komposisi publik yang sama dengan handle terdaftar
- **arah backup lintas-backend tidak lengkap** — matriks SQLite/Redis/NekoDB/Mongo menuntut
  konfigurasi media bersama; daftar 6 arah di atas hanya lingkup sesi, sudah ada 6 arah sesi yang dicakup
- **`exportAuthState` membangun backup di memori** — kembaliannya `Promise<Buffer>`, jadi sesi yang
  sangat besar membebani memori proses (alasan skrip test repo memakai `--max-old-space-size`)
- **MongoDB di luar cakupan fase** — `createMongoAuthStore` ada, tapi driver-nya tidak disiapkan

## 12. Temuan migrasi

Yang dimiliki sejauh ini semuanya berbasis mock/fake driver, **bukan** layanan nyata. Yang sudah
terbukti lewat unit test (dan bisa diulang dengan `npm test`):

| Perilaku yang sudah terbukti (mock) | Test |
|---|---|
| seluruh record pindah, sumber tetap utuh | `src/__tests__/Utils/auth/migration-manager.test.ts` — "moves every record and leaves the source intact" |
| record yang hanya ada di target tetap dipertahankan | sama — "keeps records that only exist in the target" |
| record cocok di target ditimpa | sama — "overwrites matching records in the target" |
| verifikasi bisa dilewati via `verify: false` | sama — "skips verification when verify is false" |
| migrasi store ke dirinya sendiri ditolak (400) | sama — "refuses to migrate a store onto itself" |
| verifikasi gagal → rollback memulihkan isi target lama | sama — "rolls back and restores the prior target content when verification fails" |
| rollback nonaktif → target berisi sebagian data | sama — "reports a partial write when rollback is disabled" |
| rollback yang sendiri gagal dilaporkan | sama — "surfaces a rollback that itself failed" |
| kegagalan baca sumber; percobaan ulang konvergen | `src/__tests__/Utils/auth/migration-faults.test.ts` — "preserves both sides on source read failure and converges on a repeated attempt" |
| migrasi bersamaan yang satu gagal tetap terisolasi | sama — "isolates concurrent independent session migrations while one fails" |
| penulisan tujuan yang terputus, sumber tetap utuh | sama — "settles an interrupted destination write and preserves the source" |
| teks rusak disalin apa adanya (verifikasi byte, bukan skema) | sama — "copies invalid serialized strings verbatim: byte verification is not schema validation" |

Yang **belum** bisa diklaim, karena memerlukan backend nyata:

- apakah `setMany` NekoDB yang gagal di tengah benar-benar meninggalkan sisa record
- apakah retry migrasi NekoDB membuat dokumen duplikat
- apakah penulisan bersamaan dua proses pada satu key membuat dokumen duplikat
- apakah rollback menyelamatkan isi target saat operasi backend nyata gagal

Test `migration.integration.ts` membedakan keduanya secara eksplisit: arah yang backend nyatanya
siap menguji produksi lewat store nyata, yang tidak siap ditandai `NOT RUN`. Kasus gagal-kontrol
(destinasi yang berbohong di verifikasi, destinasi yang batch-nya gagal) membungkus store nyata,
bukan menggantinya — jadi jalur produksi tetap yang diuji, bukan tiruannya.

**Atomicity migrasi tidak diklaim.** Tidak ada rollback spekulatif maupun workaround produksi
yang ditambahkan. Yang dibutuhkan sebelum klaim bisa dibuat: jalankan suite ini pada backend nyata
dan amati isi destinasi setelah kegagalan yang disuntikkan.

---

Kembali ke [README utama](../README.md).