# API Compatibility & Release Readiness Audit — Fase 13.7

[Indeks](../index.md) · [Auth Store](../auth-stores.md) · [Audit Fase 13.5](../lifecycle-crash-recovery-audit.md) · [Remediasi Fase 13.6](../lifecycle-persistence-remediation.md)

**Status: audit-only. Penilaian akhir: NOT READY untuk rilis umum tanpa tindak lanjut.**

Tanggal audit: 2026-11-22. Branch `feat/reliability-audit`, HEAD
`edcf0da28e76f3feefb7a2cd0145305470de6410`. Working tree awal bersih. Tidak ada
perubahan production source, test, deklarasi source, dependency, package version,
atau Git history. Build menghasilkan ulang artefak `lib/` yang diabaikan Git;
fixture sementara berada di `/tmp/opencode/`, bukan test permanen repository.
Tidak ada akses `.env`, session/credentials asli, database produksi, atau koneksi
WhatsApp. Tidak ada dependency/service/driver yang diinstal.

## 1. Executive Summary

Pemakaian normal developer lama yang mengambil `state` dan `saveCreds` tetap
berjalan pada fixture. Custom AuthStore tanpa CAS masih diterima TypeScript dan
dapat menjalankan migrasi/restore offline melalui fallback. CJS dan ESM memuat
entry point package dengan benar pada **Node v22.23.5**, dan memiliki **467 named
runtime exports yang sama**. Ini tidak berarti semua perilaku lama identik.

Audit menemukan compatibility boundaries yang perlu keputusan sebelum rilis:

1. `close` adalah tambahan enumerable pada hasil wrapper owned. Strict object-key
   comparison lama gagal. Exact function-type replacement lama dan exhaustive
   `Record<keyof AuthStore, ...>` juga gagal dikompilasi dengan kontrak baru.
2. Read/parse/storage failure sekarang reject alih-alih dianggap missing/new
   session. Ini perbaikan safety, tetapi mengubah exceptional behavior aplikasi
   yang dahulu mengandalkan fallback diam-diam atau hasil validateSession false.
3. Structural SQLite driver dengan `.run(): void` masih sah menurut deklarasi,
   tetapi conditional update dapat diterapkan lalu compareAndSet mengembalikan
   false karena tidak ada `changes`. Ini direproduksi dengan driver double,
   bukan bukti kegagalan better-sqlite3 nyata.
4. Engine `>=20.0.0` terlalu luas untuk dianggap terbukti. Package bergantung pada
   require(ESM) dan syntax detection; probe dengan dua fitur dimatikan gagal di
   shared WAProto. Binary Node 20.0 tidak tersedia untuk pengujian aktual.
5. Dokumentasi, metadata optional peers, dan public export test seam belum rapi.
   Dua contoh reconnect docs benar-benar gagal pada callback sintetis.

### Baseline yang dipakai

Registry npm endpoint `https://registry.npmjs.org/@vanzzz%2Ffurina-baileys/latest`
yang dibaca tanpa autentikasi memberikan version **1.6.0-furina**, gitHead
**`ccb92e9ca6b336a36d95fb1b64c740e54ab75933`**, fileCount 1.345. Commit tersedia
lokal dan dipakai untuk `git show`/diff. Itu baseline **terpublikasi dist-tag
latest**, bukan sekadar commit bump `bfeb495`; suffix `-furina` adalah konvensi
versi project, bukan asumsi bahwa version string tidak mempunyai prerelease suffix.
Registry metadata tidak membuktikan byte-for-byte tarball sama dengan checkout;
tarball baseline tidak diinstal atau dieksekusi.

Commit delta ditinjau: NekoDB `5d6d44a`, backup/migration `27e4386`/merge `a93da91`,
audit cleanup `560a8c4`, recovery `2c29ab6`, harness `48c58b5`, audit `1cf3c0b`,
storage fixes `a1b5c66`, laporan `7fa7f4f`, lifecycle fixes `edcf0da`. Perbedaan
sejak baseline mencakup beberapa cleanup pra-remediasi; tabel menandainya agar
perubahan itu tidak hilang dari penilaian rilis. Tidak ada tag lokal untuk
menggantikan baseline gitHead registry.

Arti status hasil: **PASS** benar-benar diperiksa; **FAIL** fixture lama gagal
atau counterexample direproduksi; **NOT RUN** tidak dijalankan; **UNKNOWN** belum
dapat dipastikan. PASS dengan double bukan backend verification.

## 2. Public API Changes

Compiler TypeScript 5.9.3 dipakai membaca root export graph baseline dan HEAD
melalui overlay source Git di memori. Hasil: **780 → 801 symbols**, **21 tambahan,
0 symbol dihapus**. Symbols meliputi type-only exports dan default; jumlahnya
tidak boleh disamakan dengan jumlah property runtime.

### Tambahan export root

| Kelompok | Nama baru sejak baseline | Compatibility |
|---|---|---|
| Raw stores | createSQLiteAuthStore, createRedisAuthStore, createMongoAuthStore, createNekoDBAuthStore | Backward compatible sebagai nama baru; kontrak method tetap perlu dinilai |
| Neko wrapper/errors | useNekoDBAuth, missingNekoDBError | Additive but behavior-sensitive untuk dependency/ownership |
| Backup/migration/constants | exportAuthState, importAuthState, peekAuthBackup, migrateAuthState, BACKUP_VERSION, CREDS_KEY | Additive; belum ada pada baseline terpublikasi |
| Test seam | __setAuthModuleLoader | Runtime export publik yang tidak dimaksudkan sebagai API; keputusan stabilisasi/deprecation diperlukan |
| Interfaces/type aliases | ManagedAuthenticationState, NekoDBLike, NekoDBModuleLoader, AuthBackup, ExportAuthStateOptions, AuthBackupInfo, MigrateAuthStateOptions, MigrationResult | Additive; 8 type-only symbols, bukan fungsi runtime |

Jumlah nama runtime tambahan: **13**; type-only: **8**. Tidak ditemukan class
export baru atau class export yang dihapus pada delta ini. Barrel root tetap
[src/index.ts:1–15](../../src/index.ts#L1), melalui
[Utils/index.ts:13–16](../../src/Utils/index.ts#L13) dan
[auth/index.ts](../../src/Utils/auth/index.ts). Helpers read-validation,
record-recovery, sqlite-identifier, dan managed implementation tidak otomatis
menjadi root exports; ManagedAuthenticationState memang di-re-export sebagai type.

### Perubahan kontrak/perilaku

| API | Kondisi lama | Kondisi sekarang | Classification |
|---|---|---|---|
| useSQLiteAuthState(folder, options?) | state/saveCreds, table default furina_auth | state/saveCreds/close; default/path tetap; identifier ditangani konsisten | Additive but behavior-sensitive; potentially breaking untuk exact shape/type |
| useRedisAuthState(options?) | state/saveCreds, default prefix furina:auth: | Tambahan close; default prefix dan connect tetap | Additive but behavior-sensitive |
| useMongoDBAuthState(options?) | state/saveCreds, database furina/collection auth | Tambahan close; default tetap | Additive but behavior-sensitive |
| makeAuthStateFromStore | Truthy serialized creds di-parse; empty string menginisialisasi creds | Hanya null berarti missing; malformed/basic non-object reject | Potentially breaking pada exceptional/malformed paths; valid flow kompatibel |
| useMultiFileAuthState | Read/parse error ditelan sebagai missing/new creds | Hanya ENOENT missing; IO/parse reject | Breaking exceptional behavior secara sengaja untuk safety |
| createFileAuthStore | Seluruh read/stat error dianggap absent | Read/stat failure selain ENOENT diteruskan | Breaking exceptional behavior; parameter/record string format tetap |
| Signal repository validateSession/getSessionInfo | Baca/deserialisasi gagal dapat terlihat sebagai absent/validation false | Error diteruskan | Breaking exceptional behavior; tidak terlihat hanya dari Promise return type |
| makeCacheableSignalKeyStore.set | Cache diperbarui sebelum persist | Tunggu persist lalu cache; invalidate saat persist reject | Behavior-sensitive safety fix, signature sama |
| AuthStore | Kontrak record methods, clear/close optional | compareAndSet juga optional | Structural old adapter compatible; keyof/name-collision consumers potentially breaking |
| Raw SQLite store (sejak Fase 13) | Tidak ada conditional method | compareAndSet dan row-value validation | Additive but behavior-sensitive; structural run-result mismatch ditemukan |
| Raw Redis store (sejak Fase 13) | close selalu quit, dua argumen | Argumen ownership ketiga optional, default legacy tetap; close memoized | Additive but behavior-sensitive: repeated failed close tidak retry |
| Raw Mongo store (sejak Fase 13) | Callback close optional, repeated invocation | Callback close memoized; non-string value reject | Behavior-sensitive untuk retry/invalid document |
| Neko read (sejak diperkenalkan) | Beberapa malformed values dianggap absent | Wrong value type reject; NotFoundError stale ID ditangani | Behavior-sensitive; actual SDK belum diuji |
| migrateAuthState (API baru Fase 13) | Write/verify read rejection bisa keluar tanpa rollback; raw error | Snapshot/recovery lebih luas, Boom cause/data, conflict checks, object lock | Potentially breaking bagi pengguna branch experimental awal, bukan API yang dihapus dari published baseline |
| importAuthState (API baru Fase 13) | Envelope validation lalu writes, tanpa readback/recovery | Tambahan snapshot/readback/recovery dan conflicting-creds validation | Behavior-sensitive, tambahan IO/memory dan failure paths |
| uploadPreKeys | Timeout membuang guard; timer tidak selalu dibersihkan | Caller timeout terpisah dari work settlement; guard ditahan hingga work settle | Behavior-sensitive safety fix; timeout tidak membatalkan upload |
| sock.end | Tidak drain saveCreds aplikasi | Tetap demikian; tidak ada API shutdown baru | Backward compatible pada aspek ini; limitation tetap |
| waitForSendWindow | Satu argumen, console output | Optional logger kedua, default tanpa console output | Additive but behavior-sensitive untuk observability |
| MessageBuilder.send carousel error path | console.error lalu reset flag | sock.logger.error lalu reset flag | Potentially breaking untuk custom socket tanpa logger; normal socket menyediakan logger |
| communities/business cleanup logs | Console logging pada error tertentu | Logger config/best-effort silent cleanup | Internal implementation only/observability-sensitive; parameter dan return tidak berubah |

Perubahan logging terakhir berasal dari `560a8c4`, bukan algoritma storage Fase
13.6. Source:
[timing.ts:75–86](../../src/Utils/antiban/timing.ts#L75),
[message-builder.ts:287–358](../../src/Utils/messaging/message-builder.ts#L287),
[Socket/business.ts:411–414](../../src/Socket/business.ts#L411).

## 3. Auth Store Compatibility

Kontrak aktual ada di [auth-store.ts](../../src/Utils/auth-store.ts) dan
[Types/Auth.ts:123–151](../../src/Types/Auth.ts#L123).

| Fungsi | Return aktual | Defaults/ownership penting |
|---|---|---|
| useSQLiteAuthState | Promise<ManagedAuthenticationState> | folder wajib, options optional, path folder/auth.db, table furina_auth; owned |
| useRedisAuthState | Promise<ManagedAuthenticationState> | options optional, table sebagai prefix dengan colon tambahan; owned |
| useMongoDBAuthState | Promise<ManagedAuthenticationState> | options optional, local URL/furina/auth defaults; owned |
| useNekoDBAuth | Promise<{state, saveCreds}> | Caller initialized client; collection baileys_auth; borrowed |
| makeAuthStateFromStore | Promise<{state, saveCreds}> | Borrowed AuthStore; tidak meneruskan close |
| createSQLiteAuthStore | AuthStore sinkron | Borrowed DB/schema, table furina_auth; conditional recovery |
| createRedisAuthStore | AuthStore sinkron | Borrowed supplied client tetapi explicit close legacy menutupnya; ownership override optional |
| createMongoAuthStore | AuthStore sinkron | Borrowed collection, close callback optional |
| createNekoDBAuthStore | AuthStore sinkron | Borrowed structural client, collection default; tidak perlu mengambil alih shutdown |
| migrateAuthState | Promise<MigrationResult> | verify=true, rollback=true; hasil backend adalah backend source |
| exportAuthState | Promise<Buffer> | exclude optional, gzip level default 9; caller menyimpan Buffer |
| peekAuthBackup | AuthBackupInfo sinkron | recordCount mengecualikan creds; mem-parse envelope |
| importAuthState | Promise<AuthBackupInfo> | overwrite touched keys, target-only tetap; recordCount termasuk restored creds |

**backupAuthState dan restoreAuthState tidak ada sebagai root API.** Implementasi,
barrel, runtime namespace, dan API reference memakai exportAuthState/importAuthState.
Nama yang diminta dalam lingkup audit itu tidak dianggap alias yang pernah
didukung atau fungsi yang baru dihapus. Tidak ada rename yang perlu diasumsikan.

Normal destructuring `{state, saveCreds}` dari ketiga owned wrappers lulus dalam
kedua mode memakai driver doubles. Hasil aktual mempunyai own enumerable keys
`close, saveCreds, state`. Fixture strict old keys `saveCreds, state` gagal.
MakeAuthStateFromStore dan Neko borrowed wrapper tetap dua field. Penambahan
close bukan bukti semua custom wrapper/equality assertion otomatis kompatibel.

SQLite quoting mempertahankan simple/default names, schema.table, dan quoted
components; punctuation/space/keyword menjadi nama literal yang aman secara
interpretasi. Raw SQL fragments, NUL/control atau malformed identifiers sekarang
ditolak sebelum DB dibuka. Ini memperketat input; bukan claim SQL injection
sebelumnya telah direproduksi. Grammar real better-sqlite3 **NOT RUN**.

## 4. Custom Adapter Compatibility

Fixture TypeScript `.cts` dan `.mts` sementara memakai **strict**, tanpa any:

- AuthStore lama dengan backend/get/getMany/set/setMany/remove/keys: **PASS**.
- AuthStore baru dengan compareAndSet yang bertipe benar: **PASS**.
- Legacy SQLite wrapper return dapat di-assign ke consumer yang hanya meminta
  Promise<{state, saveCreds}>: **PASS**.
- Baru mempunyai close tidak berarti implementasi wrapper lama dapat dipakai
  menggantikan `typeof useSQLiteAuthState` baru: **FAIL TS2322**, close missing.
- `Record<keyof AuthStore, boolean>` dengan daftar keys lama: **FAIL TS2741**,
  compareAndSet belum dicantumkan. Ini tidak memaksa implementasi adapter lama
  menambahkan CAS; yang berubah adalah exhaustive metadata consumer.

Runtime memory store tanpa CAS: makeAuthStateFromStore, migration, backup,
restore, write-failure recovery, dan preservation target-only key **PASS** di CJS
dan ESM. Store dengan CAS juga PASS. Semua operasi dilakukan pada data sintetis,
dengan akses eksklusif; fallback tidak menjadi aman lintas proses karena fixture ini.

### Temuan structural SQLite driver

Deklarasi [SqliteStatement:46–49](../../src/Utils/auth-store.ts#L46) dan emitted
declaration menerima `run(...): unknown`, termasuk void. Fixture TypeScript untuk
driver demikian **PASS**. Tetapi factory selalu menambahkan compareAndSet yang
membaca `result.changes === 1`
([auth-store.ts:198–205](../../src/Utils/auth-store.ts#L198)).

Counterexample sementara: driver menjalankan conditional UPDATE pada memory map,
return void; method compareAndSet kemudian memberi **false meskipun nilai sudah
diubah**. Hasil **FAIL** pada kedua build. False dapat terlihat sebagai conflict
dalam recovery meskipun restore sudah diterapkan. Tidak ada exploit atau data
corruption native yang diklaim; ini ketidaksesuaian capability/result contract
pada surface yang saat ini diterima types. Perlu keputusan Fase 13.8 mengenai
structural driver contract/capability detection sebelum dijanjikan kompatibel.

## 5. Error Contract

| Tahap/kategori | Bentuk error aktual | Implikasi pengguna |
|---|---|---|
| Read/storage umum | Original driver/IO error diteruskan | Tidak semua error Boom; gunakan code/identity yang tersedia, jangan anggap null |
| Serialized auth JSON malformed | SyntaxError generik dengan non-enumerable cause | Pesan utama tidak memuat isi JSON; cause mentah tetap berpotensi sensitif |
| Basic credentials/value validation | Error generik; invalid schema input tertentu Boom 400 | Tidak semua validasi mempunyai cause atau satu class khusus |
| Migration source/snapshot error sebelum mutation | Error asli atau validation Boom 400 | Recovery metadata tidak wajib tersedia karena write belum dimulai |
| Migration/restore write atau verify failure | Boom 500, cause asli, data recovery | Error identity berbeda dari raw write error; cek cause, jangan hanya e===driverError |
| Initialization failure + close sukses | Original initialization error | Identity dipertahankan |
| Initialization failure + close reject | AggregateError.errors=[primary, cleanup], cause=primary | Keduanya dapat diinspeksi; close hang tetap dapat menahan rejection |
| Managed close dengan pending-operation/close reject | AggregateError.errors + cause pertama | Repeated close replay Promise/error yang sama, bukan retry |
| Invalid backup envelope | Boom 400 dengan pesan kategori | Gzip/JSON low-level cause tidak diteruskan oleh parseEnvelope |
| Optional module load error | Generic missing-dependency Error | Catch-all lazy loader menyembunyikan cause import asli, termasuk error selain package absent |

Source: [read-validation.ts](../../src/Utils/auth/read-validation.ts),
[record-recovery.ts:83–97](../../src/Utils/auth/record-recovery.ts#L83),
[owned-resource.ts](../../src/Utils/auth/owned-resource.ts),
[backup-manager.ts:46–105](../../src/Utils/auth/backup-manager.ts#L46),
[auth-store.ts:61–68](../../src/Utils/auth-store.ts#L61).

Recovery data: phase, rollbackAttempted, rollbackErrors, rollbackConflicts,
progressErrors, destinationMayBePartial, conditionalRecovery. Runtime conflict
fixture **PASS**: operasi reject, cause tetap sama, konflik tercatat, concurrent
value tidak ditimpa pada interleaving yang diuji. Metadata ini bukan certificate
session completeness. conditionalRecovery adalah keberadaan capability pada
store, bukan bukti semua keys memakai CAS. False uncertainty hanya berarti
recovery/readback yang diamati tidak error dalam kondisi itu.

Fallback tanpa CAS tetap check-then-set/remove dengan TOCTOU, local lock hanya
object identity, dan value-CAS tidak mendeteksi ABA. Source/backup tidak dihapus
untuk recovery. `verify:false` dan `rollback:false` tetap opt-out lama. Tidak ada
durable marker/journal atau otomatis resume setelah crash.

Jadi klaim “semua original errors selalu dipertahankan” terlalu luas. Selain
validation/module loaders di atas, custom cache.del yang gagal saat invalidasi
dapat menutupi original storage error di auth-utils. Raw file remove/clear masih
best-effort catch-all. Ini perlu dicatat, bukan mengganti seluruh error system.
Cause/data dapat mengandung driver payload/JID/key names; jangan log seluruh
object tanpa redaksi. Tidak ada typed public RecoveryError class saat ini;
consumer TypeScript perlu narrowing unknown error sebelum membaca metadata.

## 6. Connection Ownership

Owned wrappers mempertahankan state/saveCreds dan menambah close. Close menolak
operasi baru melalui result itu, menunggu admitted operations, lalu close satu
kali. Ia tidak otomatis menyimpan final creds, memasang signal handlers,
mengambil alih socket end, atau membatalkan I/O. Driver hang membuat close pending;
tidak ada timeout yang menyatakan resource sudah closed.

Driver-double fixtures **PASS** untuk SQLite/Redis/Mongo old destructuring, save,
close berulang/concurrent; Redis pending save ditunggu; initialization+cleanup
failures tetap dapat diakses. Real driver close/cancellation **NOT RUN**.

| Borrowed surface | Explicit close behavior |
|---|---|
| Raw SQLite/Neko | Tidak ada automatic close; caller mempertahankan handle |
| Raw Mongo | Hanya callback yang caller delegasikan; sekarang memoized |
| Raw Redis default | close memanggil quit supplied client; legacy behavior raw factory dipertahankan |
| Raw Redis ownership borrowed | close tidak quit shared client; PASS fixture |
| makeAuthStateFromStore/useNekoDBAuth | Tidak menambahkan close dan tidak mengambil ownership |

Memoization mengubah retry semantics raw close: failure pertama di-replay, bukan
mencoba driver close lagi. Managed operations dimulai melalui microtask pada
owned-resource.ts:24; exact scheduling atau same-turn mutation capture tidak
boleh dianggap identik dengan wrapper lama tanpa test khusus. Valid await-style
usage lulus; exotic wrappers, reentrancy, external raw operations dan native
reconnect jobs masih memerlukan review.

## 7. CJS/ESM Compatibility

Entry fields [package.json:22–30](../../package.json#L22) **tidak berubah**:
main lib/cjs/index.js, module lib/esm/index.js, types lib/cjs/index.d.ts;
exports require→CJS, import→ESM, types→CJS declarations. Root tidak mempunyai
type field. Build menaruh type commonjs/module pada masing-masing subtree dan
memakai satu shared `lib/WAProto`.

| Cara import | Hasil aktual Node 22.23.5 |
|---|---|
| const baileys=require('@vanzzz/furina-baileys') | PASS: namespace object, bukan function langsung |
| baileys.makeWASocket / baileys.default | PASS: function yang sama |
| import baileys from '@vanzzz/furina-baileys' | PASS: default function |
| import {makeWASocket, ...} | PASS: named exports; default identik dengan named socket factory |
| Named namespace parity | PASS: 467 per mode, 0 difference setelah membuang default/__esModule |

Perbedaan namespace require dan function default ESM bukan export yang hilang;
root source default/named socket export sama dengan baseline. Auth runtime checks
dijalankan di kedua mode. ESM loader hooks dipakai untuk driver doubles, dan CJS
preload hook untuk require yang dihasilkan compiler. Probe awal CJS dengan hanya
ESM hook tidak mengganti optional require dan gagal karena driver tidak terpasang;
hasil itu **disupersede** oleh fixture CJS yang tepat, bukan dianggap library bug.

Fixture final per mode: **16 checks, 14 PASS, 2 FAIL**. Dua FAIL adalah strict old
owned return shape dan structural SQLite run-void result di atas. Collector exit
0 berarti audit probe selesai dan mengharapkan counterexamples tersebut; **bukan
berarti semua compatibility checks PASS**. Semua hooks di luar repo dan hanya
berlaku pada proses fixture, tidak masuk package/production source.

## 8. TypeScript Compatibility

Positive fixtures `.cts`/`.mts` memakai TypeScript **5.9.3**, strict, NodeNext,
target ES2020, skipLibCheck untuk dependency declarations. Consumer memeriksa
default/named makeWASocket, actual `{auth: state}` call secara compile-only,
legacy/custom CAS stores, Redis ownership, owned close, Neko borrowed shape,
migration result serta backup/import info. **PASS exit 0**.

Negative fixtures sengaja membuktikan exact type consumers yang perlu migrasi:
TS2322 (legacy wrapper implementation tidak memenuhi required close pada type
fungsi sekarang) dan TS2741 (exhaustive keyof map lama). **FAIL exit 2 dengan dua
diagnostic yang diharapkan**, tidak disembunyikan memakai any atau ts-ignore.

Emitted declarations sesuai field/signature JS yang diperiksa:
ManagedAuthenticationState berisi state/saveCreds/close; compareAndSet optional;
raw Redis third argument optional; borrowed wrappers tetap dua field. Types
tidak menjamin session validity, Atomic CAS milik custom implementation, atau
error rejection types. Structural SqliteStatement run-result inconsistency
adalah contoh compile PASS yang tetap tidak menjamin runtime contract.

Minimum TypeScript consumer version tidak dinyatakan package. Compiler lama dan
bundler/tsconfig combinations lain **NOT RUN**, bukan otomatis PASS. Build
declarations dihasilkan ulang, tidak ada source declaration yang diedit.

## 9. Node.js Engine Compatibility

Package engines dan [engine-requirements.js](../../engine-requirements.js)
memeriksa **>=20.0.0 / major >=20**, tanpa minor floor. Runtime audit hanya
**v22.23.5**. AggregateError, Promise.allSettled, WeakMap, AsyncLocalStorage,
Object.fromEntries, crypto/fs/path, dan manual Object.defineProperty untuk cause
tidak menunjukkan kebutuhan Node lebih baru dari 20 pada perubahan ini.
Error cause tidak dibuat lewat ErrorOptions constructor baru; status causa
ditambahkan manual. Triple-reference ES2021 Promise adalah konfigurasi tipe,
bukan polyfill runtime.

**Loader gap yang sudah ada sebelum Fase 13:** CJS Defaults memuat shared
WAProto yang berupa ESM tanpa nearest type field. Dependencies seperti p-queue
juga ESM. Node release notes primer untuk **20.19.0** menyatakan require(ESM)
dan module syntax detection baru default pada versi itu:
`https://nodejs.org/en/blog/release/v20.19.0`.

Probe Node 22 dengan `--no-experimental-require-module
--no-experimental-detect-module` benar-benar **FAIL** pada lib/WAProto/index.js
dengan SyntaxError import-outside-module. Itu membuktikan ketergantungan pada
fitur loader, **bukan eksekusi binary Node 20.0**. Native binary Node 20.0/20.19
dan platform lain **NOT RUN**. Jangan menyatakan entire declared range verified
atau menaikkan engine secara otomatis; Phase 13.8 perlu matrix dan keputusan
packaging/minimum minor berdasarkan hasil nyata.

## 10. Socket and PreKey Behavior

Diff [socket.ts:488–545](../../src/Socket/socket.ts#L488) sejak baseline terbatas
pada work Promise, timer handle/cleanup, dan single-flight guard. Upload payload,
prekey generation/format, retry/backoff logic dan ordering credentials event
tidak berubah oleh diff ini. Timer caller 30 detik tetap memberi rejection;
timer tidak membatalkan original work. Guard bertahan sampai work settle.
Pemanggilan baru saat timeout tetapi work hidup berbagi failure, tidak memulai
logical upload kedua pada socket yang sama. Hang work berarti guard juga dapat
bertahan selamanya; socket baru tidak berbagi guard.

Permanent regression source yang ditinjau:
[persistence-lifecycle.test.ts](../../src/__tests__/binary/persistence-lifecycle.test.ts).
Hasil 78 suites/1.365 tests Fase 13.6 adalah **historis**, bukan full unit run baru
Fase 13.7. Pada audit ini dilakukan diff review, temporary compatibility fixtures,
dan build/pack. Tidak ada koneksi server WhatsApp atau test backend nyata.

[sock.end:631](../../src/Socket/socket.ts#L631) tetap tidak menunggu saveCreds
aplikasi, tidak drain seluruh transaction work, dan tidak auto-close borrowed DB.
Emitter tidak diubah menjadi awaited interface. Counter creds.update masih
terpisah dari durable key commit. Jangan menafsirkan timeout sebagai cancellation,
connection open sebagai persistence success, atau test doubles sebagai jaminan
tidak ada duplicate/lost server upload/unhandled rejection pada semua jalur.

## 11. Documentation Accuracy

| File/bagian | Temuan | Status/batas bukti |
|---|---|---|
| docs/auth-stores.md:13–18 | Owned close sudah disebut, tetapi semua DB disebut optional peer; SQLite/Redis/Mongo tidak dideklarasikan peers | FAIL source metadata wording; install manual ada |
| docs/auth-stores.md:22–34 | Interface snippet lama tidak memuat compareAndSet | Masih valid minimum legacy adapter, belum full reference; perlu label atau optional member |
| docs/auth-stores.md:57–104,397–400 | Contoh owned wrappers hanya destructure state/saveCreds tanpa shutdown | Usage valid, lifecycle example tidak lengkap; close ada pada bagian 331–357 |
| docs/auth-stores.md:127–180 | Neko constructor/fromEnv/cache TTL adalah klaim SDK eksternal | UNKNOWN/NOT RUN actual client; source Furina tidak membuktikan detail SDK itu |
| docs/auth-stores.md:156–161 | SIGINT memanggil end/close tanpa await lalu process.exit(0) | Source menunjukkan shutdown dapat memotong persistence; bertentangan dengan guidance drain baru |
| docs/auth-stores.md:297–329 | Menjelaskan cause/conflicts/fallback non-atomic/no marker | Sesuai batas utama; conditionalRecovery adalah capability presence, bukan actual per-key use |
| docs/auth-stores.md:379–387 | Custom getMany mengandung placeholder `({ ... })` | Pseudocode, tidak runnable copy-paste; harus dilabeli/diganti contoh valid |
| docs/getting-started.md:14–28 | CommonJS tidak mengimpor DisconnectReason tetapi memakainya saat close | FAIL callback sandbox: ReferenceError DisconnectReason is not defined |
| docs/getting-started.md:50–61 | ESM reconnect memanggil start() tanpa definisi | FAIL callback sandbox: ReferenceError start is not defined |
| docs/api-reference.md:128–129 | Nama backup/migration aktual benar | PASS source; tidak ada alias backupAuthState/restoreAuthState yang perlu dipakai |
| README + CHANGELOG | Version tetap 1.6.0-furina; README memuat perilaku baru tetapi changelog 1.6.0 hanya donation features | Belum memisahkan published baseline dari unreleased branch behavior; pengguna npm latest tidak mendapat seluruh API HEAD |
| docs/testing/auth-store-integration.md | Menyatakan 0 real backend dan batas doubles; ownership/deadline dijelaskan | Konsisten dengan scope; bukan backend reliability evidence |
| AGENTS.md Setup | Menunjuk committed Yarn 4.9.2 | Stale: actual .yarnrc/release binary 4.18.1; tidak diubah dalam audit |
| Laporan historis Fase 13.3–13.6 | Ada state/line/count lama sesuai fase | Dipertahankan sebagai histori; jangan dibaca sebagai jaminan HEAD terbaru |

Callback sandbox hanya memakai fake socket dan fake auth loader, lalu memanggil
callback close secara deterministik; tidak membaca auth_info atau membuat socket
network. Dua FAIL docs bukan kegagalan package entry point. Import example Neko
tidak dinyatakan salah hanya karena SDK belum diinstal.

`__setAuthModuleLoader` adalah discrepancy terpisah: komentar menyatakan bukan
public API, tetapi auth barrel export-star membuatnya tersedia di root CJS/ESM
dan declarations. NekoDBModuleLoader ikut terekspos. Tidak ada bukti penggunaan
downstream; menghapusnya diam-diam juga perlu keputusan kompatibilitas.

## 12. npm Package Integrity

Build dijalankan dahulu, lalu smoke/types, kemudian npm pack --dry-run --json
beserta lifecycle rebuild secara sequential. Runtime checks tambahan sesudah pack
juga dijalankan sequential pada artefak yang sudah selesai; tidak ada build/pack
yang paralel dengan consumer yang membutuhkan lib. Pack exit **0**:

| Metadata HEAD | Hasil |
|---|---|
| Name/version | @vanzzz/furina-baileys / 1.6.0-furina |
| Entries | **1.409** |
| Packed size | **2.114.342 bytes** |
| Unpacked size | **19.019.154 bytes** |
| Forbidden paths pada listing | **0** |

Scanner mencari .env, auth/session paths, fixtures, __tests__, scripts, .git,
temporary DB/SQLite files, backup/archive suffixes. Allowlist package hanya lib,
WAProto, license, README, changelog, engine gate. Build exclude src/__tests__.
Tidak ada credentials/session asli yang dibuka untuk inspeksi. Ini pemeriksaan
manifest/allowlist dan artefak build, bukan secret-scanning isi data produksi
atau instalasi tarball fresh dari npm. Source maps/declarations adalah artefak
build yang disengaja; keberadaannya bukan test fixture leak.

Dibanding registry baseline 1.345 files, delta **64 files** konsisten dengan
tambahan modules auth dan artefak dual-build. Package main/module/exports/types,
mandatory deps, engines, resolutions tidak berubah sejak baseline. package.json
delta hanya optional Neko peer/meta dan test:integration; yarn.lock delta hanya
workspace peer metadata terkait. Tidak ada lockfile dependency churn tak terkait.

SQLite/Redis/Mongo driver tidak ada di peerDependencies; Neko ada dan optional.
Sharp peer belum ditandai optional di metadata yang ada, tetapi itu kondisi
baseline, bukan perubahan Fase 13. Installer behavior native deps pada Termux/
Android dan fresh external consumer install **NOT RUN**. Tidak ada install yang
dilakukan untuk menutupi absence dependencies.

### Release workflow hazards, read-only

[publish.yml:19–38](../../.github/workflows/publish.yml#L19) memakai Node 22,
Yarn committed dan manual workflow_dispatch. Workflow tersebut tidak menjalankan
compatibility suite sebelum publish. [publish-release.yml:3–6,50–57](../../.github/workflows/publish-release.yml#L3)
masih dipicu tag v*; publish pertama memakai current package.name, lalu langkah
berikutnya mengganti name menjadi @whiskeysockets/baileys dan publish lagi.
Jangan menyebut publish pertama otomatis bernama baileys hanya berdasarkan label
step; perintah aktual memakai package.json. Ini hazard scope/package release
yang sudah ada, bukan sesuatu yang dieksekusi audit. Tidak ada tag/publish dibuat.

## 13. Backward Compatibility Matrix

| Pengguna/skenario | Status | Bukti dan batas |
|---|---|---|
| Old state/saveCreds destructuring owned wrappers | PASS | Actual compiled wrappers, synthetic drivers, CJS dan ESM |
| Old strict Object.keys hasil owned wrapper | FAIL | Enumerable close menambah key pada kedua mode |
| Custom AuthStore lama tanpa CAS | PASS | Strict .cts/.mts compile dan runtime memory fallback |
| Custom AuthStore baru dengan CAS | PASS | Strict compile dan synthetic CAS runtime |
| Exhaustive keyof map lama | FAIL | TS2741, bukan kegagalan adapter record methods |
| Exact function-type replacement wrapper lama | FAIL | TS2322 close missing |
| SQLite owned close | PASS doubles / NOT RUN native | Repeated/concurrent close, post-close admission; better-sqlite3 tidak tersedia |
| Structural SQLite run void conditional result | FAIL | Types menerima, runtime mutation applied tetapi return false |
| Redis borrowed vs default owned raw close | PASS doubles / NOT RUN native | Borrowed tidak quit, legacy owned quit sekali |
| Owned init failure + cleanup failure | PASS doubles | AggregateError menyimpan primary dan secondary causes |
| Owned close menunggu admitted save | PASS doubles | Controlled Promise tanpa arbitrary sleep |
| Neko borrowed wrapper | PASS doubles / NOT RUN native | Dua field dipertahankan, client caller tidak ditutup |
| Migration, export/import backup | PASS synthetic | Source retained, target-only preserved, legacy/CAS fallback, failure recovery |
| Recovery conflict | PASS synthetic | Reject dengan cause/conflict/uncertainty, current value preserved pada interleaving yang diuji |
| CJS require/default property/named | PASS Node 22.23.5 | Package self-reference entry points, bukan fresh installed tarball |
| ESM default/named | PASS Node 22.23.5 | 467 named exports parity |
| Types consumer CJS/ESM | PASS TS 5.9.3 | Strict NodeNext; dependency lib check dilewati, declarations generated |
| Legacy module features dimatikan | FAIL | Actual Node 22 probe pada shared ESM WAProto |
| Native Node 20.0, 20.19, OS matrix | NOT RUN | Tidak ada binary/platform tersebut yang diinstal |
| Neko SDK constructor/fromEnv/cache claims | UNKNOWN | Belum ada client SDK aktual yang diperiksa/dijalankan |
| Real backend durability/concurrency/close | NOT RUN | better-sqlite3, redis, mongodb, @nekodb/client semuanya absent |
| CommonJS/ESM docs reconnect examples | FAIL | ReferenceError pada callback sandbox, tanpa network |
| Full unit suite Fase 13.7 | NOT RUN | Hasil 78/1.365 milik Fase 13.6 tetap histori, bukan dihitung ulang |

## 14. Release Readiness Assessment

**NOT READY untuk rilis umum dengan janji backward compatibility tanpa
penyesuaian.** Ini bukan pernyataan bahwa seluruh library gagal bekerja: normal
Node 22 usage, import paths, positive types, dan offline synthetic storage flows
lulus. Namun kelulusan itu tidak menghapus compatibility counterexamples.

Sebelum status dapat menjadi READY WITH LIMITATIONS, maintainer perlu:

1. Menetapkan supported engine range berdasarkan test matrix dan loader design,
   bukan major-only check yang belum diuji seluruhnya.
2. Memperjelas/memperbaiki structural SQLite CAS result contract, serta menentukan
   bagaimana shape/type-sensitive consumers bermigrasi.
3. Memberi release notes eksplisit untuk read/validation rejections dan cleanup
   semantics; memisahkan published 1.6.0 dari unreleased HEAD docs.
4. Memperbaiki contoh reconnect/shutdown, optional-peer wording, dan boundary
   public test seam melalui rencana kompatibel.
5. Menjalankan minimum driver/backend isolated verification atau membatasi klaim
   rilis secara tegas dengan acceptance maintainer. Tidak ada backend baru yang
   boleh disebut production-verified hanya karena doubles lulus.

Fallback tanpa CAS, tidak adanya durable journal, dan sock.end yang tidak
menunggu aplikasi dapat menjadi **limitations yang diterima**, jika akses
eksklusif/cutover/ownership didokumentasikan dan scope rilis disepakati. Tidak
perlu menambahkan journal hanya untuk mendapatkan label READY. Audit ini tidak
memilih nomor versi, menaikkan engine, atau memutuskan release channel otomatis.

## 15. Outstanding Issues

| ID | Prioritas release | Temuan | Tindak lanjut |
|---|---|---|---|
| A1 | Blocker keputusan | Engine >=20.0.0 belum sesuai bukti loader/range | Matrix native dan keputusan packaging/floor |
| A2 | Blocker kontrak | SQLite structural run result boleh unknown/void, CAS butuh changes | Uji capability/result contract, jangan false claim generic driver support |
| A3 | Blocker dokumentasi migrasi | Intentional read/Signal rejections dan shape/type changes belum disajikan sebagai unreleased upgrade notes | Guide error narrowing, exact-shape adapters, release policy maintainer |
| A4 | Sebelum rilis umum | Callback docs reconnect unbound symbols; shutdown Neko immediate exit | Contoh runnable dengan lifecycle boundary jelas |
| A5 | Sebelum public API stabil | __setAuthModuleLoader diekspor meskipun berkomentar internal | Explicit export/deprecation decision, jangan silent removal |
| A6 | Verification gap | Native peers/SDK/DB behavior belum diuji | Isolated matrix; tetap NOT RUN jika tidak tersedia |
| A7 | Known limitation | Non-CAS rollback TOCTOU, ABA, RAM snapshot, pending app persistence | Jangan klaim online atomicity/durable crash recovery |
| A8 | Metadata/process | Optional peers/docs mismatch, Yarn setup stale, tag workflow mengganti package scope | PR metadata/docs/workflow terpisah dengan review |
| A9 | Error observability | Lazy import/backup validation/cache cleanup tidak universal preserve cause | Pertahankan kategori, tambah test sebelum perubahan error contract |

Tidak ada issue diperbaiki diam-diam pada audit. Negative fixture failure adalah
temuan yang harus ditinjau, bukan diubah ekspektasinya menjadi PASS.

## 16. Proposed Phase 13.8

| Urutan/pekerjaan | Alasan / file kandidat | Risiko kompatibilitas | Tests dan kriteria berhasil |
|---|---|---|---|
| 1. Release contract dan upgrade guide | CHANGELOG.md, README.md, docs/auth-stores.md, docs/api-reference.md; rujuk published baseline gitHead | Jangan menjanjikan API HEAD pada npm latest lama; nomor versi/channel tetap keputusan maintainer | Semua contoh field/error/ownership cocok dengan source; shape/type counterexamples dijelaskan |
| 2. SQLite conditional capability contract | src/Utils/auth-store.ts, Types/Auth.ts bila perlu, focused adapter tests | Narrowing structural input atau disabling auto capability dapat memengaruhi raw factory users; default native wrapper harus tetap memakai driver yang sesuai | run void/changes number/ambiguous result, failed ack, no-match, protected update/delete; return/result tidak menyatakan false confidence |
| 3. Node/package compatibility matrix | build configs, engine-requirements.js, package.json **hanya jika keputusan disetujui**, isolated consumer fixtures | Root type/exports/shared WAProto load-bearing; jangan ubah untuk menghilangkan warning saja | Native minimum/current Node versions, CJS/ESM default/named, TS consumers dan fresh package install; hasil range terdokumentasi |
| 4. Public surface/test seam policy | Utils/auth/index.ts, nekodb-auth.ts, tests yang menggunakannya | Menghapus accidental export bisa breaking bagi caller tak terdeteksi; deprecate atau isolate dengan kebijakan jelas | Baseline export graph, no accidental removals, test hook tidak dijanjikan sebagai production API tanpa kebutuhan |
| 5. Docs examples dan ownership | docs/getting-started.md, docs/auth-stores.md, testing docs, AGENTS.md setup | Jangan mengubah emitter menjadi awaited API atau force-close shared clients untuk menyesuaikan contoh | Callback sandbox, valid imports, explicit start/reconnect/drain, awaited close; Neko API claims cocok dengan driver yang diuji |
| 6. Error/capability documentation | record-recovery.ts/owned-resource.ts/read-validation.ts hanya bila defect reproducible; docs type guards | Error identity/messages/cause changes sendiri behavior-sensitive; bukan structured-error-system refactor | Source/read/malformed/import/init/write/rollback/close cases; preserve causes sesuai kategori dan report uncertainty |
| 7. Isolated peers/backends dan publish guard | Auth integration tests; .github/workflows ditinjau dalam PR terpisah | Jangan tambah mandatory DB driver atau mengaktifkan tag workflow yang salah scope | SQLite/Redis/Mongo/Neko isolated runs, borrowed/shared close, native return values, package name/version guard; absent infrastructure tetap NOT RUN |

Fixture sementara audit dapat menjadi bahan regression suite pada fase berikutnya,
tetapi belum menjadi permanent tests di repo. Test doubles, native backend test,
fresh package consumer, minimum-engine test dan source inspection harus tetap
dilaporkan sebagai jenis bukti berbeda. Tidak ada alasan dari audit ini untuk
memulai Group Metadata Cache, message queue, atau migration journal redesign.

### Evidence dan validasi audit

Artefak sementara (tidak di-commit): `/tmp/opencode/phase137-symbols.json`,
`phase137-types.cts`, `phase137-types.mts`, `phase137-sensitive-types.cts`, runtime
fixtures/driver hooks, `phase137-cjs-final.log`, `phase137-esm-final.log`,
`phase137-sensitive-types.log`, `phase137-legacy-module-features.log`,
`phase134-phase137-doc-probes-final.log`, dan `phase137-validation.json`/pack listing.
Source metadata registry dan Node release notes dicantumkan di bagian 1/9.
Tidak ada artifact sementara yang ditambahkan ke source/package fixture list.

Validasi akhir laporan: npm run check:docs, git diff --check (termasuk file baru
untracked), file/line links, dan diff tracked source/config/lock/declarations.
Check:docs hanya memeriksa versi README/CHANGELOG, bukan ketepatan API/concurrency.
Hasil akhir pemeriksaan audit:

- `npm run check:docs`: PASS, exit 0.
- `git diff --check`: PASS; whitespace laporan untracked diperiksa terpisah,
  tanpa staging atau commit.
- 26 local file links beserta source anchors/ranges yang diperiksa: file ada,
  tidak ada line/range melampaui file. Verifikasi semantik tetap melalui source
  dan fixture, bukan hanya keberadaan link.
- Diff source/tests/config/lock/package/README/workflow kosong; status hanya
  docs/index.md modified dan laporan ini untracked. Semua laporan historis utuh.
- Branch dan HEAD tetap sama. Tidak ada commit/push/merge/publish/tag, perubahan
  Git identity, version bump, dependency installation, atau real-backend run.
