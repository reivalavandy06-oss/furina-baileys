# Integrasi Auth Store (Backend Nyata)

[Indeks](../index.md) · [Auth Store](../auth-stores.md) · [Audit Fase 13.3](../architecture/storage-safety-audit.md)

## Status dan runner

Fase 13.4 memperbaiki readiness, isolasi, registration, dan teardown harness.
**Backend nyata yang diuji di lingkungan ini: 0.** Test doubles memverifikasi
orchestration; hasilnya bukan bukti durability, transaksi, atau API koneksi driver
nyata. Driver/service tidak dipasang otomatis dan `.env` tidak dibaca.

```bash
node --import tsx scripts/check-integration-env.ts
# Hanya dengan infrastruktur test terisolasi yang telah disiapkan:
npm run test:integration
```

Probe tidak membuka koneksi atau membuat direktori. Import driver hanya untuk
memeriksa apakah paket dapat dimuat. Driver tersedia bukan bukti endpoint dapat
dihubungi: koneksi dilakukan ketika test membangun client, dan failure setup
menjadi test failure dengan teardown resource yang sudah dialokasikan.

Semua blocked + `--run` menghasilkan exit 2 tanpa meluncurkan Jest. Jika sebagian
ready, Jest memuat `*.integration.ts`; suite/direction blocked menjadi skipped
dengan `NOT RUN`, bukan passed. Default unit runner hanya `*.test.ts` dan kini
mencakup unit regression helpers harness. Tidak ada kebutuhan backend bagi unit.

## Konfigurasi dan isolasi

| Backend | Driver dan konfigurasi | Isolation behavior |
|---|---|---|
| SQLite | `better-sqlite3`; optional `FURINA_TEST_SQLITE_DIR` sebagai base directory | Child directory UUID privat per context; hashed file per logical session; tabel tetap `furina_auth` |
| Redis | `redis` + `FURINA_TEST_REDIS_URL` dengan protocol redis/rediss | UUID prefix stabil per context, hash session; reopen memakai prefix sama |
| NekoDB | `@nekodb/client` + `FURINA_TEST_NEKODB_HOST`, `FURINA_TEST_NEKODB_USERNAME`, `FURINA_TEST_NEKODB_PASSWORD`, `FURINA_TEST_NEKODB_TEST_INSTANCE=1` atau `true` | Collection prefix UUID + hash session; foreign collections tidak dibersihkan |

Redis menerima loopback atau remote dengan
`FURINA_TEST_ALLOW_REMOTE_REDIS=1`/`true`. Loopback bukan bukti instance nonproduksi:
caller tetap wajib memilih endpoint test. Optional `FURINA_TEST_REDIS_PREFIX`
tidak boleh mengandung glob/control characters. Cleanup memakai prefix literal
yang sama, menyaring hasil KEYS dengan startsWith sebelum DEL. Tidak memakai
FLUSHDB/FLUSHALL. Optional `FURINA_TEST_NEKODB_NAMESPACE` adalah **prefix**, bukan
nama collection existing yang akan dikosongkan. Flags isolasi adalah assertion
operator, bukan pemeriksaan server. Jangan gunakan credentials/endpoint produksi.

Setiap suite/context mendapat UUID sendiri; nama logical session yang sama
reopen storage sama dalam context itu. SQLite override base tidak dihapus;
hanya child yang dibuat context dihapus. Nama logical session di-hash agar tidak
menjadi path traversal atau SQL grammar. Tidak ada sanitasi tabel berbeda antara
CREATE dan query.

## Ownership dan teardown

`createIntegrationStores()` mempunyai registry sendiri. SQLite DB, Redis client,
dan Neko client didaftarkan segera setelah dibuat, sebelum schema/connect/duck
typing. State tests menyusun `makeAuthStateFromStore(rawStore)` supaya handle
tetap dimiliki harness; ini bukan pengujian langsung seluruh wrapper useXAuthState.
Neko constructor/export/init aktual tetap perlu dikonfirmasi pada versi driver
yang disiapkan; method checks tidak membuktikan koneksi/auth benar.

Conformance dan migration suites memasang afterAll yang menunggu registry.
LIFO menempatkan namespace cleanup sebelum close client jaringan dan DB closure
sebelum penghapusan SQLite directory. Bila satu operation reject, sisanya tetap
dicoba. Semua failures disimpan dalam `AggregateError.errors`; tidak di-log atau
ditelan. Concurrent dan repeated disposeAll mengembalikan Promise yang sama,
termasuk hasil rejection; resource tidak ditutup dua kali. Neko close dipanggil
dengan receiver aslinya. Fase 13.6 menambahkan label dan status per resource:
pending/running/succeeded/failed/timed-out/blocked. Default reporting deadline
10 detik per operation (configurable di registry unit helper) tidak membatalkan
I/O. Underlying completion Promise dan eventualStatus tetap tersedia lewat
getResults()/getDisposalResults(); rejection terlambat tetap diamati. Aggregate
error juga menyediakan results. Timeout bukan tanda resource telah ditutup.

Independent cleanup tetap dicoba setelah timeout; dependent cleanup diblokir.
SQLite directory removal mensyaratkan semua DB close sukses. Network close
menunggu namespace cleanup settle, termasuk failure, tetapi diblokir bila
cleanup timeout dan mungkin masih menggunakan client. Repeated disposal tidak
meluncurkan ulang operasi yang tertahan/gagal. Dependency yang kelak settle tidak
otomatis menjalankan blocked cleanup; operator harus memeriksa status dan mengambil
keputusan manual. Tidak ada force-destroy driver yang tidak terverifikasi.

Registration setelah teardown dimulai ditolak. Builder memeriksa admission
sesudah await driver/check dan sebelum allocation; SQLite directory creation
langsung didaftarkan, Redis close menunggu pending connect settle. Dengan demikian
teardown saat import/setup tertahan tidak diam-diam melewatkan client yang baru
dibuat. Constructor yang throw sebelum mengembalikan instance tetap tanggung
jawab driver.

## Cakupan dan batas bukti

SQLite/Redis/NekoDB conformance mencakup creds sintetis, Signal key persistence,
reopen, isolasi session, dan backup/restore. Enam arah migrasi di antara tiga
backend tersedia bila kedua backend ready. MongoDB didukung produksi, tetapi
belum mempunyai suite integrasi di harness ini.

Unit regressions dengan test doubles mencakup missing driver meski config lengkap,
endpoint invalid/missing, namespace stabil dan terpisah antar run, cleanup setelah
init gagal, preservation foreign keys/collections, Neko receiver, aggregate
errors, dan concurrent disposal. Test migrasi/restore menguji partial persistence,
write acknowledgement failure, verification error, preservation destination lama,
retry, dan rollback failures. Expected serialized binary diparse memakai
`BufferJSON.reviver`.

Fault wrapper integration yang throw sebelum batch masih hanya menguji batch
boundary; tidak membuktikan failure natural backend setelah key ke-40. Mock
fault tests tidak boleh dihitung sebagai real backend reliability. Semua record
tetap opaque strings; byte equality bukan validasi schema auth atau bukti sesi
dapat tersambung ke WhatsApp.

Test tidak sengaja mencetak creds, dan fatal runner error disanitasi. Namun Jest
diff atau driver log dapat memuat synthetic fixture/endpoint; jangan memasukkan
data asli. `src/__tests__` dikecualikan build dan source fixture/scripts tidak ada
dalam allowlist npm; verifikasi package listing saat release untuk stale lib.
Build/smoke/pack harus berurutan karena prepack membersihkan lib. Memory budget
test dapat disetel lewat NODE_OPTIONS; script integration tidak otomatis menyetelnya.

Lihat [Auth Store](../auth-stores.md) untuk kontrak non-atomic recovery,
destinationMayBePartial, ownership, dan prosedur offline cutover.
