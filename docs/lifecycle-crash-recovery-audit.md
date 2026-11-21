# Lifecycle, Concurrency & Crash-Recovery Audit — Fase 13.5

[Indeks dokumentasi](index.md) · [Audit storage Fase 13.3/13.4](architecture/storage-safety-audit.md) · [Auth Store](auth-stores.md) · [Integration Harness](testing/auth-store-integration.md)

**Status: audit-only. Tidak ada perubahan source, test, API, atau dependency.**
Tanggal laporan: 2026-11-21. Project `@vanzzz/furina-baileys`, branch
`feat/reliability-audit`, HEAD `a1b5c66814e26875f19195df1e848c070890a7eb`.
Working tree awal bersih; commit audit `1cf3c0b` dan remediasi `a1b5c66`
tersedia. Daftar seluruh 28 file perubahan Fase 13.4 ditinjau bersama diff
recovery/adapter dan implementasi harness, test, serta dokumentasinya.
Laporan historis sebelumnya tetap dipertahankan.

Semua nomor baris mengacu pada HEAD di atas. Acuan kerja:
[AGENTS.md](../AGENTS.md), [AI policy](../CODE_OF_CONDUCT.md#ai-policy), dan
[security policy](../SECURITY.md). Tidak ada akses `.env`, auth/session asli,
Signal keys asli, database produksi, atau instalasi. Tidak ada eksperimen
process-kill maupun integrasi backend nyata; skenario crash adalah analisis
alur source. Full test suite tidak dijalankan ulang: **72 suite / 1.327 tests
lulus adalah baseline historis Fase 13.4, bukan hasil baru Fase 13.5**.

Istilah bukti dalam laporan:

- **Source:** urutan/perilaku dapat ditunjukkan langsung pada source saat ini.
- **Risiko bersyarat:** ada interleaving atau trigger yang masuk akal dari
  source, tetapi dampak end-to-end belum direproduksi dalam audit ini.
- **Belum diketahui:** memerlukan driver/server, multiprocess, atau pengujian
  protokol terisolasi. Mock tidak menjadi bukti durability backend nyata.

## 1. Executive Summary

Fase 13.4 memperbaiki error recovery selama proses masih hidup: kegagalan write
dan verification masuk ke compensating rollback, old destination values
dipertahankan sejauh backend menerima recovery, dan original errors tidak hilang.
Itu **belum merupakan crash recovery atau proteksi concurrent writer**.

Empat kesimpulan utama:

1. Snapshot, expected records, status fase, dan hasil recovery hanya ada di RAM.
   Setelah proses mati tidak ada journal, migration ID, completion marker,
   atau gate pembukaan session untuk mengenali operasi terputus.
2. Migration/restore tidak memiliki lock atau version check. Rollback snapshot
   lama bisa menimpa perubahan sah writer lain. Mutex/queue Signal yang ada
   bersifat lokal dan tidak dipakai oleh raw migration/restore.
3. Registry disposal harness berbagi Promise dan mengumpulkan rejection dengan
   benar, tetapi masih serial: satu disposer hang menahan semua entry berikutnya.
   Cleanup produksi/socket belum memiliki completion, drain, dan status resource
   setara. Membatasi waktu tunggu tidak otomatis menutup resource.
4. Wrapper yang membuka DB sendiri belum menyediakan close pada hasil sukses.
   Socket tidak menunggu saveCreds aplikasi atau seluruh pending key writes;
   prekey counter update dan commit key bukan satu durable transaction.

Rekomendasi minimum Fase 13.6 adalah memperjelas dan menguji exclusive offline
cutover, menutup celah shutdown/ownership secara additive, dan mengkarakterisasi
prekey ordering dengan test deterministik sebelum mengubahnya. Journal/staging
production ditunda sampai ada kebutuhan restart-resume yang jelas. Jangan
memasang lock global atau mengklaim atomicity lintas backend.

## 2. Migration Crash Recovery

### 2.1 Urutan yang benar-benar berjalan

| Langkah | Source dan lokasi | Perilaku aktual |
|---|---|---|
| 1. Pilih source/destination | [migration-manager.ts:33–46](../src/Utils/auth/migration-manager.ts#L33) | Reject hanya jika object source === destination; dua wrapper physical store sama belum terdeteksi; emit read lalu enumerate source keys |
| 2. Baca dan validasi source | [migration-manager.ts:47–51](../src/Utils/auth/migration-manager.ts#L47), [record-recovery.ts:6–12](../src/Utils/auth/record-recovery.ts#L6) | getMany, wajib own string untuk setiap enumerated key, susun record map; bukan validasi JSON/Signal schema atau logical completeness |
| 3. Snapshot destination | [record-recovery.ts:21–25](../src/Utils/auth/record-recovery.ts#L21) | getMany hanya touched keys; validasi tipe returned values; nilai yang diomit dianggap tidak ada; tidak ada version/snapshot token |
| 4. Mulai write | [record-recovery.ts:26–29](../src/Utils/auth/record-recovery.ts#L26) | Emit write sebelum try, lalu await callback penulisan; migrasi memanggil satu setMany |
| 5. Baca ulang | [record-recovery.ts:30–37](../src/Utils/auth/record-recovery.ts#L30) | Default verify true; getMany expected keys lalu banding own property dan raw string; bukan atomic snapshot |
| 6. Sukses | [record-recovery.ts:38–39](../src/Utils/auth/record-recovery.ts#L38), [migration-manager.ts:59](../src/Utils/auth/migration-manager.ts#L59) | Emit done sinkron, return backend source/hasCreds/migrated; tidak persist status done |
| 7. Failure | [record-recovery.ts:40–48](../src/Utils/auth/record-recovery.ts#L40) | Catch write, verify, dan done callback exception; coba emit rollback; exception callback rollback disimpan terpisah |
| 8. Rollback | [record-recovery.ts:49–60](../src/Utils/auth/record-recovery.ts#L49) | Set old value atau remove jika sebelumnya absent, get per key untuk readback; failure per key disimpan, key berikutnya tetap dicoba |
| 9. Error hasil | [record-recovery.ts:62–72](../src/Utils/auth/record-recovery.ts#L62) | Boom 500 dengan cause asli dan data phase/rollbackAttempted/rollbackErrors/progressErrors/destinationMayBePartial |

Dengan verify: false, langkah baca/verifikasi dilewati. Dengan rollback: false,
recovery tidak dicoba. Error enumerasi/read/validasi/snapshot dan callback write
sebelum mutation keluar sebelum recovery; source ini sendiri belum menulis target
pada tahap tersebut. Callback bertipe void tidak di-await jika aplikasi memberikan
async function. Throw sinkron pada done justru dapat memicu rollback setelah data
sudah cocok; callback progres bukan durable commit atau notifikasi yang aman
dipakai untuk mengaktifkan destination.

Restore mengikuti [backup-manager.ts:159–186](../src/Utils/auth/backup-manager.ts#L159):
decode/validasi seluruh envelope dahulu, reject conflicting creds, bentuk
expected map, snapshot touched destination melalui helper yang sama, set creds
lebih dahulu (176), kemudian setMany keys (177), verify dan recovery. Backup
buffer asli tidak ditulis ulang. Versi backup tetap 1; gzip/JSON envelope valid
tidak membuktikan setiap serialized auth record valid.

Export ([backup-manager.ts:112–138](../src/Utils/auth/backup-manager.ts#L112))
mengambil keys lalu getMany tanpa lock, membuat envelope di RAM, gzipSync, dan
mengembalikan Buffer. Ia tidak menulis file durable atau fsync backup bagi caller.
Backup dari writer aktif dapat berisi nilai lintas waktu, meskipun gzip valid.

### 2.2 Matriks lima skenario crash

Asumsi matriks: physical source dan destination berbeda, writer lain dihentikan,
serta operasi backend yang telah selesai dapat dibaca lagi. Ini **bukan** klaim
durability terhadap power loss, crash server, atau filesystem tertentu.

| Skenario | Source | Destination | Snapshot/status setelah restart | Validitas, retry, dan recovery manual |
|---|---|---|---|---|
| 1. Mati setelah snapshot, sebelum write | Tidak diubah fungsi | Tetap keadaan awal menurut urutan source | Snapshot RAM hilang; tidak ada bukti bahwa migrasi pernah dimulai | Tidak rusak oleh write migrasi ini; validitas session lama tetap harus diketahui caller. Retry offline dapat dilakukan; rollback manual tidak diperlukan bila benar-benar belum ada write. Aplikasi restart tidak dapat membuktikan titik crash hanya dari records. |
| 2. Mati setelah creds/keys sebagian tersimpan | Source tetap | Campuran old/new/absent; restore menulis creds dahulu, migration mengikuti record order | Expected map dan old snapshot hilang; tidak ada penanda partial | Jangan aktifkan. Retry dari source/backup stabil ke destination baru dapat konvergen; memulihkan destination lama memerlukan backup sebelum operasi. Tanpa backup, overwrite lama mungkin tidak dapat dipulihkan otomatis. |
| 3. Semua write selesai, verification belum selesai | Source tetap | Mungkin seluruh expected values sudah ada, tetapi hasil/readback/durability belum diketahui | Tidak ada done marker; crash ini tidak dibedakan dari partial write | Jangan menganggap valid hanya karena creds ada. Baca ulang dan bandingkan dengan source stabil atau ulang ke namespace terpisah. Tidak selalu perlu rollback manual, tetapi perlu keputusan cutover operator. |
| 4. Mati saat rollback | Source tetap | Sebagian key kembali ke old value; sisanya new/absent; per-key readback sebelumnya bukan snapshot final | Snapshot RAM dan remaining work hilang | Tidak otomatis dapat dikenali atau dilanjutkan. Untuk restore old destination gunakan backup awal; alternatif ulang migrasi source stabil ke destination baru. Jangan clear sumber/target lama untuk menebak recovery. |
| 5. Restart lalu migration ulang | Source dibaca ulang pada waktunya, belum tentu sama dengan percobaan awal | Retry mengambil snapshot **keadaan pasca-crash**, lalu overwrite touched keys | Tidak memuat snapshot awal migrasi pertama dan tidak punya resume cursor/ID | Dapat konvergen untuk source stabil + akses eksklusif + backend sehat; bukan resume/rollback ke kondisi sebelum percobaan pertama. Source yang berubah atau writer aktif memerlukan pemeriksaan/manual recovery, bukan retry buta. |

Snapshot destination hanya memuat nilai lama yang dikembalikan getMany; ia tidak
dapat mengembalikan nilai yang tidak pernah berhasil dibaca. Pada file backend,
get/getMany menelan seluruh read error sebagai null/omitted
([auth-store.ts:135–148](../src/Utils/auth-store.ts#L135)). Maka IO error/permission
error dapat terlihat seperti key absent, dan recovery kemudian menghapus key
yang sebenarnya pre-existing. Ini risiko source yang perlu reproducer khusus;
validasi source dapat menolak missing enumerated source key, tetapi snapshot
destination tidak punya enumerasi nilai lama independen untuk mendeteksinya.

### 2.3 Durable recovery dan arti status

Tidak ada persistent migration state, completion marker, recovery journal,
unique migration identifier, resume cursor, atau status validation saat load.
[AuthStore:123–149](../src/Types/Auth.ts#L123) tidak menyediakan metadata transaksi,
lock, compare-and-swap, fsync/durability acknowledgement, atau identitas physical
store. HasCreds hanya memeriksa tipe string; loader
[auth-store.ts:72–94](../src/Utils/auth-store.ts#L72) mem-parse creds tanpa gate
migrasi dan mengembalikan null untuk missing Signal key. Partial session dapat
terbuka sebagai AuthenticationState; keberhasilan login/dekripsi belum dibuktikan.

destinationMayBePartial adalah hasil **percobaan recovery dalam satu proses**,
bukan certificate session completeness. False berarti tidak ada recovery error
yang diamati dari operasi/readback per key. Ia tidak menjamin source logical
valid, read berasal dari durable storage, atau data tidak berubah setelah read.
Setelah crash bahkan object error/status tersebut sudah tidak tersedia kecuali
caller mencatatnya sendiri. Error asli dan rollback causes bisa membawa data
driver sensitif; jangan log object mentah sebagai journal.

### 2.4 Per-backend write dan batas crash

| Backend | setMany source | Batas yang ada | Yang tidak diberikan adapter |
|---|---|---|---|
| File | [auth-store.ts:150–157](../src/Utils/auth-store.ts#L150) | Loop await writeFile | Tidak ada temp-file promotion, fsync atau multi-file commit; file yang sedang ditulis bisa belum lengkap saat proses mati |
| SQLite | [auth-store.ts:201–208](../src/Utils/auth-store.ts#L201) | prepare/run sinkron, loop dalam satu JS turn | Tidak memulai batch transaction; writer proses lain tidak dilindungi JS sync; journal mode/busy timeout/synchronous setting tidak dipilih adapter |
| Redis | [auth-store.ts:306–313](../src/Utils/auth-store.ts#L306) | Loop await SET | Tidak ada batch transaction, CAS, atau kebijakan persistence/replication ack di adapter |
| MongoDB | [auth-store.ts:253–260](../src/Utils/auth-store.ts#L253) | Loop await replaceOne upsert | Tidak ada transaction session, version filter, atau unique index key yang dibuat factory; concurrent upsert uniqueness bergantung schema DB |
| NekoDB | [nekodb-auth.ts:157–175,223–227](../src/Utils/auth/nekodb-auth.ts#L157) | Antrean write per key, per store instance | search→insert/update bukan satu transaksi; id cache dan antrean tidak survive restart; acknowledgement gagal sesudah insert dapat meninggalkan opaque doc yang belum dicache |

Tidak ada klaim bahwa semua backend pasti kehilangan acknowledged writes;
hasil persisten sebenarnya bergantung driver, server, storage, dan konfigurasinya.

### 2.5 Opsi arsitektur

| Pendekatan | Cara kerja / kelebihan | Kekurangan dan risiko | RAM, disk, backend, kompleksitas |
|---|---|---|---|
| Tanpa journal, offline copy + best-effort rollback | Source dipertahankan, destination baru/inaktif, verifikasi, cutover eksplisit; paling dekat dengan API sekarang | Tidak ada resume/crash identification; operator harus mengetahui candidate mana yang belum aktif; wrong cutover tetap berisiko | RAM O(source + previous touched bytes + readback), tanpa disk jurnal tambahan; semua backend; rendah |
| Durable journal | Tulis intent, source identity/version, old values, progress/status **sebelum** mutation; recovery memeriksa journal | Journal harus durable dan terlindungi seperti credentials; crash saat journal/DB update, key management, redaksi, stale locks dan diverged source perlu ditangani; menambah data sensitif | Disk O(old touched bytes + metadata), checkpoint streaming bisa membatasi RAM; storage journal perlu pilihan caller, tidak selalu local disk; tinggi |
| Staging namespace | Isi staging, verify, kemudian pilih active namespace melalui pointer/promotion | Copy staging bukan atomic cutover; semua readers/writers harus menaati pointer dan fencing; old reader/API bisa terus memakai namespace lama; orphan staging perlu cleanup | Disk sekitar satu salinan tambahan + old namespace; RAM dapat dibatch; namespace/promosi berbeda per backend; tinggi dan berpotensi mengubah routing/format |
| Completion marker | Catat in-progress/completed dengan source fingerprint; reader menolak candidate incomplete | Marker saja tidak memulihkan old values; marker sukses tidak mengatasi concurrent writes atau metadata durability; reader lama mengabaikannya | Metadata kecil jika tanpa per-key manifest; common get/set bisa menyimpan marker tapi reserved key/backup collision perlu desain; menengah; lebih aman awalnya metadata operator terpisah |
| Backend transaction | Group destination writes+verification sesuai capability driver/deployment | Tidak mentransaksikan source dan destination lintas backend; source snapshot, commit ambiguous, concurrent writer dan reconnect tetap butuh kebijakan; tidak semua transaction memiliki rollback error semantics sama | Lock/journal overhead driver, ukuran/waktu transaction; SQLite/Mongo/Redis perlu desain spesifik, file/Neko interface belum mendukung; menengah/tinggi |

**Pilihan awal:** jangan menambah journal generic sekarang. Tetapkan workflow
exclusive offline copy ke destination kandidat yang baru, retain source, lalu
cutover aplikasi yang eksplisit dan dicatat operator. Ini membatasi blast radius
tanpa mengubah session format. Bila kebutuhan produk mensyaratkan restart-resume
otomatis, buktikan dengan subprocess tests dahulu lalu pilih marker/journal
opt-in di luar auth keyspace dengan integrity/durability yang terukur. Jangan
menyebut external status log sebagai durable recovery jika tidak menyimpan data
yang diperlukan untuk memulihkan destination awal.

## 3. Concurrency & Data Consistency

### 3.1 Proteksi yang benar-benar tersedia

| Lapisan | Proteksi | Scope dan jalur yang melewatinya |
|---|---|---|
| Migration/restore/raw AuthStore | Tidak ada mutex/lock/version/CAS pada common interface | Seluruh operasi dapat overlap, termasuk dua wrappers physical store sama |
| Raw SQLite | Sinkron pada run statement; setMany loop tanpa await internal | Membatasi interleaving JS selama loop itu saja, bukan keseluruhan read→snapshot→write→verify atau proses lain |
| Raw NekoDB | Promise chain write per key (`nekodb-auth.ts:155–174`) | Per instance; remove/read/clear tidak masuk write queue; dua factory instance/proses tidak berbagi queue |
| Signal cache | cacheMutex runExclusive pada get/set (`auth-utils.ts:48–114`) | Per cache wrapper; clear pada 116–119 di luar mutex; external raw writes/migration tidak menginvalidasi cache wrapper lain |
| Signal transaction wrapper | AsyncLocalStorage, mutex per transaction key, queue concurrency 1 per type (`auth-utils.ts:130–168,267–355`) | Per invocation addTransactionCapability; berbeda transaction key bisa overlap; non-transaction state.set memakai queue berbeda dari transaction commit |
| PreKeyManager | Queue per keyType (`pre-key-manager.ts:19–25,40–67,107–124`) | Hanya menyusun/validasi operasi lokal; queue tidak mencakup seluruh durable commit + saveCreds + network upload |
| useMultiFileAuthState | Module Map mutex per joined file path (`use-multi-file-auth-state.ts:13–24,37–65`) | Berbagi di module copy yang sama, bukan antarproses/path alias; raw createFileAuthStore tidak memakai Map ini |

Signal transaction menahan mutation di AsyncLocalStorage sampai work selesai,
lalu memanggil state.set dengan retry (`auth-utils.ts:205–228,340–351`). Tidak ada
backend rollback jika state.set sudah menyimpan sebagian data. Log “rolling back”
pada catch bukan bukti durable rollback. Tidak ada shared lock antara key queues,
transaction mutexes, raw storage dan saveCreds. Context transaksi juga tidak
meliputi creds object JavaScript sebagai bagian database transaction.

### 3.2 Sepuluh skenario wajib

| # | Skenario | Konsekuensi source / batas proteksi |
|---|---|---|
| 1 | Dua proses menulis key sama | Set/upsert tidak memakai version predicate; lost update mungkin. Neko search→insert dapat duplikasi; Mongo uniqueness tidak dibuat factory. Commit order, duplicate prevention dan error driver harus diuji nyata. |
| 2 | Dua proses menulis key berbeda, session sama | Key berbeda bisa sama-sama tersimpan tetapi invariants antar-record/creds tidak dijaga. Partial batch/disconnect dapat membuat bundle campuran. |
| 3 | Migrasi saat creds diperbarui | Source creds sudah dibaca dapat menjadi stale; destination creds baru bisa ditimpa migrasi atau old snapshot rollback. saveCreds menulis seluruh JSON object, bukan merge versi. |
| 4 | Migrasi saat Signal keys berubah | Keys setelah enumerasi bisa hilang dari copy; key yang dihapus sebelum getMany dapat memicu source validation failure, tetapi perubahan nilai tidak dideteksi sebagai conflict. Raw migration tidak ikut Signal locks/cache invalidation. |
| 5 | Backup saat write | keys() dan getMany() terpisah, bahkan beberapa getMany berupa loop. Backup bisa lintas waktu atau omit keys yang hilang; envelope tetap valid. Tidak ada source version recheck. |
| 6 | Restore bersamaan dengan akses destination | Reader dapat melihat creds baru dengan keys lama/sebagian; writer baru dapat ditimpa write/rollback. Cache readers bisa melihat nilai yang tidak sama dengan raw destination. |
| 7 | Dua migration session sama | Masing-masing snapshot sendiri; verification satu dapat melihat hasil lain dan rollback menimpa migrasi yang sukses. Promise.resolve tidak berarti operasi kedua tidak mengubah data segera setelah verify. |
| 8 | Dua migration session berbeda | Bisa terisolasi bila physical namespace benar-benar berbeda; mock regression tersedia. Prefix overlap, file-name normalization, same DB table/collection, shared client closure dan resource bottleneck tetap harus dicek caller. Tidak perlu global lock lintas session. |
| 9 | Rollback bersamaan writer lain | Set old value/remove tanpa pemeriksaan current value/version; update sah sesudah snapshot bisa hilang. Readback per key tidak membuat seluruh recovery snapshot final konsisten. |
| 10 | DB terputus di tengah operasi concurrent | Beberapa requests mungkin sudah persist tanpa ack; recovery juga bisa reject/hang. Errors recovery disimpan setelah operasi settle, tetapi tidak ada drain/cancel semua peer operations atau reconciliation otomatis sesudah reconnect. |

Contoh conflict yang **dimungkinkan source**, belum dijalankan sebagai eksperimen:

1. Snapshot migration membaca destination `K = old`.
2. Migration menulis `K = copied`; aplikasi lain menulis `K = latest`.
3. Migration gagal pada key berikutnya.
4. Recovery menjalankan set(K, old), lalu readback old cocok.
5. Error dapat menyebut destinationMayBePartial false, sementara update aplikasi
   latest telah tertimpa. False di sini hanya terhadap snapshot migrasi sendiri.

Untuk key absent di snapshot, recovery remove dapat menghapus key baru milik
writer lain. Bahkan “current value equals what migration wrote” saja tidak
menyelesaikan ABA atau atomicity check-then-write tanpa backend CAS/version.

### 3.3 Rekomendasi concurrency yang proporsional

- **Exclusive maintenance session:** minimum yang aman secara kontrak, tetapi
  harus mencakup semua writer termasuk saveCreds, keys, backup/restore, dan
  instance/proses lain. Mutex hanya di manager migration tidak cukup.
- **Session-level local lock:** berguna bagi semua pemanggil yang berpartisipasi
  dalam **satu** runtime/wrapper; session berbeda tetap parallel. Ada kebutuhan
  identitas session eksplisit, reentrancy dan drain; object-identity lock bukan
  proteksi physical storage lintas wrapper. Jangan klaim cross-process safety.
- **Per-key lock:** menjaga ordering satu record dan concurrency antar key,
  tetapi tidak memberi bundle consistency/creds+keys snapshot. Multi-key lock
  juga membutuhkan lock ordering agar tidak deadlock.
- **Optimistic version/CAS + conflict detection:** dapat menolak stale rollback
  hanya jika check+mutation atomic dan semua writers menggunakan versi. Membaca
  nilai lalu membandingkan di JS tidak cukup. Menambah version wrapper ke semua
  record akan mengubah format, jadi butuh capability/backend design terpisah.
- **Backend transaction/distributed lease:** hanya bila kebutuhan multi-writer
  terbukti. Lease perlu fencing dan owner recovery, bukan TTL lock saja; pilih
  sesuai backend, ukur lock contention/latency. Tidak ada shared transaction
  lintas Redis/Mongo/Neko/SQLite dari AuthStore saat ini.

## 4. Resource Disposal

### 4.1 Satu disposer tidak pernah selesai

[createDisposalRegistry](../src/__tests__/Utils/auth-integration/lifecycle.ts#L3)
berada di **test harness**, bukan cleanup manager umum library. Ia pop LIFO dan
await serial pada baris 15–20. Bila urutan eksekusi A lalu B lalu C, A sukses dan
B pending selamanya, C **tidak pernah mulai**, AggregateError tidak pernah
dilempar, finished tidak disetel dan semua concurrent disposeAll tetap pending.
Untuk LIFO ini, contoh urutan registrasinya adalah C, B, A.

Tidak ada timeout, signal cancellation, per-resource status, atau label resource
di registry. Rejection berbeda dari hang: setelah rejection, entry berikutnya
tetap dicoba dan semua penyebab disimpan dalam AggregateError.errors. Urutan
errors mengikuti failure LIFO, tanpa ID resource yang stabil. Error gagal lain
sebelum hang hanya tersimpan di array closure, belum tersedia bagi caller.

### 4.2 Idempotency dan dependency cleanup

| Kasus | Registry harness | Production/raw close dan Socket |
|---|---|---|
| Sekali | Coba seluruh entry yang settle; reject aggregate jika ada failure | Berbeda per API; tidak ada coordinator DB umum |
| Dua kali setelah settle | Promise yang sama, tidak retry resource yang gagal | Redis raw close memanggil quit lagi, Mongo callback dipanggil lagi; driver idempotency tidak dibuktikan |
| Concurrent | Promise identity sama sejak disposal dijadwalkan | Socket closed guard kembali cepat pada caller kedua, bukan completion bersama |
| Resource sudah closed | SQLite harness cek open !== false, Redis cek isOpen !== false; Neko close optional | Optional flag bukan bukti semua sockets/reconnect jobs sudah berhenti; error driver belum dipetakan berdasarkan status |
| Init gagal | Resource yang sudah registered dicoba ketika suite teardown berjalan | owned-resource helper await close lalu throw primary; close reject mengaggregate, close hang menahan original error selamanya |
| Allocation bersamaan teardown | track menolak setelah disposal mulai | Builder mempunyai await check/load/connect sebelum track; belum ada admission guard atau tracking pending builders |

Kasus allocation race terakhir terlihat pada
[stores.ts:48–98](../src/__tests__/Utils/auth-integration/stores.ts#L48):
disposeAll dapat mulai saat builder menunggu import. Builder kemudian membuat
client, track melempar, dan client baru itu tidak ada di registry. Immediate
registration memperkecil window setup failure, tetapi tidak menghilangkan race
allocation-vs-disposal. Promise-only lifecycle tests belum mencakup kasus ini.

Harness menata cleanup namespace sebelum client close dan SQLite close sebelum
directory remove ([stores.ts:55–98](../src/__tests__/Utils/auth-integration/stores.ts#L55)).
Bila close SQLite reject, registry tetap bisa menghapus directory pada entry
berikutnya walaupun handle mungkin belum closed. Bila cleanup namespace Redis
reject/hang, key test mungkin tertinggal; tidak boleh mengklaim seluruh resource
sudah hilang hanya karena beberapa close berhasil. Cleanup namespace Neko memakai
clear dokumen store, bukan API drop collection; collection kosong mungkin tetap
ada di server. Driver API untuk menghapus container collection belum diverifikasi.

### 4.3 Timeout yang jujur

Disposal registry dan [owned-resource helper:8–18](../src/Utils/auth/owned-resource.ts#L8)
tidak memakai Promise.race. Socket prekey upload memakainya untuk timeout kerja,
bukan cleanup. Race bukan cancellation; pekerjaan asli dapat terus berjalan.
Promise pending saja tidak membuktikan proses Node tetap hidup, tetapi DB sockets,
timers, atau caller yang menunggu dapat menahan shutdown dan CI teardown.

Jika Fase 13.6 menambahkan deadline:

1. Bedakan status `succeeded`, `failed`, `timed-out/still-running`, dan `not-started`.
   Jangan menyatakan resource closed pada timeout.
2. Pertahankan satu underlying cleanup task; caller kedua tidak memulai duplicate
   close. Simpan eventual settlement/error, dan tangani rejection terlambat.
3. Hanya cleanup **independen** yang boleh dilanjutkan tanpa menunggu disposer
   hang. Jangan menghapus directory/close shared DB jika writer/child masih aktif.
4. Gunakan cancellation hanya jika client mendukungnya dan efeknya teruji.
   Force-destroy berisiko kehilangan pending writes dan harus kebijakan eksplisit.
5. Laporkan resource label, phase, primary cause, seluruh tambahan errors dan
   unresolved resources tanpa memasukkan endpoint atau record bytes.

AggregateError sudah dipakai dengan lib reference ES2021 pada
[lifecycle.ts:1–23](../src/__tests__/Utils/auth-integration/lifecycle.ts#L1) dan
[owned-resource.ts:1–16](../src/Utils/auth/owned-resource.ts#L1); engine package
[Node >=20](../package.json#L195). Tidak diperlukan polyfill/dependency tambahan
untuk mempertahankan mekanisme itu dalam kontrak runtime tersebut. Kekurangan
sekarang adalah status/label/deadline, bukan pengumpulan multiple rejections.

### 4.4 Socket cleanup bukan DB drain

[socket.end:627–668](../src/Socket/socket.ts#L627): set closed, clear keepalive/QR,
remove ws close/open/message listeners, signalRepository.close(), await ws.close,
await end handlers satu per satu dengan catch/log, emit close lalu ev.destroy.
Risiko yang source tunjukkan:

- signalRepository.close di luar try/catch; custom repository throw dapat
  menghentikan seluruh teardown setelah closed=true. Default repository saat ini
  hanya clear cache ([libsignal.ts:257–260](../src/Signal/libsignal.ts#L257)), bukan
  drain DB; failure default tersebut tidak direproduksi.
- ws.close error ditelan; end-handler errors di-log tetapi tidak dikembalikan
  sebagai status. End-handler hang mencegah handlers berikutnya dan ev.destroy.
- WebSocketClient.close menunggu event close tanpa deadline lokal
  ([websocket.ts:43–56](../src/Socket/Client/websocket.ts#L43)); perilaku terminasi
  bawaan dependency ws belum diteliti sebagai jaminan deadline library.
- Synchronous listener connection.update yang throw dapat melewati ev.destroy;
  async listener saveCreds yang pending tidak ditunggu dengan menghapus listener.
  Callback yang sedang berjalan tidak dibatalkan oleh removeAllListeners.
- waitForMessage memasang close listeners dan membersihkannya di finally
  ([socket.ts:173–212](../src/Socket/socket.ts#L173)); end menghapus close listeners
  sebelum physical close sehingga pending waiter bisa baru settle lewat timeout.
  Dengan timeout dinonaktifkan, perlu uji waiter completion eksplisit.

## 5. Connection Ownership

### 5.1 Matriks seluruh API

| API | Siapa mengalokasikan? | Close saat sukses | Initialization failure / kontrak |
|---|---|---|---|
| useSQLiteAuthState | Library new DB, `auth-store.ts:220–237` | Tidak di-return; tersimpan dalam closure store | Schema/load failure lewat owned-resource helper mencoba db.close; constructor throw sebelum instance didapat tidak dapat ditutup helper |
| useRedisAuthState | Library createClient/connect, `auth-store.ts:327–340` | Tidak di-return | Init failure mencoba quit jika isOpen !== false; belum ada abort/connect-retry cleanup yang tervalidasi driver |
| useMongoDBAuthState | Library new client/connect, `auth-store.ts:272–287` | Store internal punya callback close tetapi wrapper menyembunyikannya | Init failure mencoba client.close; helper close hang tetap menahan rejection |
| useNekoDBAuth | Caller memberi initialized client, `nekodb-auth.ts:249–263` | Caller close, wrapper tidak menutup | Require module/duck typing/load failure tidak mengambil ownership client; benar untuk borrowed resource |
| createSQLiteAuthStore | Caller membuka DB dan schema, `auth-store.ts:176–217` | Store tidak mengekspos close | Borrowed; tidak auto-close, tidak drain |
| createRedisAuthStore | Caller memberi connected client, `auth-store.ts:290–325` | close() selalu quit client yang diberikan | Tidak auto-close saat get/set failure, tetapi **explicit store.close menutup borrowed client**, termasuk session lain yang berbagi client |
| createMongoAuthStore | Caller memberi collection, `auth-store.ts:240–270` | close optional hanya jika callback caller disediakan | Callback merupakan delegasi cleanup eksplisit, bukan inferensi ownership; tidak memoized |
| createNekoDBAuthStore | Caller memberi client+collection, `nekodb-auth.ts:109–239` | Tidak ada close | Borrowed, map/queue lokal tanpa public drain; caller menunggu tasks-nya sendiri |
| makeAuthStateFromStore | Caller memberi store, `auth-store.ts:69–118` | Hanya state/saveCreds, tidak meneruskan close | Tidak mengambil ownership atau auto-close store pada failure; tepat bagi borrowed composition |

`useXAuthState` sukses mempertahankan resource melalui closure dan tidak memberi
handle untuk menutupnya. Caller dapat memakai raw composition sekarang, tetapi
wrapper yang mudah dipakai ini belum memenuhi lifecycle managed connection.
Sebaliknya jangan berasumsi semua raw factory borrowed berarti close no-op:
raw Redis close memang mengakhiri client. Risiko berasal dari explicit close
oleh caller pada shared client, bukan library diam-diam memanggilnya saat socket end.

Init helper menangani satu initialize invocation, bukan close-once sepanjang
umur session. Raw close Redis/Mongo callback belum memoized atau dikoordinasikan
dengan pending get/set. Tidak ada library-wide inflight request registry. Tidak
ada ownership enum pada AuthStore; optional close tidak menyatakan siapa boleh
memanggil, kapan flush selesai, atau perilaku sesudah close.

### 5.2 Pilihan desain additive untuk Fase 13.6

Kebutuhan close untuk library-owned successful wrappers terbukti dari alokasi dan
return shape. Raw borrowed clients tidak perlu diambil alih. Pilih satu pendekatan
setelah test kontrak existing:

- **Pilihan paling konservatif:** pertahankan wrapper lama, dokumentasikan raw
  composition sebagai jalur lifecycle eksplisit, sediakan contoh ownership yang
  jelas. Tidak menutup celah convenience wrapper, tetapi tidak mengubah API.
- **Additive managed result:** pertimbangkan close(): Promise<void> tambahan pada
  wrapper yang **membuat** client, tetap mempertahankan state/saveCreds dan argumen
  lama. Uji Object.keys/exact return-shape expectations, declaration consumers,
  CJS/ESM dan structural typing. Alternatif managed factory baru opt-in dapat
  menghindari perubahan own keys tetapi menambah API; tidak perlu keduanya.
- Shared close Promise, close-once, tolak operasi baru setelah closing, tunggu
  tracked owned operations sebelum close. Jangan memanggil saveCreds otomatis
  tanpa kontrak, memasang process signal handler global, atau menutup borrowed DB.
- Raw Redis ownership option hanya jika penggunaan shared client memerlukan
  store-level dispose; default quit existing tidak boleh diam-diam diubah.

Contoh desain hasil additive berikut **usulan, belum API yang tersedia**:

```typescript
// Hanya jika managed result disetujui pada Fase 13.6:
const managed = await useSQLiteAuthState(folder)
// ... hentikan producer dan tunggu tugas persistence aplikasi ...
await managed.saveCreds()
await managed.close() // proposed; tidak tersedia pada HEAD audit
```

Contoh yang sudah bisa dipakai ialah caller membuka driver, membuat raw store,
memakai makeAuthStateFromStore, lalu menutup driver lewat reference caller setelah
semua persistence yang ia mulai selesai. close bukan clear atau logout.

## 6. Socket & Signal PreKey Lifecycle

### 6.1 Urutan prekey dan jaminan yang terbatas

1. Socket memakai creds reference dari authState dan membungkus key store dengan
   addTransactionCapability ([socket.ts:382–387](../src/Socket/socket.ts#L382)).
2. uploadPreKeys membuat guard lokal, masuk keys.transaction; getNextPreKeys
   menghasilkan key material, keys.set, keys.get, dan counter update
   ([signal.ts:225–260](../src/Utils/signal.ts#L225)). Saat di transaction wrapper,
   keys.set ini masih mutation di RAM.
3. ev.emit(creds.update, update) terjadi **di dalam transaction work**
   ([socket.ts:502–508](../src/Socket/socket.ts#L502)); listener internal langsung
   Object.assign(creds, update) ([socket.ts:1065–1079](../src/Socket/socket.ts#L1065)).
   Commit state.set baru dijalankan sesudah work return
   ([auth-utils.ts:340–351](../src/Utils/auth-utils.ts#L340)).
4. Subscriber aplikasi saveCreds menulis seluruh creds; tidak termasuk commit
   mutation key store dan tidak ditunggu event emitter. Commit gagal tidak
   memulihkan creds JavaScript atau file creds yang sudah disimpan subscriber.
5. Upload query baru dicoba setelah transaction Promise sukses. Jadi jalur normal
   memang menunggu commit wrapper, tetapi komentar “save atomically” pada socket
   tidak membuktikan atomic database commit seluruh creds+prekeys.
6. Commit retries default 10 dengan delay 3 detik
   ([Defaults/index.ts:83](../src/Defaults/index.ts#L83)); masing-masing state.set
   dapat partial/ambiguous. Data key diperbanyak di RAM sebelum persist seluruhnya.

Counter bisa maju di RAM/creds file meski penyimpanan sebagian keys gagal; crash
di sela saveCreds dan key commit bisa membuat ketidaksesuaian. Sebaliknya key
commit bisa berhasil sementara saveCreds gagal. Risiko ini mengikuti urutan
source; efek ID reuse, missing prekey, decryption failure, atau pairing ulang
**belum direproduksi**. Perubahan ordering harus direview khusus auth/Signal,
tidak menebak perilaku server.

### 6.2 Timeout dan reconnect

Timeout upload 30 detik ([Defaults/index.ts:144](../src/Defaults/index.ts#L144))
memakai Promise.race ([socket.ts:529–541](../src/Socket/socket.ts#L529)). Timer
tidak disimpan/diclear jika upload selesai lebih cepat. Bila timeout menang,
uploadLogic/retry/backoff tidak dibatalkan, tetapi guard uploadPreKeysPromise
dikosongkan. Pemanggilan berikutnya dapat memulai logical upload lain sementara
yang lama masih berjalan. Mutex transaction lokal mungkin mengurutkan bagian
commit dengan key sama; ia tidak menghentikan task lama atau memberi drain saat
socket ditutup. Jangan menganggap timer loser otomatis unhandled rejection:
race memasang rejection handler, sedangkan side effects tetap berjalan.

uploadPreKeysToServerIfRequired menangkap error dan membiarkan login melanjutkan
([socket.ts:556–585](../src/Socket/socket.ts#L556)). CB:success melanjutkan event
connection open setelah initialization checks
([socket.ts:950–998](../src/Socket/socket.ts#L950)). Open bukan bukti semua auth
save subscriber sudah durable. Notifikasi prekey memakai inFlight stanza guard
dan finally menghapusnya ([messages-recv.ts:805–824](../src/Socket/messages-recv.ts#L805));
notification processing memiliki catch ke onUnexpectedError
([messages-recv.ts:1985–2009](../src/Socket/messages-recv.ts#L1985)). Jangan menyebut
semua storage rejection pada jalur prekey sebagai unhandled: sebagian sudah
di-catch/log. Jalur consumer async events berbeda.

### 6.3 Tujuh skenario Socket/storage

| # | Skenario | Penilaian |
|---|---|---|
| 1 | Disconnect saat saveCreds | end tidak mengetahui Promise subscriber; save dapat selesai setelah close atau gagal bila caller sudah close DB. Event removal tidak membatalkannya. |
| 2 | Proses berhenti saat Signal keys diubah | Mutation/batch beberapa records tidak durable transaction common store; RAM context/cache hilang, subset keys mungkin tersimpan. |
| 3 | PreKey storage unavailable | state.set rejection di-retry dan akhirnya diteruskan; creds update yang sudah dipancarkan tidak otomatis mundur. Helper init prekey catch/log lalu lanjut. |
| 4 | Reconnect saat tugas lama aktif | Socket baru mempunyai ev/guard/transaction queues baru; old task dan new socket dapat berbagi physical storage tanpa koordinasi. Example startSock() dipanggil tanpa await saat close, bukan setelah drain persistence. |
| 5 | Close saat storage pending | end handlers membersihkan caches/timers terpilih, bukan await seluruh get/set/save atau PreKeyManager queue. Completion end tidak berarti DB drain. |
| 6 | Rejection subscriber saveCreds tidak ditangani | EventBuffer memakai EventEmitter tanpa captureRejections; process() async listener await handler tanpa catch pada boundary emitter. Rejection dapat menjadi unhandled bila aplikasi tidak menangkapnya. Synchronous listener throw juga dapat menghentikan emitter/teardown. |
| 7 | Listener sesudah reconnect berulang | Socket membuat emitter baru dan end sukses memanggil ev.destroy, sehingga tidak ada bukti semua reconnect otomatis mengakumulasi listener. Leak mungkin jika end tidak mencapai destroy, manager/client lama diretain, atau aplikasi mendaftarkan saveCreds berulang pada emitter hidup. Perlu repeated lifecycle test. |

Bukti event boundary: [event-buffer.ts:74–89,164–172,197–202](../src/Utils/event-buffer.ts#L74).
process async handler tidak diserialisasi dengan invocation berikutnya; await
saveCreds di dalam handler hanya menunggu handler itu sendiri.
[Example/example.ts:71–103](../Example/example.ts#L71) memanggil startSock saat
connection close dan await saveCreds pada event lain tanpa shared drain gate.
Duplicate subscriber dapat menggandakan writes, tetapi contoh ini sendiri tidak
membuktikan listener didaftarkan dua kali pada socket yang sama.

### 6.4 Signal read errors, cache, dan teardown boundaries

- Signal cache Fase 13.1 menunggu storage set sukses sebelum update cache dan
  menginvalidasi cache keys saat rejection
  ([auth-utils.ts:86–114](../src/Utils/auth-utils.ts#L86)); ini perbaikan nyata.
  External migration/restore/second process tidak men-trigger invalidation.
  clear di luar cacheMutex dapat bersaing dengan get/set. Cache failure sendiri
  saat invalidasi berpotensi menutupi primary storage error; butuh custom-cache test.
- signalStorage.loadSession catch seluruh error baca/deserialisasi dan return
  null ([libsignal.ts:464–476](../src/Signal/libsignal.ts#L464)). Dengan demikian
  read-unavailable bisa terlihat seperti missing session pada lapisan ini.
  loadPreKey tidak mempunyai catch yang sama (514–524). Efek lanjut di dependency
  libsignal harus diuji fixture, bukan diasumsikan aman atau otomatis session reset.
- end handlers membersihkan internal caches pada
  [messages-send.ts:1335–1343](../src/Socket/messages-send.ts#L1335),
  [messages-recv.ts:2134–2144](../src/Socket/messages-recv.ts#L2134), dan
  [chats.ts:1466–1477](../src/Socket/chats.ts#L1466); caches supplied caller
  umumnya dijaga lewat config checks. Ini bukan dispose seluruh AuthStore.
- EventBuffer.destroy membersihkan dua tracked timers, buffer, dan listeners
  ([event-buffer.ts:240–260](../src/Utils/event-buffer.ts#L240)), tetapi delayed
  flush timeout pada 216–220 tidak disimpan; finally pending work pada 226–233
  juga bisa menjadwalkan timer setelah destroy karena tidak ada destroyed guard.
  Itu potensi late task/timer, bukan bukti seluruh cache bocor permanen.
- PreKeyManager queues tidak menyediakan drain/dispose; Neko writes map tidak
  menghapus settled entries per key. Default Signal repo.close hanya clear cache;
  in-flight operation dapat berjalan setelah cache clear. Besar retained memory
  dan timer lifetime perlu measurement, tidak otomatis diklasifikasikan data loss.

## 7. Testing Gap

### 7.1 Bukti test yang sudah ada

| Area | Test yang dibaca | Batasnya |
|---|---|---|
| Partial write/recovery | [compensating-recovery.test.ts:20–89](../src/__tests__/Utils/auth/compensating-recovery.test.ts#L20) | Test doubles dengan 0/40/41 writes, old values, verification read/mismatch, multiple rollback causes; tidak membunuh proses |
| Interrupted operation/retry | [migration-faults.test.ts:128–211](../src/__tests__/Utils/auth/migration-faults.test.ts#L128) | Held Promise/disconnect, snapshot addition, verify gate; “interrupted” tetap satu proses dengan RAM tersedia |
| Session independence | [migration-faults.test.ts:91–109](../src/__tests__/Utils/auth/migration-faults.test.ts#L91), [adapter-faults.test.ts:134–168](../src/__tests__/Utils/auth/adapter-faults.test.ts#L134) | Namespaces berbeda dan same-key ambiguous write dengan fake drivers; bukan same-session rollback conflict lintas proses |
| Disposal | [lifecycle.test.ts:5–39](../src/__tests__/Utils/auth-integration/lifecycle.test.ts#L5) | Multiple rejects, shared Promise, controlled pending yang akhirnya dilepas; tidak menguji forever hang atau late allocation race |
| Ownership init | [owned-resource.test.ts:6–52](../src/__tests__/Utils/auth/owned-resource.test.ts#L6), [stores.test.ts:40–102](../src/__tests__/Utils/auth-integration/stores.test.ts#L40) | Helper init failure, schema/connect/duck validation, receiver; belum menguji actual optional wrapper driver init/close exactly once sepanjang lifecycle |
| Cache persistence | [recovery-regressions.test.ts:26–47](../src/__tests__/Utils/auth/recovery-regressions.test.ts#L26) | Cache readback sesudah before/after persistence rejection; bukan external writer invalidation |
| Timeout test utility | [storage-faults.test.ts:55–74](../src/__tests__/Utils/auth/storage-faults.test.ts#L55) | Fake driver timeout; tidak membuktikan cleanup deadline atau pembatalan I/O |
| Socket reconnect | [reconnection-sync-skip.test.ts:9–84](../src/__tests__/binary/reconnection-sync-skip.test.ts#L9) | History-sync buffering dan end dasar; tidak menguji pending save/prekey/drain |

Pencarian pada tests saat audit tidak menemukan direct tests yang menyebut
addTransactionCapability, PreKeyManager, atau uploadPreKeys. auth-utils.test.ts
saat ini hanya menguji assertMeId; event-buffer.test.ts menguji pastParticipants,
bukan lifecycle destroy/async rejection. Ketiadaan direct-name matches bukan
bukti tidak ada indirect execution melalui socket tests. Belum ditemukan
subprocess crash-recovery test atau SIGKILL fixture untuk auth migration.

### 7.2 Rencana test tanpa implementasi

| Skenario | Jenis | Driver/fixture dan assertion minimum |
|---|---|---|
| Mati pada lima titik migrasi | Subprocess crash-recovery | Child dengan store file sintetis di private temp root; IPC barrier sebelum/selepas snapshot, write ke-40, verify, rollback. Parent terminate **hanya child** lalu restart reader; buktikan RAM snapshot hilang dan source tidak diubah. Jangan memakai session/DB asli. |
| Retry setelah restart | Subprocess + fault injection | Banding destination sebelum percobaan pertama, pasca-crash, dan pasca-retry; tunjukkan retry snapshot bukan original snapshot; candidate tidak auto-aktif. |
| Concurrent writer/rollback conflict | Deterministic unit/fault injection | Deferred barriers pada snapshot, external set, failure, recovery; pin interleaving old→copied→latest→old untuk membuktikan conflict; uji introduced key deletion dan rollback readback false confidence. |
| Dua migration session sama/berbeda | Deterministic + multiprocess terisolasi | Session sama konflik harus terdeteksi/ditolak sesuai desain; session berbeda tetap parallel dan sentinel intact; uji dua wrapper physical store sama. |
| Backup/restore live writer | Fault injection | Source additions/deletions/value changes antar enumerate/get; reader creds/keys bundle parsial; source version mismatch bila capability kelak ada. |
| Hanging disposer dan deadline | Unit fake timer + controlled promises | A sukses, B tertahan, C independent belum mulai; tanpa arbitrary sleep; kebijakan baru harus melaporkan still-running dan tidak close dependency secara prematur. Lepas B pada finally; timeout test tidak boleh menyisakan unhandled rejection. |
| Double/concurrent/repeated disposal | Unit | Promise identity sama, each close once, rejection replay, resource already closed, multiple errors berlabel, late completion setelah deadline; late resource allocation saat closing ditolak sebelum alokasi atau dibersihkan. |
| Ownership | Unit wrapper/module-loader doubles | Owned success close once; borrowed client tetap hidup; shared raw Redis close semantics eksplisit; init failure + close failure; close/connect hang dan retry timers; pending operations settle sebelum actual close. |
| Pending saveCreds/disconnect | Unit socket fixture | Deferred save, disconnect, end, reconnect; pastikan completion semantics jujur, error ditangkap aplikasi, old save tidak tertimpa stale new wrapper save tanpa detection. |
| PreKey storage failure | Deterministic socket/Signal fixture | Hold commit, emit counters, before/after-ack rejection, retry exhaustion; cek creds RAM/persisted dan stored key IDs secara sintetis tanpa mencetak key bytes; jangan mengubah algorithm untuk membuat test lolos. |
| Upload timeout/reconnect | Fake timers + controlled query/storage | Timeout menang, original task masih hidup, new call, release old task; hitung duplicate logical task, guard lifetime, timers sesudah end; verification tidak melabel cancel sukses palsu. |
| Listener/timer lifecycle | Unit repeated socket cycles | End handler throw/hang, sync consumer throw, async rejection ditangkap, destroy saat buffered task pending, raw ws waiters; hitung owned listeners/timers tanpa menghapus listeners caller secara global. |
| Backend concurrency/durability | Real integration **nanti** | Dua proses ke SQLite private file, Redis dedicated instance/prefix, Mongo dedicated indexed/non-indexed collection, Neko private collection; disconnect/ack ambiguity, cache freshness, rollback, commit topology. Infrastructure absent = NOT RUN, bukan passed. |

Unit test dapat membuktikan orchestration dan conflict interleaving, subprocess
test file dapat membuktikan perilaku process kill untuk file fixture, sedangkan
power loss durability dan server replication memerlukan pengujian backend khusus.
Jangan menyamakan keempat jenis bukti tersebut. Semua test baru di tabel masih
rencana, tidak ditambahkan/dijalankan pada audit ini.

## 8. Risk Classification

P0: risiko serius data/session yang **dapat direproduksi**; P1: consistency/recovery
berdampak nyata; P2: lifecycle/maintainability/observability; P3: optimasi/docs.
Tidak ada reproduksi baru data/session corruption di audit-only ini sehingga
**tidak ada P0 baru yang diklaim**. Priority berikut menilai boundary source,
bukan menuduh exploit server atau memprediksi pairing ulang secara pasti.

| ID | Rank | Temuan dan trigger | Evidence / batas |
|---|---|---|---|
| L1 | P1 | Crash menghapus recovery snapshot; partial destination tidak dapat dikenali otomatis | RAM-only snapshot/helper dan loader tanpa marker; five-point crash matrix adalah analisis, bukan kill test |
| L2 | P1 | Rollback stale snapshot menimpa writer lain atau migration lain | Unconditional set/remove; interleaving source memungkinkan; belum ada direct regression same-session conflict |
| L3 | P1 | Creds/prekey commit terpisah; counter update sebelum key commit, save failure/pending tidak ditunggu | Urutan source jelas; dampak protocol/session nyata belum direproduksi |
| L4 | P1 | File read error dianggap absent dan Signal session read error dianggap missing | catch-all pada raw file/readSession; dapat menyesatkan snapshot/recovery atau consumer, perlu error-vs-missing reproducer sebelum fix |
| L5 | P2 | Hang satu disposer/end-handler/init-close menahan resource lain dan original failure | Serial await tanpa deadline/drain/status label; source menunjukkan hang propagation |
| L6 | P2 | Successful owned wrappers tidak memberi close; raw Redis explicit close menutup shared client; raw closes tidak close-once | Allocation/return/quit/callback source; tidak ada implicit client takeover pada socket end |
| L7 | P2 | end caller kedua tidak menunggu completion; close throw/sync listener throw bisa melewati destroy; DB pending tetap berjalan | Socket guard/await/emit order; default signal close hanya clear cache, bukan failure yang sudah terjadi |
| L8 | P2 | Upload race timeout melepas guard sebelum pekerjaan asli berakhir; timers/task bisa survive end | Promise.race/finally source; overlap effect memerlukan deterministic prekey test, dapat dinaikkan ke P1 bila consistency failure terukur |
| L9 | P2 | Builder allocation-vs-disposal race dan aggregate tanpa resource IDs | await sebelum alokasi/track, registry sudah closing; belum ada concurrent init regression |
| L10 | P2 | Local locks/cache dipahami terlalu luas sebagai cross-process transaction | Per wrapper queues/mutex, clear/read/write bypass, Mongo/Neko uniqueness tidak dijamin factory; driver semantics belum diuji |
| L11 | P3 | Retained write maps/fileLocks dan late timers perlu measurement | Map/timer lifetime source, bukan bukti permanent leak atau besaran RAM tertentu |

## 9. Proposed Fase 13.6

Urutan berikut memisahkan perbaikan kecil dari perubahan auth/protokol yang
memerlukan review khusus. Semua file di bawah **rencana**, tidak diubah di Fase
13.5. Pertahankan format sesi/backup, optional deps, CJS/ESM/declarations dan
Node >=20; jangan menambahkan global locks atau application lifecycle takeover.

### Pekerjaan 1 — Reproducer dan kontrak maintenance session

- **Alasan:** L1/L2/L4/L10; buktikan same-session conflict, IO error masquerading
  missing, dan perbedaan process kill dengan Promise rejection.
- **File:** `src/__tests__/TestUtils/storage-faults.ts`,
  `src/__tests__/Utils/auth/compensating-recovery.test.ts`,
  `migration-faults.test.ts`, `backup-faults.test.ts`; kandidat baru
  `src/__tests__/Utils/auth/crash-recovery.test.ts` dan subprocess fixture
  test-only di folder auth. `docs/auth-stores.md` untuk workflow offline candidate.
- **Kompatibilitas:** test/docs dahulu; gate IPC tidak masuk runtime. Jangan
  memperketat opaque serialization menjadi mandatory Signal schema tanpa desain.
- **Test/kriteria:** matrix crash, retry dan concurrent rollback terukur; no
  fixtures/session asli; source/sentinel intact. Missing-vs-error adapter fix
  baru disiapkan sesudah reproducer dan analisis compatibility catch-all.

### Pekerjaan 2 — Cleanup status dan admission internal harness

- **Alasan:** L5/L9; registry sudah cukup sebagai fondasi internal, tidak perlu
  generic public shutdown API.
- **File:** `src/__tests__/Utils/auth-integration/lifecycle.ts`, `stores.ts`,
  `lifecycle.test.ts`, `stores.test.ts`, `suite.ts`, migration integration teardown.
- **Desain minimum:** resource IDs non-sensitif dan admission closed sebelum
  builder alokasi; track pending initialization atau immediate unwind jika
  closing dimulai. Pertahankan shared Promise, aggregate causes, dan dependency
  order. Pisahkan reporting deadline dari actual completion sebelum menentukan
  apakah independent cleanup dapat dilanjutkan.
- **Kompatibilitas:** test-only; jangan menghapus namespace ketika DB/writer belum
  closed. Deadline tidak melabel still-running sebagai berhasil; existing
  Promise<void> bisa tetap reject aggregate dengan metadata internal.
- **Test/kriteria:** concurrent builder/dispose tanpa unregistered allocation;
  A/B-hang/C, late settle, already-closed, double/concurrent call dan multiple
  labeled errors; semua eligible independent entries dicoba sesuai kebijakan.

### Pekerjaan 3 — Ownership successful wrappers secara additive

- **Alasan:** L6; library-owned DB memerlukan jalur penutupan yang dapat dipakai,
  sedangkan borrowed client tidak boleh ikut ditutup otomatis.
- **File:** `src/Utils/auth-store.ts`, `src/Utils/auth/owned-resource.ts`,
  `src/Types/Auth.ts` hanya jika tipe additive disetujui, test owned-resource
  dan wrapper baru, `docs/auth-stores.md`, README. Jangan ubah Neko ownership.
- **Desain:** pilih managed result tambahan **atau** managed opt-in entrypoint,
  bukan keduanya sekaligus. Memoize close Promise, stop new owned operations,
  await tracked work, lalu invoke owned close tepat sekali; jelaskan perilaku
  close hang/error tanpa force-destroy default.
- **Kompatibilitas:** state/saveCreds signature existing tetap bekerja;
  Object.keys/return-shape tests, CJS/ESM import dan declarations wajib. Redis
  raw close tetap mempertahankan perilaku lama; opsi borrowed tidak boleh
  mengubah default diam-diam. Tidak membuat process signal handlers/global timers.
- **Test/kriteria:** owned success/failure, borrowed/shared client, all causes,
  exactly-once double/concurrent close, pending IO drain, operations after closing.

### Pekerjaan 4 — Socket end completion dan persistence boundary

- **Alasan:** L3/L5/L7; completion socket dan completion storage harus dibedakan.
- **File:** `src/Socket/socket.ts`, `src/Utils/event-buffer.ts` bila timer/destroy
  guard diperlukan, `src/__tests__/binary/` untuk fixture lifecycle baru,
  `src/__tests__/Utils/event-buffer.test.ts`, `Example/example.ts`, auth docs.
- **Desain minimum:** satu end completion task; try/finally memastikan cleanup
  berikut tetap dicoba sesudah failure yang settle. Pertahankan original causes
  dan safe logging. Explicit application-owned save/drain pattern untuk reconnect;
  jangan menganggap EventEmitter await subscriber. Owned timer handles dibersihkan,
  late buffered task tidak menjadwalkan work sesudah destroy.
- **Kompatibilitas:** review close-event ordering, reentrant end handler, dan
  listener yang memulai reconnect; naive shared end Promise bisa deadlock jika
  end handler await end-nya sendiri. Jangan global remove listener pengguna atau
  auto-close store yang tidak dimiliki socket. Hang policy masih perlu status jujur.
- **Test/kriteria:** pending save/end/reconnect, sync listener throw, throwing/hang
  end hook, concurrent and reentrant end, query waiters, destroyed buffer late
  completion; tidak ada klaim durability dari event connection open.

### Pekerjaan 5 — PreKey task lifetime dan failure ordering, review auth khusus

- **Alasan:** L3/L8/L4; commit, credentials event, timeout, retry, dan reconnect
  perlu diuji bersama sebelum perubahan ordering.
- **File:** `src/Socket/socket.ts`, `src/Utils/auth-utils.ts`,
  `src/Utils/pre-key-manager.ts`, `src/Utils/signal.ts` hanya bila diperlukan;
  `src/Signal/libsignal.ts` untuk read-error contract **hanya** setelah review;
  test baru binary/Utils yang menyuntik controlled keys/query dan fake timers.
- **Desain awal:** simpan/clear owned timer; jangan melepaskan in-flight guard
  hanya karena caller timeout jika underlying work hidup; tetapkan bagaimana
  cancel/settle saat socket close tanpa membatalkan persistence setengah jalan.
  Pindahkan/koordinasikan counter notification dengan commit hanya jika invariant
  confirmed; itu tetap tidak membuat saveCreds durable atomic dengan keys.
- **Kompatibilitas:** jangan mengubah Signal algorithm/prekey derivation,
  menebak server acknowledgement, menghapus keys agar retry lolos, atau memaksa
  pairing. Perubahan dependency/upstream protocol dipisahkan dari storage PR.
- **Test/kriteria:** before/after commit failure, counters RAM/persisted, retry
  exhaustion, 30s timeout winner, task late settle, reconnect baru, no key payload
  logs, all fake timers released; no background task yang disalahlabel cancel.

### Pekerjaan 6 — Durable resume hanya bila kebutuhan terkonfirmasi

- **Alasan:** L1 belum tertutup oleh lifecycle fixes; kebutuhan otomatis vs
  operational offline recovery harus diputuskan setelah reproducer.
- **File kandidat:** `migration-manager.ts`, `record-recovery.ts`,
  `backup-manager.ts`, caller-supplied recovery metadata module **jika disetujui**,
  subprocess crash tests dan docs recovery.
- **Desain/risiko:** marker/journal opt-in di luar auth keyspace, source fingerprint,
  durability order dan conservative incomplete gate. Journal menyimpan sensitive
  old values sehingga permission/encryption/retention termasuk desain; disk lokal
  Termux/container ephemeral bukan durable journal universal. Tidak ada automatic
  destructive clear/rollback pada active namespace.
- **Kriteria:** restart pada setiap persistence boundary tidak menghasilkan
  false-complete; missing/corrupt/stale journal gagal dengan aman dan recovery
  manual terjelaskan. Cross-process ownership perlu fencing/version backend
  tertentu; common interface tidak boleh mengklaim jaminan yang tidak dimiliki.

Untuk fase implementasi nanti, jalankan focused failing-before/passing-after
regressions, full Jest, tsc/lint, build CJS/ESM, smoke/declarations, docs dan pack
secara berurutan ketika lib disentuh. Pakai dataset sintetis terbatas, tidak
memuat seluruh DB bila hanya touched records dibutuhkan. Ukur RAM/latency sebelum
memilih journal streaming/transaction batch. Termux/Android menjaga native driver
optional; VPS/Docker/Pterodactyl perlu persistent volume dan termination budget
yang jelas, bukan janji bahwa SIGKILL dapat menjalankan finally.

## 10. Remaining Unknowns

1. Durability actual acknowledged writes, busy/conflict behavior SQLite, Redis
   persistence/replication dan reconnect retries, Mongo topology/unique indexes/
   write concern, serta Neko caching/constructor/close/opaque insert semantics.
2. Efek process kill vs server crash/power loss; tidak ada crash experiment baru.
   Disk journal, file rename dan flush semantics belum diuji di deployment target.
3. Dampak prekey counter/key mismatch terhadap sesi/server nyata, dependency
   libsignal setelah read failure dianggap missing, dan apakah overlap upload
   menimbulkan observable duplicate/missing bundle. Tidak ada server claim baru.
4. Batas close tepat sekali/idempotency/cancellation driver dan apakah isOpen false
   berarti semua reconnect jobs/timers selesai. Close collection Neko tidak sama
   dengan drop container; kemampuan drop belum divalidasi.
5. Besaran retained maps/cache timers, lock contention/performance pada workload
   Android/Termux rendah RAM dan server multiprocess. Source memungkinkan risiko,
   tetapi tidak menyediakan angka atau bukti leak permanen.
6. Ada tidaknya aplikasi downstream yang memakai full return-shape equality,
   shared Redis close semantics, custom SignalRepository async close, atau async
   progress callback. Perubahan additive masih memerlukan compatibility tests.

### Validasi audit-only

Deliverable hanya file ini dan satu tautan di docs/index.md. Validasi wajib:
`npm run check:docs`, whitespace check, local-link/source-line verification, dan
diff source/tests/dependencies kosong. Script check:docs sendiri hanya memeriksa
versi README/CHANGELOG ([check-doc-sync.js:5–29](../scripts/check-doc-sync.js#L5));
kelulusannya bukan bukti concurrency/crash safety. Tidak ada commit, push, merge,
publish, tag, atau perubahan identity dalam Fase 13.5.

Hasil pemeriksaan:

- `npm run check:docs`: exit 0, dokumentasi versi sinkron.
- `git diff --check`: lulus; whitespace file baru diperiksa terpisah karena
  masih untracked, tanpa staging.
- Seluruh 70 local links menunjuk file yang ada; source-line anchors dan rentang
  yang diperiksa tidak melampaui panjang file. Isi temuan diverifikasi dengan
  pembacaan source; keberadaan link saja tidak dipakai membuktikan semantik.
- Diff `src/`, `scripts/`, `package.json`, dan `yarn.lock` kosong. Status akhir
  hanya `docs/index.md` modified dan laporan ini untracked.
- HEAD tetap `a1b5c66814e26875f19195df1e848c070890a7eb`; tidak ada unit/integration
  tests atau eksperimen kill yang dijalankan pada fase ini.
