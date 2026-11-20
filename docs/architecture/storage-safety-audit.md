# Storage Safety & Data Consistency Audit — Fase 13.3

[Indeks dokumentasi](../index.md) · [Auth Store](../auth-stores.md) · [Harness integrasi](../testing/auth-store-integration.md)

**Status: audit dan rencana implementasi; belum ada perbaikan produksi atau test.**
Audit source lokal pada 2026-11-20, project `@vanzzz/furina-baileys`, branch
`feat/reliability-audit`, HEAD `48c58b5915c37672330104248d4a33961ddba2fe`.
Working tree awal bersih. Commit `48c58b5` (harness Fase 13.2) dan
`2c29ab671ae9c449fa0f4aa955b6608dc9897774` (storage recovery sebelumnya)
ditinjau bersama source saat ini. Acuan: [AGENTS.md](../../AGENTS.md),
[AI policy](../../CODE_OF_CONDUCT.md#ai-policy), dan [SECURITY.md](../../SECURITY.md).

Nomor baris di bawah mengacu pada HEAD tersebut. Bukti adalah pembacaan source,
konfigurasi, dan test yang sudah ada; test yang dikutip tidak dijalankan ulang
dalam audit ini. **Jumlah integrasi backend nyata yang dijalankan: 0.** Tidak
ada instalasi driver/service, akses `.env`/kredensial produksi, atau koneksi DB.
Hasil Fase 13.2 sebelumnya tidak dianggap membuktikan backend nyata.

## Executive Summary

Kontrak `AuthStore` cukup untuk menyalin dan membandingkan record, tetapi tidak
menyediakan transaksi, snapshot konsisten, identitas storage, compare-and-swap,
promosi namespace, atau penanda migrasi. Karena itu reliabilitas saat gagal
bergantung pada langkah operasi dan disiplin pemanggil. Penyelesaian Promise
bukan bukti bahwa satu sesi lengkap dapat diaktifkan dengan aman.

Temuan utama:

1. Semua lima adapter `setMany()` menulis berurutan tanpa transaksi batch yang
   dikelola adapter. Kegagalan di tengah dapat meninggalkan campuran data lama
   dan baru. `migrateAuthState()` melewati rollback pada exception penulisan
   **dan** exception pembacaan verifikasi; rollback hanya untuk mismatch nilai.
2. `importAuthState()` memvalidasi envelope, lalu menulis creds sebelum keys,
   tanpa verifikasi hasil atau rollback. Restore gagal dapat menyisakan creds
   baru dengan keys sebagian/lama. Tidak ada penanda yang mencegah pembukaan
   destination tersebut setelah restart.
3. SQLite menyisipkan nama tabel mentah pada tujuh titik SQL. Batas input yang
   ditemukan adalah konfigurasi aplikasi/pemanggil factory, bukan input jaringan.
   Ada risiko sintaks dan interpretasi identifier; eksploitasi SQL injection
   melalui driver `better-sqlite3` **belum dibuktikan**.
4. Harness memiliki celah yang menghalangi klaim isolasi/lifecycle: readiness
   Redis/NekoDB mengabaikan hasil driver pada jalur konfigurasi lengkap; cleanup
   tidak selalu memakai namespace penulisan; migration suites tanpa teardown;
   nama tabel SQLite berbeda antara pembuatan dan pemakaian; beberapa handle
   tidak terdaftar atau didaftarkan terlalu lambat.

Rekomendasi terkecil: benahi guard/ownership harness, tetapkan kontrak migrasi
non-atomic beserta prosedur recovery, lalu perluas rollback best-effort dengan
penyimpanan penyebab error. Identifier SQLite perlu penanganan konsisten dengan
keputusan kompatibilitas eksplisit. Staging, manifest, dan transaksi lintas
backend bukan prasyarat untuk perbaikan awal dan tidak diimplementasikan di sini.

## SQLite Identifier Safety

### Input dan jalur SQL

Sumber: [auth-store.ts](../../src/Utils/auth-store.ts),
[AuthStateOptions](../../src/Types/Auth.ts), dan
[contoh konfigurasi](../auth-stores.md#sqlite).

| Jalur | Baris `auth-store.ts` | Perilaku |
|---|---:|---|
| `createSQLiteAuthStore(db, table)` | 178 | String caller, default `furina_auth`; caller menyediakan DB dan schema |
| `get()` / `getMany()` | 180 | `SELECT value FROM ` + table + ` WHERE key = ?` |
| `set()` | 198 | `INSERT OR REPLACE INTO ` + table; key/value dibind |
| `setMany()` | 202 | SQL insert yang sama, diulang per record |
| `remove()` | 206 | `DELETE FROM ` + table + ` WHERE key = ?` |
| `keys()` | 209 | `SELECT key FROM ` + table |
| `clear()` | 211 | `DELETE FROM ` + table |
| `useSQLiteAuthState()` | 222, 225–228 | `options.table` → schema `CREATE TABLE IF NOT EXISTS` pada 226 → factory dengan string yang sama |

Tidak ada quoting, escaping, atau validasi nama tabel. String yang sama dipakai
di seluruh jalur produksi, tetapi konteks grammar SQL tiap operasi berbeda.
Parameter `?` melindungi nilai key/value; parameter tersebut tidak melindungi
identifier. Backup/migrasi menerima store yang sudah dibuat, sehingga memakai
konfigurasi tabel store itu; tidak memilih tabel lain secara independen.

`AuthStateOptions.table?: string` pada `Types/Auth.ts:159–160` tidak menetapkan
grammar identifier. Library menerima string dan menyerahkan interpretasinya
kepada SQL parser. Tidak benar menyebut regex tertentu sebagai kontrak saat ini.

### Nama tabel, risiko, dan batas bukti

| Bentuk input | Interpretasi yang perlu dipertimbangkan |
|---|---|
| `furina_auth`, `auth`, `t_123` | Identifier biasa; contoh/default SQLite terdokumentasi aman secara sintaks |
| `auth-db`, `furina:auth`, spasi, tanda kutip tidak berpasangan | Dapat menjadi token/operator/parameter atau sintaks tidak valid |
| `main.furina_auth` / schema-qualified name | Dapat menunjuk schema dan tabel, bukan satu nama literal bertitik |
| `"auth-db"` atau identifier yang sudah di-quote | Dapat menjadi konfigurasi valid saat disisipkan mentah |
| Fragmen SQL, komentar, delimiter | Masuk ke grammar SQL; hasil bergantung statement dan aturan `prepare()` driver |

Default Redis `table: 'furina:auth'` adalah **prefix**, bukan konvensi nama tabel
SQLite. Opsi yang bernama sama tidak menjamin dapat dipindahkan mentah antarbackend.
MongoDB juga memakai `table` sebagai nama collection (`auth-store.ts:272`).

Tidak ditemukan jalur in-tree yang mengambil nama tabel dari pesan WhatsApp atau
request remote. Pemanggil dapat memasok string dari konfigurasi eksternal, tetapi
trust boundary tersebut milik aplikasi dan belum dibuktikan dalam repo.
Identifier mentah dapat menyebabkan kegagalan inisialisasi, pembacaan/penulisan
ke schema yang tidak dimaksud, atau cleanup gagal. Pemilihan tabel lain yang valid
juga tidak dicegah; quoting tidak menjadi mekanisme otorisasi tabel.

**Koreksi inspeksi sebelumnya:** probe `node:sqlite` memakai tabel sentinel kosong
dan memperoleh `COUNT(*) = 0` setelah operasi. Itu tidak membuktikan baris/tabel
dihapus; SELECT yang berhasil justru berarti tabel masih ada. `node:sqlite` juga
bukan driver adapter ini. Tidak ada bukti eksekusi stacked statement atau DROP
melalui `better-sqlite3`, dan laporan ini tidak mengklaimnya.

### Alternatif dan rekomendasi minimal

| Pendekatan | Manfaat | Kompatibilitas / keterbatasan |
|---|---|---|
| Regex ketat untuk bare identifier | Fail-fast dan mudah diaudit | Dapat menolak nama Unicode, quoted identifier, dan schema-qualified name yang valid sekarang; jangan diberlakukan diam-diam |
| Quote satu identifier dengan `"`, gandakan `"` internal | Satu nama literal tidak menjadi grammar SQL; mendukung spasi/punctuation | `main.auth` berubah dari schema/table menjadi nama literal bertitik; input yang sudah di-quote berubah makna |
| Escaping konsisten | Diperlukan pada schema dan seluruh query | Escaping tanda kutip saja tanpa membungkus identifier tidak cukup; jangan sanitasi menjadi nama lain karena bisa collision |
| Validasi kompatibel dengan grammar terdokumentasi | Error jelas, batas konfigurasi eksplisit | Harus memilih semantik literal vs qualified; parser SQL ad hoc akan menambah kompleksitas |

Rekomendasi: satu kebijakan identifier internal untuk pembuatan schema dan semua
query; literal quoting adalah pilihan utama untuk **kontrak nama literal**,
dengan penolakan input tidak representable seperti NUL. Sebelum implementasi,
tetapkan bagaimana mempertahankan atau menolak secara eksplisit konfigurasi
qualified/already-quoted; jangan mengklaim quoting otomatis sepenuhnya kompatibel.
Jika dukungan qualified diperlukan, definisikan komponen schema/table secara
terpisah dan quote masing-masing, tanpa menerima fragmen SQL bebas. Tidak perlu
mengubah signature factory, dependency, atau mekanisme CJS/ESM untuk nama biasa.

## Migration Consistency

### Batas kontrak dan matriks backend

[AuthStore](../../src/Types/Auth.ts) baris 123–149 hanya menyediakan operasi record
dan `close?()`. `setMany()` berarti menulis banyak record; tidak menjanjikan
atomicity. Factory SQLite dapat menerima koneksi yang ditransaksikan caller,
tetapi adapter sendiri tidak memulai transaksi.

Untuk skenario 100 record: bila 40 operasi selesai lalu operasi 41 gagal sebelum
persist, destination memuat 40 nilai baru; key sisanya mempertahankan nilai lama
atau tetap tidak ada. Jika error terjadi setelah persist/ack hilang, record 41
juga mungkin tersimpan. Ini konsekuensi urutan source, bukan observasi backend nyata.

| Backend | Implementasi `setMany()` | Batch atomic oleh adapter? | Kondisi kegagalan / recovery |
|---|---|---|---|
| File | `auth-store.ts:150–154`, loop `writeFile` | Tidak | File terdahulu sudah ditulis; file yang gagal bisa terpotong/parsial; tidak ada multi-file commit atau durable journal |
| SQLite | `auth-store.ts:200–204`, loop `INSERT OR REPLACE` | Tidak | Statement terdahulu dapat bertahan; transaksi eksternal caller adalah kondisi terpisah; tidak ada rollback batch internal |
| Redis | `auth-store.ts:297–301`, loop `await client.set` | Tidak | Key terdahulu dapat bertahan; timeout/disconnect tidak selalu memastikan apakah SET terakhir diterapkan |
| MongoDB | `auth-store.ts:247–251`, loop `replaceOne(... upsert)` | Tidak | Dokumen terdahulu dapat bertahan; tidak ada client session/transaction dalam interface adapter |
| NekoDB | `nekodb-auth.ts:157–175,223–227`, loop search → insert/update | Tidak | Record terdahulu dapat bertahan; antrean per key hanya per instance store, bukan transaksi atau lock antarproses |

MongoDB didukung produksi dan relevan dalam matriks, meskipun harness Fase 13.2
tidak mempunyai suite MongoDB. Per-record durability, retry driver, caching, dan
acknowledgement nyata belum diuji. NekoDB dapat mengalami duplikasi lintas
instance/proses saat search dan insert bersaing; antrean lokal tidak mencegahnya.

### Jalur migrasi dan error

[migration-manager.ts](../../src/Utils/auth/migration-manager.ts):

1. Menolak hanya object store yang sama (39–41), lalu `keys()` dan `getMany()`
   source (45–50). Dua object berbeda bisa menunjuk storage yang sama.
2. Membaca snapshot destination untuk key yang akan disentuh (57). Ini bukan
   snapshot transaksional; error baca menghentikan migrasi sebelum penulisan.
3. Memanggil **satu** `setMany(record)` (61). Rejection keluar langsung tanpa
   rollback atau penambahan konteks migrasi.
4. Dengan `verify: true`, membaca ulang destination (70), membandingkan string
   (71). Rejection baca juga keluar langsung tanpa rollback.
5. Hanya mismatch hasil yang masuk loop rollback (87–100). Nilai lama di-set
   kembali; key yang sebelumnya tidak ada di-remove. Satu error rollback
   menghentikan loop, sehingga sisa key tidak dicoba.
6. Boom 500 (108) menyebut jumlah mismatch dan maksimal lima nama record.
   Penyebab rollback dijadikan string; object error asal tidak dipertahankan
   dalam struktur hasil. Nama record dapat membawa identitas session/JID;
   jangan mencetak pesan/error driver mentah sebagai log publik.

Opsi `rollback` memang didokumentasikan pada baris 21 sebagai rollback saat
**verification fails**; header modul lebih luas. Exception saat write/verify
belum tercakup. `onProgress` adalah callback sinkron tanpa guard: callback yang
melempar pada tahap verify/rollback/done dapat menghentikan recovery atau membuat
caller menerima error setelah data sebenarnya sudah tertulis. Tahap `rollback`
bahkan dipancarkan saat `rollback: false`; progres bukan bukti pemulihan berhasil.

Test [migration-faults.test.ts](../../src/__tests__/Utils/auth/migration-faults.test.ts)
baris 33–69 sudah mengkarakterisasi write rejection dan verification-read error;
baris 113–124 membuktikan lewat mock bahwa serialized string rusak tetap disalin.
Ini bukti test yang tersedia, bukan hasil eksekusi audit atau backend nyata.

### Jawaban 12 pertanyaan recovery

| # | Pertanyaan | Hasil audit |
|---|---|---|
| 1 | Apakah source dimodifikasi? | Fungsi hanya membaca source. Jaminan pemisahan fisik bergantung caller; object-identity guard tidak mendeteksi dua wrapper atas storage sama. |
| 2 | Apakah existing destination ditimpa? | Ya, key yang cocok ditulis ulang; key target-only tetap ada. |
| 3 | Jika batch parsial? | Partial destination dipertahankan saat setMany reject; verifikasi dan rollback tidak berjalan. |
| 4 | Apakah retry menimpa data lama? | Ya. Snapshot retry memuat keadaan setelah percobaan sebelumnya, bukan otomatis keadaan sebelum migrasi pertama. |
| 5 | Idempotent? | Overwrite record source yang tetap dapat konvergen pada key/value sama jika akses eksklusif dan adapter stabil. Bukan jaminan byte-identical physical store, tidak menjamin NekoDB bebas duplikasi lintas instance, dan source yang berubah bukan retry identik. |
| 6 | Interupsi terdeteksi? | Error runtime diteruskan bila proses hidup. Setelah crash tidak ada manifest/marker persisten yang membedakan selesai dan terputus. |
| 7 | Partial keys terlihat sebagai sesi lengkap? | Bisa. `makeAuthStateFromStore` (`auth-store.ts:69–91`) memuat creds tanpa pemeriksaan kelengkapan sesi; missing key menjadi null. Tidak ada gate migrasi. Kerusakan protokol tertentu belum direproduksi. |
| 8 | Apa yang diverifikasi? | Missing dan mismatched raw string pada record source. Bukan validasi JSON/AuthenticationCreds/Signal schema, bukan snapshot lintas waktu; extra keys tidak dianggap mismatch. |
| 9 | Apakah rollback memulihkan destination lama? | Pada mismatch, dicoba restore snapshot touched keys dan remove introduced keys. Target-only keys tetap ada. Tidak atomic; concurrent writes dapat tertimpa, false return remove tidak diperiksa, hasil rollback tidak diverifikasi. |
| 10 | Rollback gagal? | Loop berhenti pada error pertama; destination bisa campuran. Boom menyertakan string error, bukan semua original causes atau daftar sisa key. |
| 11 | Resume aman? | Tidak ada resume token/checkpoint. Ulang seluruh migrasi dari source stabil ke destination terpisah dengan akses eksklusif, lalu verifikasi; rollback ke keadaan awal memerlukan backup awal destination. |
| 12 | Error cukup deskriptif? | Mismatch punya jumlah/key/Boom 500, same-object punya 400. Write/read error mentah tidak menyebut fase/keadaan recovery; rollback error kehilangan struktur; callback error ambigu. Tidak ada completion evidence persisten. |

### Backup dan restore

[backup-manager.ts](../../src/Utils/auth/backup-manager.ts): export membaca
`getMany(await keys())` (112), menyimpan seluruh record dan envelope di memori,
lalu `gzipSync` (135–137). Tidak ada snapshot lock; live writes dapat menghasilkan
backup lintas waktu. Memory mencakup string, object, JSON, buffer, dan hasil gzip;
peak dapat beberapa kali ukuran record dan kompresi/dekompresi memblokir event loop.
Tidak ada batas ukuran keluaran dekompresi yang ditetapkan fungsi.

Import memvalidasi gzip, JSON envelope, versi, object keys, dan tipe string
(45–104). Isi setiap string **tidak di-parse sebagai record auth** meskipun pesan
error menyebut string JSON. Import kemudian menulis creds (167) dan keys (170),
tanpa snapshot tujuan, verifikasi, rollback, atau completion marker. Target-only
records dibiarkan; anjuran `clear()` di komentar bukan operasi atomic dan dapat
menghilangkan satu-satunya salinan destination sebelum restore berhasil.

Backup lintas backend berupa `Buffer`; tidak memerlukan shared media bawaan.
Buffer harus ditransfer caller bila lintas proses/host. Klaim shared media sebagai
syarat dalam dokumen harness Fase 13.2 terlalu kuat. Demikian pula, memory limit
bukan otomatis disetel oleh script `test:integration` saat ini.

### Perbandingan arsitektur recovery

| Opsi | Backend dan jaminan | Failure mode / risiko sesi | Overhead, kompleksitas, kompatibilitas |
|---|---|---|---|
| A. Best-effort rollback | Dapat memakai common interface semua backend; memulihkan snapshot saat proses masih hidup dan backend menerima operasi | Rollback bisa gagal/crash; snapshot tanpa lock dan rollback bisa menimpa live writes; tidak menjamin atomicity/durability | O(total record bytes + previous touched values) di memori, tambahan read/write; perubahan kecil, mempertahankan bentuk API; perlu menjaga primary cause dan semua recovery causes |
| B. Staging namespace + promotion | Bisa menulis staging pada namespace terpisah; promosi atomic perlu pointer/swap khusus backend dan reader yang mengikutinya | Crash sebelum promosi meninggalkan staging; promosi multi-step atau reader lama tetap tidak aman; writer lama bisa melanjutkan ke namespace lama | Tambahan storage sekitar satu salinan dan metadata; kompleksitas tinggi; format/routing reader berubah, cleanup staging dan rollback pointer perlu desain tersendiri |
| C. Backend transactions | SQLite/MongoDB/Redis harus dievaluasi terhadap driver, deployment, command, dan transaction API aktual; file/Neko interface saat ini tidak menyediakannya | Source dan destination beda backend tetap bukan satu transaksi; timeout/commit tidak diketahui; transaksi Redis tidak boleh diasumsikan identik rollback DB relasional | Tambahan lock/journal/session, batas ukuran/waktu; perubahan capability interface berisiko custom store; Mongo topology dan native SQLite/Termux perlu verifikasi; bukan minimum lintas backend |
| D. Manifest + completion marker | Semua backend dapat menyimpan metadata tetapi reader harus menghormatinya; membantu deteksi, bukan atomicity | Marker selesai harus sesudah verifikasi dan durable ordering; crash/metadata hilang atau reader lama mengabaikan marker; resume butuh source identity/hash stabil | Metadata O(key count) jika ada checkpoint, staging/backup dapat lebih besar; reserved keys dan backup enumeration berpotensi bentrok; kompleksitas menengah/tinggi |
| E. Kontrak non-atomic + recovery guidance | Semua backend/custom stores; jujur menjelaskan fail-stop, source retention, destination terpisah, exclusive access | Tidak otomatis mencegah aktivasi partial session; disiplin caller diperlukan, tidak ada crash resume | Hampir tanpa overhead runtime; paling kompatibel dan kecil; perlu contoh offline cutover, backup destination awal, larangan clear source sebelum validasi |

**Pilihan minimum: E + A yang diperbaiki secara terbatas.** Bekukan writer source
dan destination (termasuk saveCreds/Signal writes), simpan backup destination bila
harus memulihkan keadaan awal, migrasikan ke namespace terpisah, verifikasi semua
record yang diharapkan, lalu lakukan cutover aplikasi secara eksplisit. Jangan
aktifkan destination bila migrasi/restore reject; jangan hapus source sebagai
bagian recovery otomatis. Retry memakai snapshot/source stabil; jangan melakukan
`clear()` pada storage aktif atau satu-satunya salinan yang tersisa.

Common interface dapat memberi pelaporan fase, perbandingan bytes, percobaan
rollback semua touched keys, dan original causes. Ia tidak bisa menjamin atomic
snapshot, crash recovery, fencing writer, physical-store identity, durability,
atau atomic promotion. Transaksi dan manifest ditunda sampai kebutuhan terukur.

## Resource Lifecycle

### Peta ownership dan cleanup

| Resource | Pencipta/pemilik | Cleanup yang tersedia | Celah |
|---|---|---|---|
| SQLite raw production | Caller membuka DB; factory menerima `prepare()` | Caller menutup DB; store tidak punya close | Sesuai kontrak factory, tetapi wrapper internal membuka handle yang tidak dapat diambil caller |
| SQLite state wrapper | `useSQLiteAuthState`, `auth-store.ts:225–228` | Tidak ada handle/close dalam `{ state, saveCreds }` | Handle tidak ditutup pada error schema/load maupun lewat API wrapper |
| Redis/Mongo state wrapper | Wrapper connect lalu make state | Raw store mempunyai close; wrapper hanya mengembalikan state/saveCreds | Tidak ada jalur close dari hasil wrapper; load creds gagal sesudah connect tidak dibersihkan |
| NekoDB production | Caller menyediakan initialized client | Caller close; store tidak mengklaim ownership | Benar untuk borrowed client; antrean writes tidak menyediakan drain publik |
| Harness raw SQLite | `stores.ts:148–152` | `track(db.close)` | Track setelah CREATE; kegagalan CREATE bisa membocorkan handle |
| Harness SQLite state | `stores.ts:181–185` | Tidak terdaftar dalam handles | Penghapusan directory tidak sama dengan menutup DB |
| Harness Redis | `redisClient()` connect, kemudian track | `quit()` di registry | Connect failure sebelum return tidak masuk registry; tidak ada timeout shutdown |
| Harness NekoDB | Konstruktor → validasi → store → track | `closeNeko()` bila tersedia | Validasi sebelum track dapat gagal; close dipanggil tanpa receiver (`stores.ts:112–115`) |
| Harness namespace | Readiness closures | `ready.cleanup()` dari conformance suite | Namespace berbeda dari sebagian stores; migration suite tidak memanggil cleanup |
| Socket | `socket.ts:627–668` | Guard closed; clear interval/QR timer, close signal repo/ws, end handlers, event destroy | Bukan coordinator auth-store drain/close; sebagian error paths belum best-effort penuh |

### `disposeAll()` yang sebenarnya

[stores.ts](../../src/__tests__/Utils/auth-integration/stores.ts) baris 124–140:
registry module-level, LIFO `pop()`, lalu await disposer di dalam try/catch.

- Satu disposer **reject/throw** tidak menghentikan disposer berikutnya. Semua
  error ditelan; tidak dikembalikan, tidak di-aggregate, dan tidak di-log helper.
  Komentar bahwa backend sudah melaporkannya bukan jaminan source.
- Disposer yang hang menghentikan loop; tidak ada deadline/drain/cancellation.
- Pemanggilan kedua setelah selesai menjadi no-op karena registry kosong;
  handle yang gagal sudah di-pop, sehingga tidak dicoba lagi.
- Pemanggilan concurrent tidak mem-pop entry yang sama dua kali, tetapi tidak
  berbagi completion Promise. Satu caller dapat resolve saat caller lain masih
  menutup handle terakhir; cleanup namespace bisa mulai terlalu cepat.
- Registry bersama bukan ownership per suite. Close client yang sudah ditutup
  dapat throw tergantung driver; error tersebut hilang. Object penyebab pertama
  maupun banyak error cleanup tidak lagi dapat diakses caller.

`suite.ts:37–40` menunggu disposeAll sebelum namespace cleanup. Namun tidak ada
`finally`/deadline untuk memastikan cleanup namespace ketika disposal hang;
cleanup error sendiri diteruskan ke Jest, berbeda dari close error yang ditelan.
Neko close perlu menjaga receiver (`client.close()` atau call/bind), bukan
mengekstrak method lalu memanggil `close()` tanpa `this`.

### Socket, timer, dan pekerjaan pending

[socket.ts](../../src/Socket/socket.ts) memiliki guard `closed` sebelum await
(627–633), membersihkan keepalive/QR timer, melepaskan ws listeners, dan
menjalankan end handlers satu per satu dengan catch/log `err` (651–656).
Namun `signalRepository.close?.()` pada 643 berada di luar try/catch; bila throw,
cleanup berikutnya dilewati dan `closed` sudah true. Error ws.close ditelan (648).
Guard mencegah eksekusi dua kali, tetapi caller kedua tidak menunggu completion
caller pertama. Ini belum setara dengan shutdown bersama yang selesai ditunggu.

Timeout upload prekeys (`socket.ts:529–541`, `Defaults/index.ts:144`: 30 detik)
tidak disimpan/dibatalkan ketika upload selesai. `Promise.race` tidak membatalkan
uploadLogic jika timeout menang; finally mengosongkan guard sementara pekerjaan
lama mungkin masih berjalan, sehingga pemanggilan berikutnya bisa overlap.
Tidak ada bukti dari audit ini bahwa overlap tersebut benar-benar merusak sesi;
perubahan di alur ini perlu koordinasi karena terkait prekeys. Rejection timer
yang kalah dalam race tidak otomatis berarti unhandled rejection.

Socket end tidak mempunyai referensi umum ke AuthStore untuk drain/save/close.
Manager aplikasi memiliki lifecycle sendiri; tidak adanya pendaftaran end handler
saja **tidak membuktikan leak setiap reconnect**. Perlu bukti ownership dan
retained references sebelum menaikkan severity. Jangan otomatis menutup koneksi
borrowed milik caller atau memasang signal handler global dari library.

## Integration Harness

Semua file Fase 13.2 ditinjau. Ringkasan terhadap 12 kriteria:

| # | Kriteria | Hasil dan bukti |
|---|---|---|
| 1 | Optional imports setelah readiness | Builder load setelah check, tetapi probe readiness sendiri melakukan dynamic import (`availability.ts:48–55`). Driver yang terpasang tetap di-import walau endpoint belum dikonfigurasi; klaim “blocked tidak pernah import” terlalu kuat. Tidak terlihat connect saat probe. |
| 2 | Dependency tidak tersedia tidak merusak unit runner | Import probe catch; default `*.test.ts` tidak memasukkan integration files. Namun checkRedis/checkNekoDB menghitung `driver` lalu tidak memeriksanya sebelum mengembalikan available true bila config lengkap (106–149,159–212). |
| 3 | SQLite unik | Default `mkdtempSync` unik dalam konteks module; override directory tidak dibuat unik/divalidasi dan tidak dibersihkan. Nama file memakai namespace mentah, tabel schema disanitasi (stores:149), factory memakai mentah (152). Nama test berhyphen akan gagal query; file helper juga belum memvalidasi path traversal. |
| 4 | Redis cleanup hanya namespace ini | Tidak ada FLUSHDB/FLUSHALL. Tetapi check membuat timestamp namespace baru tiap panggilan (125), sedangkan suite menyimpan check awal dan builders check lagi. Cleanup bisa melewatkan key sebenarnya; reopen nama logical yang sama bisa memperoleh prefix lain. Custom prefix dengan glob metacharacters dipakai mentah dalam KEYS sehingga batas match tidak dijamin literal. |
| 5 | Neko dedicated collection | Builder memakai argumen namespace test mentah (stores:170,209), bukan readiness.namespace (availability:182). Cleanup menyasar koleksi berbeda; override readiness collection tidak menjamin test menulis di sana. Owner marker berlaku untuk semua dokumen Furina di collection, bukan unik run. |
| 6 | Init gagal tetap cleanup | Hook conformance terpasang sebelum body, tetapi handles didaftarkan setelah sebagian alokasi/init; SQLite state handle tak terdaftar; migration.integration.ts tidak punya afterAll/dispose/cleanup sama sekali. |
| 7 | Disposer gagal tidak memblokir lainnya | Benar untuk rejection/throw; tidak untuk hang. Error ditelan dan concurrent callers tidak berbagi completion. |
| 8 | Synthetic credentials tidak di-log | Test tidak secara eksplisit console.log creds; runner mencetak status/nama env saja. Jest assertion diffs, inherited stdio, driver logs, dan fatal raw error (runner:82–84) dapat menampilkan nilai sintetis/endpoint dari error. Tidak ada jaminan redaksi umum. |
| 9 | Unit terpisah | Ya: package.json:63,65 dan jest.config.ts:8; integration hanya `*.integration.ts`, tidak dipanggil default unit suite. |
| 10 | --run saat seluruhnya blocked | Runner:70–75 exit 2 dan tidak spawn Jest. Ini kesimpulan source, tidak dieksekusi ulang agar tidak memicu backend jika lingkungan berubah. Guard driver yang salah perlu dibetulkan sebelum berlaku untuk semua konfigurasi. |
| 11 | Partial availability | Runner menjalankan semua integration files jika minimal satu ready; masing-masing suite/direction menyaring lagi. Maksudnya benar, tetapi missing-driver false positive dan namespace ulang merusak hasil; metadata parent/child tidak dibagi. spawn tidak memasang error listener (runner:40–54). |
| 12 | Fixture keluar paket npm | package.json:32–39 allowlist tidak memasukkan source tests/scripts/docs; tsconfig.build.json:11 mengecualikan src/__tests__. File stale dalam lib tetap perlu diperiksa pada release; audit ini tidak pack/build atau menjalankan prepack. |

Temuan tambahan yang relevan untuk kejujuran coverage:

- [migration.integration.ts](../../src/__tests__/Utils/auth-integration/migration.integration.ts)
  baris 158–160 throw **sebelum seluruh batch**, lalu destination diharapkan `{}`
  (170). Itu bukan kasus 40/100 tersimpan. Controlled wrapper bisa menulis subset
  lewat store nyata kemudian throw untuk menguji orchestration, tetapi tidak
  membuktikan perilaku kegagalan natural driver/server.
- Wrapper mismatch `getMany: async () => ({})` (127–130) juga memalsukan snapshot
  pre-write. Test tidak menyiapkan existing touched values sehingga tidak
  membuktikan preservation destination lama pada rollback nyata.
- Test backup Redis:67 dan NekoDB:69 memakai `JSON.parse(restored)` tanpa
  `BufferJSON.reviver`, lalu `Array.from(...public)`. Replacer menyimpan typed
  array sebagai `{ type: 'Buffer', data: base64 }` (`generics.ts:18–32`); assertion
  tersebut tidak mendecode byte array sebagaimana production reader.
- Timestamp+pid bukan nonce unik yang stabil untuk semua panggilan/run; check
  ulang dapat menghasilkan namespace berbeda atau sama secara kebetulan pada
  milidetik yang sama. Reopen harus memakai identitas eksplisit yang sama.
- SQLite readiness mengalokasikan directory pada report-only probe; runner
  parent tidak cleanup hasil check dan child membuat context sendiri. Cached
  sqliteFolder tidak direset sesudah dihapus. Override directory meninggalkan
  file buatan test. Cleanup directory saat handle terbuka berbeda efeknya di
  Unix/Android/Windows dan bukan bukti closure.
- Redis loopback tidak otomatis berarti DB kosong/test; remote allow flag dan
  Neko test-instance flag hanya memeriksa truthiness, bukan isi boolean atau
  isolasi server. Neko constructor/export/init/close sebenarnya belum diverifikasi
  terhadap driver terpasang; duck typing tidak memvalidasi koneksi atau auth.
- SQLite/Redis/Mongo driver dipanggil optional peers dalam komentar/docs, tetapi
  tidak dideklarasikan di peerDependencies package.json. Hanya Neko ada dan
  optional. Instruksi install manual tersedia di docs; jangan mengubah metadata
  dependency tanpa validasi Yarn dan driver support matrix.

Dokumen Fase 13.2 adalah panduan dan catatan cakupan historis, **bukan jaminan**
bahwa cleanup seluruh namespace/handle sudah benar. Baris 6 komentar
sqlite.integration.ts juga menyebut `store?`; return aktual semua wrapper tetap
hanya `{ state, saveCreds }`. Audit ini mencatat discrepancy tersebut tanpa
mengubah implementasi test atau dokumen historis di luar dua deliverable.

## Risk Ranking

P0 berarti potensi kehilangan data/korupsi sesi atau masalah keamanan serius;
P1 kegagalan recovery/konsistensi; P2 DX/maintainability; P3 optimasi/dokumentasi.
Peringkat mempertimbangkan trigger yang dapat ditunjukkan, bukan eksploitasi
remote yang diasumsikan.

| ID | Rank | Trigger, dampak, dan batas bukti |
|---|---|---|
| R1 | P1 | Write/verify-read rejection melewati rollback; rollback mismatch berhenti pada failure pertama. Partial/mixed destination terbukti sebagai kemungkinan source dan dikarakterisasi mock. |
| R2 | P1 | Restore gagal setelah creds/keys sebagian tertulis, tanpa rollback/verification. Risiko menjadi P0 untuk sesi aktif bila partial destination dipakai atau satu-satunya data awal di-clear; tidak ada reproduksi korupsi protokol nyata dalam audit. |
| R3 | P1 | Harness Redis/Neko cleanup menggunakan namespace berbeda; Neko owner mark bukan per run, prefix glob/override koleksi dapat memperluas sasaran cleanup. Berlaku pada test configuration, tidak membuktikan penghapusan produksi. |
| R4 | P2 | Nama tabel SQLite menjadi grammar SQL mentah. Sintaks/qualified semantics tidak terdefinisi; belum ada bukti attacker reachability atau exploit better-sqlite3. Severity keamanan harus dinilai ulang jika trust boundary nyata ditemukan. |
| R5 | P2 | Missing-driver false readiness, SQLite sanitized/raw mismatch, decode assertion keliru, dan fault sebelum batch membuat hasil harness tidak dapat dipercaya sebagai coverage backend. |
| R6 | P2 | Missing migration teardown, SQLite state handles tersembunyi, init sebelum track, unbound Neko close, dan silent disposal errors menyebabkan resource leak/diagnosis sulit. |
| R7 | P2 | disposeAll/end concurrent call dapat selesai sebelum cleanup lain, signal close throw dapat memotong teardown, race timeout tidak membatalkan pekerjaan. Dampak overlap prekey belum dibuktikan; perlu review terpisah. |
| R8 | P2 | Tanpa snapshot/lock/physical identity/marker, live migration dan restart dapat salah menganggap data siap. Tidak mengklaim API saat ini menjanjikan online atomic migration. |
| R9 | P3 | Memory backup penuh/synchronous gzip, discrepancy docs/peer metadata dan lifecycle ownership membutuhkan penjelasan/measurement. Belum ada kebutuhan streaming yang diukur. |

Tidak ada P0 terkonfirmasi pada penggunaan terisolasi yang dibaca di sini.
Kemungkinan dampak P0 pada aktivasi data parsial dinyatakan bersyarat, bukan
diterjemahkan menjadi klaim kerentanan yang telah dieksploitasi.

## Proposed Phase 13.4

Semua di bawah adalah **rencana**, memerlukan fase implementasi berikutnya.
Urutan memprioritaskan pembuktian yang aman dan recovery minimal, tanpa Group
Metadata Cache, migrasi staging, atau penambahan dependency.

### 1. Guard dan namespace harness yang stabil

- **File:** `src/__tests__/Utils/auth-integration/availability.ts`, `stores.ts`,
  `suite.ts`, semua `*.integration.ts`, `scripts/check-integration-env.ts`.
- **Alasan:** R3/R5; readiness harus mensyaratkan driver dan konfigurasi, memakai
  context run yang dibuat sekali, menyimpan namespace setiap store yang dibuat,
  dan menghapus hanya resource yang tercatat. Probe report-only tidak membuat
  directory. Tolak/escape glob prefix, gunakan child directory privat bahkan
  untuk override base path, dan gunakan satu nama tabel identik pada schema/query.
- **Kompatibilitas:** test-only; environment override kini mendapat batas lebih
  tegas. Reopen harus tetap memakai nama logical yang sama; jangan mengganti
  koleksi lama dengan asumsi owner mark sudah unik per run. Jangan menebak API
  Neko: verifikasi export/init/close terhadap versi driver sebelum real run.
- **Regresi:** missing driver + config lengkap tetap blocked; satu backend siap
  sementara lainnya blocked; fake-clock tick tidak mengubah namespace; dua runs
  tidak collision; foreign key/doc sentinel bertahan; override/glob/path input
  tidak melewati boundary; report-only tanpa alokasi; error spawn terlapor.
- **Validasi:** unit dengan fake loaders/clients saja, typecheck; runner exit 2
  di lingkungan terkontrol tanpa endpoint; real backend tetap opt-in sesudah
  perbaikan dan hanya jika infrastruktur test tersedia.

### 2. Ownership dan teardown harness

- **File:** `stores.ts`, `suite.ts`, `migration.integration.ts`,
  `src/__tests__/Utils/auth/` untuk regression helpers baru sesuai struktur repo.
- **Alasan:** R6/R7; daftarkan cleanup segera setelah alokasi, sediakan lifecycle
  per context/suite, teardown migration di semua jalur, pertahankan receiver
  Neko close, dan tunggu completion Promise disposal yang sama pada double call.
  SQLite state test dapat memakai raw DB yang dimiliki harness +
  `makeAuthStateFromStore`; nyatakan coverage wrapper terpisah secara jujur.
- **Kompatibilitas:** jangan mengubah signature production wrapper untuk sekadar
  memperbaiki test. Tetap coba semua disposer yang reject; preserve primary test
  error serta aggregate cleanup causes tanpa mencetak config/creds. Deadline
  hanya membatasi wait, tidak berarti operasi dibatalkan.
- **Regresi:** init gagal sesudah allocation; dua disposer reject dan sisanya
  dicoba; double/concurrent dispose menunggu handle tertunda; already-closed
  handle; receiver close; cleanup namespace setelah semua close settle; migration
  test gagal tetap cleanup. Definisikan perilaku disposer hang secara eksplisit.
- **Validasi:** mock lifecycle tests + typecheck; belum perlu service nyata.

### 3. Kontrak non-atomic dan recovery migrasi

- **File:** `src/Utils/auth/migration-manager.ts`,
  `src/__tests__/Utils/auth/migration-manager.test.ts`, `migration-faults.test.ts`,
  `docs/auth-stores.md`, `docs/testing/auth-store-integration.md`, `README.md`.
  `src/Types/Auth.ts` hanya bila penjelasan kontrak setMany perlu diperjelas;
  jangan menambahkan mandatory capability ke custom store.
- **Alasan:** R1/R8; dokumentasikan exclusive offline source/destination dan
  non-atomic retry. Pertimbangkan satu error boundary write/verify yang mencoba
  rollback touched keys saat opsi aktif, melanjutkan setelah satu rollback
  gagal, memverifikasi recovery bila memungkinkan, serta menyimpan primary
  cause, fase, dan semua rollback causes. Callback progres tidak boleh
  menggantikan primary failure atau membatalkan recovery.
- **Kompatibilitas:** rollback-on-write-error memperluas perilaku opsi lama,
  bukan perubahan tanpa efek: bisa menghapus data yang sebelumnya dibiarkan
  parsial. Tetapkan semantik rollback: false dan callback error sebelum coding;
  pertahankan cause asli agar caller bisa diagnosis, Boom status yang sesuai,
  return shape sukses, target-only records, dan opsi verify: false.
- **Regresi:** 40 write sukses lalu write 41 gagal sebelum/sesudah persist;
  existing destination + target-only sentinel; verify read reject; beberapa
  rollback failures; remove false; observer throw; retry; dua wrappers storage
  sama sebagai limitation terdokumentasi; concurrent writer tidak dijanjikan
  aman. Jalankan regression terhadap pre-fix di checkout terisolasi tanpa
  menimpa user changes, lalu terhadap fix untuk membuktikan perbedaan.
- **Validasi:** focused migration tests, full unit, lint/typecheck, CJS/ESM
  build dan declaration consumer smoke. Real-driver behavior dilaporkan NOT RUN
  bila belum ada infra; jangan menyamakan subset-wrapper failure dengan server
  fault sungguhan.

### 4. Kebijakan identifier SQLite yang kompatibel

- **File:** `src/Utils/auth-store.ts`, test SQLite adapter di
  `src/__tests__/Utils/auth/`, `stores.ts` untuk konsistensi harness,
  `docs/auth-stores.md`, `README.md`.
- **Alasan:** R4; terapkan satu aturan identifier untuk CREATE/read/write/remove/
  list/clear, tanpa sanitasi collision atau duplikasi aturan yang berbeda.
- **Kompatibilitas:** putuskan literal vs qualified/already-quoted sebelum patch;
  default `furina_auth` harus tetap menunjuk tabel lama. Jangan diam-diam membuat
  tabel literal baru bagi session existing yang memakai schema-qualified name.
  Invalid input gagal sebelum membuka handle bila memungkinkan.
- **Regresi:** default dan custom sederhana; punctuation, Unicode, embedded
  quote, NUL, keyword, qualified/already-quoted; semua SQL paths konsisten,
  values tetap bound, foreign table sentinel tetap utuh; buka data existing.
  Mock SQL capture memverifikasi konstruksi, tetapi tidak membuktikan grammar
  driver. Uji grammar real better-sqlite3 tetap dijadwalkan terpisah saat tersedia.
- **Validasi:** focused adapter tests, lint/typecheck, build dua format,
  declaration smoke; jangan menambahkan native driver wajib pada install normal.

### 5. Restore dan panduan cutover

- **File:** `src/Utils/auth/backup-manager.ts`, `backup-faults.test.ts` dan test
  backup yang sudah ada di `src/__tests__/Utils/auth/`, `docs/auth-stores.md`,
  `README.md`, `docs/testing/auth-store-integration.md`.
- **Alasan:** R2; jelaskan restore non-atomic dan jangan menganjurkan clear storage
  aktif. Tentukan perluasan best-effort recovery/verification sebagai perubahan
  kecil tersendiri, menggunakan expected record map dari envelope dan snapshot
  touched destination; baca ulang backend tetap diperlukan untuk verification.
- **Kompatibilitas:** tambahan read/snapshot meningkatkan latency/memory dan bisa
  memunculkan error baru; bila opsi ditambah harus additive dan terdokumentasi.
  Pertahankan backup version 1, BufferJSON bytes, target-only preservation, dan
  hasil AuthBackupInfo; validasi semantik auth yang lebih ketat adalah keputusan
  terpisah agar backup opaque lama tidak tiba-tiba ditolak.
- **Regresi:** creds sudah tertulis lalu key 41 reject; old creds/keys pulih atau
  error recovery jujur; mismatch readback; malformed envelope tidak menulis;
  malformed serialized record tidak diklaim telah divalidasi; BufferJSON roundtrip
  memakai reviver; jangan clear source untuk membuktikan recovery.
- **Validasi:** focused backup tests, full unit dan build; memory measurement
  dengan data sintetis sebelum mempertimbangkan streaming/limit baru.

### 6. Lifecycle produksi sebagai tindak lanjut terpisah

- **File kandidat:** `src/Utils/auth-store.ts`, `src/Socket/socket.ts`, regression
  tests auth/socket yang relevan, `docs/auth-stores.md`, `README.md`.
- **Alasan:** wrapper internal tidak mengekspos disposal; signal close throw dan
  upload timer memerlukan review ownership. Prioritaskan cleanup pada init gagal
  dan dokumentasi caller-owned raw stores. Jika close handle wrapper ditawarkan,
  buat API additive dengan ownership yang jelas, tanpa mandatory close baru.
- **Kompatibilitas:** jangan auto-close borrowed clients; jangan mengubah
  saveCreds/Signal key ordering atau retry crypto tanpa koordinasi. Pembatalan
  prekey upload membutuhkan desain tersendiri; timer clear saja tidak membatalkan
  upload yang masih berjalan. Tidak dibundel sebagai refactor storage.
- **Regresi:** schema/load-creds failure menutup owned handle; borrowed handle
  tetap dapat dipakai; double/concurrent close completion; throwing signal close
  tidak menghalangi cleanup lain; upload selesai/timeout/shutdown tidak menyisakan
  timer atau mengklaim cancellation palsu. Test harus tanpa server WhatsApp.
- **Validasi:** typecheck, lint, focused dan full unit, dual build/declarations;
  review khusus prekey/auth bila jalur tersebut disentuh.

### Kriteria penerimaan lintas perubahan

Gunakan Yarn yang dikomit untuk instalasi bila fase implementasi kelak memerlukan
setup; jangan npm install repo atau menambah driver wajib. Jaga CJS/ESM dan tipe
publik, hindari dependency Node builtin baru yang menaikkan minimum Node 20.
Native SQLite harus tetap opsional untuk Android/Termux; gunakan fixture kecil,
serial test, dan memory budget terukur. VPS/Docker/Pterodactyl perlu path writable,
persistent volume yang dipilih caller, dan prosedur restart yang tidak mengaktifkan
destination gagal. Deadline shutdown tidak menjamin durability atau cancellation.

Tidak perlu abstraction transaction generik, signal handler global, staging
namespace production, manifest reserved keys, atau perubahan packaging entry
points pada langkah minimum. Setiap klaim backend nyata tetap memerlukan run
terisolasi berikutnya dan laporan jumlah executed/NOT RUN yang eksplisit.

## Validasi Fase 13.3

Deliverable hanya laporan ini dan tautan di `docs/index.md`. Pemeriksaan yang
diwajibkan adalah `npm run check:docs` dan `git diff --check`. Script check:docs
saat ini hanya memeriksa sinkronisasi versi package dengan README/CHANGELOG;
kelulusannya tidak membuktikan link Markdown, ketepatan audit, atau backend safety.
Tautan lokal laporan juga diperiksa terpisah. Source produksi, test, dependency,
konfigurasi, dan history Git tidak diubah; tidak ada commit/push/publish/tag.

Hasil validasi dokumentasi:

- `npm run check:docs`: exit 0, `Dokumentasi sinkron!`.
- `git diff --check`: lulus untuk perubahan tracked; laporan baru diperiksa
  terpisah dengan `git diff --no-index --check /dev/null docs/architecture/storage-safety-audit.md`.
- Seluruh 16 tautan lokal dalam laporan menunjuk file yang ada; pemeriksaan ini
  memeriksa keberadaan file tujuan, bukan validitas setiap anchor.
- Diff source `src/`, `scripts/`, `package.json`, dan `yarn.lock` kosong. Status
  akhir yang diharapkan hanya `docs/index.md` modified dan laporan baru untracked.
