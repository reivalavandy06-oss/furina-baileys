# Lifecycle & Persistence Safety Remediation — Fase 13.6

[Indeks](index.md) · [Audit Fase 13.5](lifecycle-crash-recovery-audit.md) · [Auth Store](auth-stores.md) · [Harness](testing/auth-store-integration.md)

Baseline branch `feat/reliability-audit`, HEAD sebelum perubahan
`a1b5c66814e26875f19195df1e848c070890a7eb`. Dua perubahan dokumentasi Fase 13.5
dipertahankan. Baseline aktual sebelum production edits: **72 suites / 1.327 tests
passed, 0 failed, 0 skipped**. Ini fase implementation security-sensitive karena
menyentuh persistence auth dan pelaporan storage failure; format credentials,
session, backup version 1, algoritma Signal, dan message/protocol format tidak
diubah. Tidak ada instalasi, akses `.env`, session asli, atau koneksi produksi.

## Missing tidak lagi menyembunyikan read failure

`createFileAuthStore` hanya mengubah ENOENT menjadi null/omitted key; EACCES,
EIO, timeout dan error lain diteruskan dengan identity error asal. Pemeriksaan
folder juga tidak menganggap semua stat failure sebagai folder belum ada.
`useMultiFileAuthState` membedakan missing file dari malformed JSON/null/array/
scalar, serta meneruskan read/parse failures. Loaded credentials tidak diganti
dengan initAuthCreds jika file ada tetapi malformed. Empty serialized Signal
record tidak lagi diam-diam diperlakukan absent oleh makeAuthStateFromStore.

Pesan JSON parse error generik, dengan original cause disimpan; error tidak
menyisipkan record bytes baru. SQLite/MongoDB existing row dengan value bukan
string ditolak, bukan disamakan dengan missing row. Opaque record API tetap
menyimpan string apa adanya; tidak menambahkan mandatory Signal schema ke backup.

Signal `loadSession` dan `validateSession` meneruskan storage/deserialization
failure. Missing session tetap hasil absent yang lama; valid closed session tetap
dapat menghasilkan no-open-session. Perubahan rejection ini disengaja: aplikasi
harus menangkap storage failure dan tidak menghapus session/pairing ulang hanya
karena penyimpanan tidak dapat dibaca. Jalur ini tidak mengubah cryptography.

Regression memakai injected filesystem errors, actual temp files sintetis,
malformed/valid records, dan Signal repository dengan controlled key store.
Permission error disuntikkan deterministik karena chmod bukan bukti EACCES saat
test berjalan sebagai root. Tidak ada key material asli yang dibaca/dicetak.

## Recovery conflict dan batas jaminan

Migration/restore untuk **object destination yang sama** diserialisasi lewat
WeakMap mutex. Ini tidak menyinkronkan raw writer, wrapper lain, atau proses lain.
Saat recovery:

1. Baca current value; jika sudah sama dengan snapshot awal, jangan menulis.
2. Jika current berbeda dari nilai yang hendak disalin, preserve current dan
   laporkan rollback conflict; jangan overwrite/delete berdasarkan snapshot buta.
3. Jika adapter punya optional atomic compareAndSet, pulihkan hanya record yang
   masih cocok dengan expected migration value. SQLite memakai conditional
   UPDATE/DELETE dalam satu statement, tanpa read/write transaction baru.
4. Tanpa capability itu, recovery lama tetap best-effort read-before-restore.
   Ia **bukan atomic compare-and-set**, sehingga exclusive offline access tetap
   prasyarat. Seluruh backend tidak otomatis mendapatkan distributed locking.

Error tetap mempertahankan primary cause, seluruh recovery errors, serta
destinationMayBePartial. Field tambahan rollbackConflicts dan conditionalRecovery
memudahkan caller mengenali konflik dan capability yang dipakai. Tidak ada source
clear atau destination clear dalam recovery. Unrelated destination keys tidak
disentuh. Tests lama set/remove fault seams tetap dijalankan pada common-interface
path; test baru khusus menguji conditional path termasuk perubahan setelah read
check tetapi sebelum conditional mutation.

**Yang belum selesai:** cross-process safety untuk Redis/NekoDB/MongoDB/file atau
custom store tanpa atomic capability. Check-then-set di fallback masih memiliki
TOCTOU. Bahkan value-CAS bukan version-CAS: ABA/same-value update tidak dapat
diidentifikasi, dan record dapat berubah setelah verification. Ini bukan perbaikan
online migration universal. Implementasi distributed locking, backend Lua/
transaction, unique indexes, dan versioned records sengaja tidak ditebak tanpa
driver/infra serta compatibility design. Jangan aktifkan destination setelah error.

## Owned dan borrowed connections

Convenience wrappers SQLite/Redis/MongoDB menambah close(): Promise<void>, menjaga
state dan saveCreds lama. Managed result menolak operasi baru setelah close dimulai,
menunggu operasi get/set/save yang telah admitted lewat result itu, kemudian close
owned resource satu kali. Concurrent/repeated calls berbagi completion/rejection.
Pending-operation failures dan close failure disimpan dalam AggregateError.errors;
cause pertama tetap dapat diperiksa. Initialization failure tetap mencoba cleanup
owned resource dan mempertahankan kedua errors bila cleanup ikut gagal.

Tidak ada automatic final save, global shutdown hook, atau force-destroy. Pending
I/O atau close yang hang membuat managed close tetap pending; tidak ada klaim telah
closed. Operasi aplikasi yang belum memanggil managed result, transaction work di
RAM, atau reference raw client lain tidak termasuk drain ini.

useNekoDBAuth dan makeAuthStateFromStore tetap borrowed tanpa close baru. Raw
SQLite/Neko factory tidak mengambil ownership. Raw Mongo menutup hanya callback
eksplisit yang kini memoized. Raw Redis mempertahankan default legacy close→quit,
kini exactly-once per store; shared-client caller dapat memilih opsi additive
`{ ownership: 'borrowed' }` agar store.close tidak quit client. Default behavior
tidak diubah diam-diam. Raw factories tidak menjanjikan managed operation drain.

Test doubles mencakup ketiga internally owned wrappers, init failure, pending save,
repeated/concurrent close, close error identity, dan Redis legacy/borrowed behavior.
Library wrapper close dan underlying drivers nyata belum dijalankan bersama.

## Disposal yang tidak menganggap timeout sebagai closed

Registry test harness mempertahankan Promise<void> disposal bersama dan LIFO
untuk resource independen. Setiap entry berlabel dan punya status pending, running,
succeeded, failed, timed-out, atau blocked. Reporting deadline default 10 detik
per entry, dapat dikonfigurasi di helper internal; **bukan cancellation**.
Completion Promise asli tetap tersedia, eventualStatus/error diperbarui setelah
late settlement, dan late rejection diamati. AggregateError.errors mempertahankan
original failures; results berisi label/status/resource yang belum selesai.

Setelah timeout, independent cleanup dapat berjalan, tetapi dependent cleanup
ditahan. SQLite directory remove mensyaratkan close DB sukses. Network close
mensyaratkan cleanup namespace settle, bukan sukses, agar cleanup failure yang
sudah selesai tidak membocorkan client; cleanup masih berjalan memblokir close.
Blocked entry tidak otomatis dijalankan kembali ketika dependency akhirnya selesai.
Repeated disposal tidak meluncurkan cleanup duplikat; caller memeriksa completion
dan mengambil keputusan manual. Tidak ada API driver cancellation yang diasumsikan.

Admission menolak registration sesudah teardown mulai. Builders memeriksa ulang
admission setelah await checks/import dan sebelum allocation, serta langsung
register directory creation/client. Redis close menunggu connect settle. Test
controlled loader menunjukkan teardown saat import tertahan tidak membuat client
baru yang tidak terdaftar. Destructor yang tidak settle tetap nyata, bukan success
palsu. Constructor throw sebelum mengembalikan instance tidak bisa di-unwind oleh
library dan tetap kontrak driver.

## Socket dan PreKey: fix kecil yang terbukti

Test memakai fake WebSocketClient tanpa transport nyata, controlled storage, dan
fake timers. Dua defects direproduksi sebelum fix:

- Upload deadline timer tertinggal ketika storage gagal sebelum deadline.
- Timeout membuang single-flight guard sementara underlying storage task hidup,
  sehingga pemanggilan berikutnya memulai logical upload lain.

Timer kini di-clear saat underlying task settle, dan guard baru dilepas pada
settlement task itu, bukan hanya saat deadline caller. Caller timeout tetap
menerima error; subsequent call saat task lama hidup tidak memulai duplicate.
Ini tidak membatalkan storage/network operation dan tidak mengubah format PreKey,
counter generation, query payload, atau retry algorithm. Task yang hang masih
memerlukan investigasi/shutdown coordination terpisah; reconnect socket baru
belum mendapat guard lintas socket.

Test juga mengkarakterisasi bahwa sock.end() **tidak** menunggu saveCreds async
subscriber aplikasi. Event emitter tidak diubah menjadi awaited API. Counter
creds.update masih dipancarkan sebelum key commit dan tidak satu durable
transaction dengan file creds; masalah ordering ini dicatat untuk review auth
terpisah, bukan diatasi dengan perubahan protokol spekulatif. Socket end completion,
throwing end hook, dan application-level persistence drain belum direfaktor.

## Crash investigation dan keputusan journal

Empat subprocess tests memakai source/destination file records sintetis dalam
private temporary root. Child mengirim IPC setelah snapshot sebelum write,
setelah 40 writes, sebelum verification selesai, atau saat rollback. Parent hanya
mengirim SIGKILL ke child yang dibuatnya sendiri lalu membuka file lagi, memeriksa
source/sentinel, dan melakukan offline retry. Deadlines test adalah batas wait,
bukan arbitrary sleep untuk mengatur concurrency. Semua child direap dan temp
root dibersihkan di finally.

Hasilnya membuktikan batas process interruption pada fixture file ini: sebagian
destination bisa bertahan, RAM snapshot tidak menyediakan rollback restart, dan
retry mengambil snapshot keadaan pasca-crash. Ini bukan pengujian power-loss,
SQLite/Redis/Neko/Mongo durability, atau session WhatsApp nyata.

**Tidak ada journal diimplementasikan.** Kebutuhan otomatis restart-resume belum
dibuktikan sebagai requirement produk. Workflow minimum tetap source retained,
writer dihentikan/drain, destination kandidat inaktif, verify, lalu cutover eksplisit.
Jika ingin kembali ke old destination, simpan backup sebelum migrasi; jangan
mengandalkan retry sebagai rollback ke kondisi percobaan pertama.

Proposal terpisah bila durable recovery kelak diperlukan:

| Alternatif | Kegunaan | Biaya/risiko yang harus ditangani dahulu |
|---|---|---|
| Snapshot RAM + manual recovery | Memulihkan failure yang settle dalam proses; paling kompatibel | Hilang saat crash; retain source/old backup dan operator completion tracking wajib |
| Completion marker | Membedakan candidate incomplete bila seluruh reader mematuhi marker | Tidak memulihkan old values; crash setelah data sebelum marker dan stale incomplete operation perlu status/version/fingerprint |
| Durable journal | Menyimpan old touched values dan intent sebelum mutation | Menambah salinan data sensitif, journal versioning/permissions/encryption/retention, flush order dan cleanup; crash antara journal dan DB serta DB dan checkpoint harus diuji |
| Staging namespace | Menjaga active namespace lama selama copy | Tambahan storage, reader routing/promotion/fencing lintas proses, orphan staging; bukan atomic cutover universal |

Desain journal harus menolak source/identity/version yang berubah, menetapkan
siapa berhak recover operasi lama, membedakan incomplete/corrupt/superseded,
memverifikasi durability storage journal, dan tidak auto-clear active sessions.
Filesystem lokal ephemeral container bukan journal durable lintas host. Jangan
menambahkan reserved auth keys atau mengubah session envelope tanpa kebutuhan
dan migration model yang lengkap.

## Validasi dan sisa risiko

Failing-before proof: memuat lima produksi file beserta harness file dan test dari
Git `a1b5c66`, menjalankan lima suite baru: 34 test dengan 30 gagal (4 karakterisasi
baseline lulus). Satu jalur production-fix kemudian menghasilkan seluruh suite baru
lulus. Bukti disimpan di log validasi lokal, bukan dokumen repo.

Suites baru: read-errors, recovery-conflicts, managed-auth, disposal-safety,
crash-recovery (subprocess), persistence-lifecycle.

Final gate hasil pada 2026-11-21, sequential:

| Gate | Hasil |
|---|---|
| Full Jest | **78 suites / 1.365 tests passed; 0 failed, 0 skipped** |
| Lint (tsc + eslint) | **0 errors**; 1.351 warnings legacy (bukan file baru) |
| Build CJS + ESM | Lulus |
| Smoke CJS | Lulus: 20 export public + migration + restore + lifecycle |
| Smoke ESM | Lulus |
| Declaration TypeScript | Lulus: managed result, `{ ownership: 'borrowed' }`, dan `AuthStore.compareAndSet` terlihat pada declaration emit |
| `npm run check:docs` | Lulus |
| `npm pack --dry-run --json` | Lulus: 1.409 files, 2.114.342 bytes, 19.019.154 bytes unpacked, tanpa `__tests__`, `.env`, creds, atau scripts |

Regression baseline: 72 suites / 1.327 pada HEAD awal.

Sisa risiko yang tidak boleh disembunyikan: fallback non-CAS butuh exclusive access;
value-CAS tidak menyelesaikan ABA; crash recovery belum durable; managed close
tidak membatalkan I/O yang hang; timeout disposal dapat meninggalkan resource
still-running/blocked; prekey credentials dan keys belum atomic; socket end belum
menunggu aplikasi; driver native concurrency/cancellation belum diuji. Tidak ada
klaim pairing ulang diperlukan, data mustahil hilang, atau backend nyata aman.
