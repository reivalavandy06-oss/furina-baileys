# Audit Arsitektur & Roadmap Reliabilitas — Fase 12

[Indeks dokumentasi](index.md) · [Auth Store](auth-stores.md) · [README](../README.md)

**Status: audit dan usulan; belum ada implementasi Fase 12.**
Audit dilakukan pada source lokal setelah Fase 11, baseline commit `560a8c4`,
pada 2026-11-17. Acuan kerja: [AGENTS.md](../AGENTS.md),
[CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md), dan [SECURITY.md](../SECURITY.md).
Temuan di bawah berasal dari pembacaan source dan test, bukan pengujian terhadap
server WhatsApp atau database produksi. Cakupan klaim adalah fork ini; tidak
mengasumsikan perilaku versi upstream lain.

## Ringkasan gap analysis

| Area | Yang sudah tersedia | Gap yang perlu dipertimbangkan |
|---|---|---|
| Group Cache | Hook `cachedGroupMetadata`, opsi bypass cache pada relay, fallback query metadata, primitif LRU | Helper cache metadata dengan batas kapasitas, TTL, deduplikasi fetch, invalidasi, dan cleanup |
| Error System | `DisconnectReason`, `NACK_REASONS`, `SERVER_ERROR_CODES`, klasifikasi Stability, tipe `FurinaErrorEvent` | Normalisasi dan kode operasional lintas modul yang konsisten, tanpa mengganti kode protokol/Boom |
| Graceful Shutdown | `sock.end()`, hook akhir socket, penutupan WebSocket, `ev.destroy()`, beberapa `dispose()` dan `AuthStore.close?()` | Orkestrasi drain pekerjaan, penyimpanan auth terakhir, kepemilikan DB, dan batas waktu shutdown |
| Message Queue | FIFO stanza offline, mutex message/receipt/notification, EventBuffer, `PQueue` untuk auth | Antrean handler aplikasi yang opt-in, terbatas, per-chat, dengan drain dan kebijakan overflow |
| Fault Injection | Mock client, simulasi handler gagal/disconnect, dan helper kegagalan verifikasi migrasi | Harness kegagalan deterministik yang dapat digunakan ulang serta skenario partial-write/timeout/drain |

**Koreksi terhadap inspeksi awal:** tidak tepat menyimpulkan bahwa cache grup,
error terstruktur, antrean masuk, dan cleanup sama sekali belum ada. Fasilitasnya
sudah ada dalam lingkup tertentu. Roadmap harus melengkapi celahnya, bukan membuat
ulang seluruh subsistem.

## Existing Features

### 1. Metadata grup: hook cache sudah digunakan oleh jalur kirim

- [`src/Socket/groups.ts`](../src/Socket/groups.ts), `groupMetadata`, memang
  melakukan query `w:g2` langsung setiap dipanggil. Fungsi ini sendiri tidak
  menyimpan hasilnya.
- [`src/Types/Socket.ts`](../src/Types/Socket.ts), `SocketConfig.cachedGroupMetadata`,
  menyediakan callback `(jid) => Promise<GroupMetadata | undefined>`. Default di
  [`src/Defaults/index.ts`](../src/Defaults/index.ts) mengembalikan `undefined`.
- [`src/Socket/messages-send.ts`](../src/Socket/messages-send.ts), `relayMessage`,
  mencoba callback tersebut ketika cache diizinkan. Metadata dengan array
  `participants` digunakan; jika tidak tersedia, jalur grup memanggil
  `groupMetadata(jid)`. `MessageRelayOptions.useCachedGroupMetadata` di
  [`src/Types/Message.ts`](../src/Types/Message.ts) menyediakan bypass; status
  broadcast menonaktifkan jalur cache ini.
- [`src/Utils/process-message.ts`](../src/Utils/process-message.ts) mengeluarkan
  `groups.update` dan `group-participants.update`. `groupFetchAllParticipating`
  juga mengeluarkan `groups.update`. Ini titik integrasi invalidasi yang sudah ada.
- [`src/Utils/cache-store.ts`](../src/Utils/cache-store.ts), `LRUCacheStore`,
  menerima `max` dan `ttl`. **TTL wrapper ini dalam detik**, dikalikan 1000
  sebelum diteruskan ke `lru-cache`; implementasinya memakai `ttlAutopurge: true`.

Artinya, pengguna sudah dapat memasang cache sendiri tanpa mengubah protokol.
Yang belum ditemukan adalah helper metadata grup yang mengelola semua kebijakan
cache tersebut secara terpadu. Fallback query saat cache miss juga belum menulis
balik melalui suatu kontrak cache bawaan.

### 2. Error: sudah ada kode dan klasifikasi selain Boom

| Komponen | Bukti dan batas cakupan |
|---|---|
| `DisconnectReason` | Enum publik di [`src/Types/index.ts`](../src/Types/index.ts): disconnect, timeout, logged out, restart, dan sebagainya |
| `NACK_REASONS` | Kode client → server di [`src/Utils/decode-wa-message.ts`](../src/Utils/decode-wa-message.ts) |
| `SERVER_ERROR_CODES` | Kode server → client di file yang sama, dipakai penanganan ACK pada `messages-recv.ts` |
| `getErrorCodeFromStreamError` | [`src/Utils/generics.ts`](../src/Utils/generics.ts) memetakan stanza stream error menjadi `reason` dan `statusCode` |
| Stability types | [`src/Utils/stability/types.ts`](../src/Utils/stability/types.ts) mendefinisikan `FurinaErrorCategory`, `FurinaErrorEvent`, dan `DisconnectInfo` |
| Recovery classification | [`src/Utils/stability/connection.ts`](../src/Utils/stability/connection.ts), `ConnectionHandler.getDisconnectInfo`, mengembalikan pesan, `isRecoverable`, dan `requiresReauth` berdasarkan kode |

Tipe `FurinaErrorEvent` sudah dideklarasikan, tetapi pencarian pada `src/` hanya
menemukan deklarasinya; belum ditemukan pipeline runtime yang mengeluarkan
envelope ini secara konsisten. Banyak jalur tetap memakai Boom atau Error biasa.
Konsumen sudah bisa bercabang berdasarkan kode yang tersedia; tidak benar bahwa
semua error harus dikenali melalui pencocokan string.

### 3. Shutdown: cleanup socket sudah cukup luas, koordinasi DB belum ada

[`src/Socket/socket.ts`](../src/Socket/socket.ts) mengekspos `end` dan
`registerSocketEndHandler`. `end(error)`:

1. Memakai guard `closed` agar cleanup tidak dijalankan ulang.
2. Membersihkan timer keep-alive dan QR serta beberapa listener WebSocket.
3. Memanggil `signalRepository.close?.()` dan menunggu `ws.close()` bila perlu.
4. Menunggu handler yang terdaftar melalui `registerSocketEndHandler`.
5. Mengeluarkan `connection.update` dengan status `close`, lalu menjalankan
   `ev.destroy()`.

`end(undefined)` dapat digunakan untuk menutup koneksi biasa. **`logout()` berbeda**:
ia mengirim permintaan `remove-companion-device`, sehingga bukan padanan shutdown
yang mempertahankan sesi. [`WebSocketClient.close()`](../src/Socket/Client/websocket.ts)
menunggu event `close`; belum ada deadline lokal dalam method itu.

[`EventBuffer.destroy()`](../src/Utils/event-buffer.ts) membersihkan timer yang
disimpan, data buffer, history cache, dan listener. Penghancuran buffer tersebut
tidak sama dengan menunggu handler aplikasi async selesai atau mengirim semua
event yang masih tertahan. Lapisan chats/send/recv juga mendaftarkan cleanup cache
melalui hook akhir socket.

Pada sisi storage:

- [`AuthStore`](../src/Types/Auth.ts) memiliki `close?(): Promise<void>`, tetapi
  tidak memiliki kontrak `drain`/`flush` terpisah.
- Factory Mongo menerima callback close, dan factory Redis memanggil `quit()`;
  factory SQLite tidak menyediakan close handle pada store.
- [`createNekoDBAuthStore`](../src/Utils/auth/nekodb-auth.ts) menerima client milik
  pengguna dan sengaja tidak menutupnya.
- [`makeAuthStateFromStore`](../src/Utils/auth-store.ts) hanya mengembalikan
  `{ state, saveCreds }`, bukan handle lifecycle store. `useSQLiteAuthState`,
  `useMongoDBAuthState`, dan `useRedisAuthState` meneruskan bentuk hasil ini.
  `makeWASocket({ auth: state })` tidak otomatis menerima pemilik koneksi DB.

CRM/broadcast dan [`MessageScheduler`](../src/Utils/scheduler.ts) punya cleanup
lokal. Sebaliknya, [`StabilityManager`](../src/Utils/stability/manager.ts)
mendaftarkan dua listener anonim dalam constructor tanpa `dispose()` per
instance. Membuang atau mengganti manager pada socket yang masih hidup berisiko
menyisakan handler. **Ini bukan bukti listener selalu bocor sesudah socket
ditutup**, sebab `end()` memanggil `ev.destroy()`. Stability juga hanya menghitung
reconnect delay; aplikasi pengguna tetap menjadwalkan socket berikutnya.

### 4. Pesan masuk: sudah ada antrean offline dan serialisasi core

Ada tiga mekanisme yang harus dibedakan:

1. **FIFO stanza offline.**
   [`makeOfflineNodeProcessor`](../src/Utils/offline-node-processor.ts) menyimpan
   node dalam array, memproses berurutan, menangkap rejection handler, dan yield
   setiap batch (default 10). Loop berjalan selama WebSocket terbuka.
   [`messages-recv.ts`](../src/Socket/messages-recv.ts), `processNode`, mengirim
   node dengan `attrs.offline` ke antrean ini; cakupannya message, receipt,
   notification, dan call.
2. **Mutex core.**
   [`chats.ts`](../src/Socket/chats.ts) membuat `messageMutex`, `receiptMutex`,
   `notificationMutex`, dan `appStatePatchMutex` menggunakan
   [`makeMutex`](../src/Utils/make-mutex.ts). `handleMessage` pada `messages-recv.ts`
   memakai `messageMutex` untuk decrypt dan pemrosesan berikutnya; receipt dan
   notification memakai mutex masing-masing. Beberapa pekerjaan, termasuk
   penanganan mapping identitas sebelum mutex, berada di luar critical section.
3. **EventBuffer.**
   [`makeEventBuffer`](../src/Utils/event-buffer.ts) menggabungkan dan menunda event.
   Penggunaannya bukan hanya saat startup: `processNodeWithBuffer` juga membungkus
   pemrosesan node online. `flush()` memancarkan event, bukan menunggu seluruh
   Promise milik subscriber aplikasi.

`PQueue` sudah digunakan untuk pre-key/transaction di
[`pre-key-manager.ts`](../src/Utils/pre-key-manager.ts) dan
[`auth-utils.ts`](../src/Utils/auth-utils.ts). `addTransactionCapability` serta
`makeCacheableSignalKeyStore` tetap menjadi dasar transaksi/cache Signal.
Scheduler dan broadcast mengelola pekerjaan keluar, bukan antrean handler
aplikasi yang menerima `messages.upsert`.

### 5. Fault Injection: pengujian kegagalan parsial sudah tersedia

- [`offline-node-processor.test.ts`](../src/__tests__/Utils/offline-node-processor.test.ts)
  menguji handler rejection, tipe node tidak dikenal, socket menutup, FIFO,
  yield batch, dan guard pemrosesan serentak menggunakan dependency palsu.
- [`auth/mock-stores.ts`](../src/__tests__/Utils/auth/mock-stores.ts) menyediakan
  `withFailingGetMany`, dipakai oleh
  [`migration-manager.test.ts`](../src/__tests__/Utils/auth/migration-manager.test.ts)
  untuk memicu mismatch verifikasi dan kegagalan rollback.
- Mock driver pada conformance/backup tests memisahkan pengujian dari server DB.

Belum ditemukan controller fault injection terpadu pada runtime. Adanya mock dan
skenario kegagalan di atas tetap perlu diakui: pekerjaan berikutnya dapat
memperluas fondasi test ini tanpa menambahkan sakelar kegagalan ke library produksi.

## Missing Features

### M1 — Pengelola cache metadata grup

Yang masih dibutuhkan: cache instance-scoped dengan batas ukuran, TTL yang jelas,
deduplikasi fetch serentak, invalidasi peserta/metadata, dan dispose. Integrasi
awal memakai **hook `cachedGroupMetadata` yang sudah tersedia**. Tidak diperlukan
konfigurasi cache kedua atau penggantian perilaku `groupMetadata()` langsung.

### M2 — Normalisasi error operasional lintas modul

Tambahan yang relevan adalah kode untuk operasi baru (misalnya queue penuh atau
shutdown timeout), metadata operasi, dan normalizer error yang konsisten. Jangan
membuat ulang `DisconnectReason` atau menyamakan kode NACK dengan ACK server hanya
karena nilainya sama. Tipe Stability yang sudah ada harus dievaluasi untuk dipakai
ulang sebelum membuat hierarki error baru.

### M3 — Lifecycle aplikasi dan storage yang terkoordinasi

Belum ada satu controller yang dapat menolak pekerjaan baru, menghentikan sumber
pekerjaan, menunggu pekerjaan aktif, menyelesaikan write auth terakhir, menutup
socket, lalu menutup koneksi yang memang dimilikinya dengan deadline.
Event `creds.update` tidak otomatis menunggu Promise `saveCreds` pengguna.
Cleanup manager dan ownership DB harus eksplisit; `clear()` bukan operasi shutdown.

### M4 — Queue aplikasi terbatas dan penguatan queue offline

Antrean offline saat ini hanya mengekspos `enqueue`; tidak ada batas panjang,
`drain`, cancel/dispose, atau kebijakan overload. Bila socket menutup, sisa node
tetap berada di array; pemrosesan dapat mulai lagi saat ada enqueue baru ketika
socket terbuka. Batch size mengatur yield, **bukan batas kapasitas**.

Di lapisan aplikasi belum ada helper opt-in yang membatasi jumlah handler
`messages.upsert` aktif, menjaga urutan per-chat, dan melaporkan overflow atau
drain. Queue aplikasi ini berbeda dari serialisasi dekripsi core dan tidak boleh
menggantikannya.

### M5 — Matriks fault injection yang dapat direproduksi

Dibutuhkan helper test untuk delay, reject pada operasi ke-N, partial write,
disconnect saat tugas aktif, dan dependency yang tidak pernah selesai. Gunakan
fixture sintetis dan fake timers; skenario harus deterministik.

Prioritas kasus berasal dari source saat ini:

- [`migration-manager.ts`](../src/Utils/auth/migration-manager.ts) mencapai blok
  rollback ketika pembacaan verifikasi berhasil tetapi nilainya berbeda.
  Rejection dari `setMany()` atau `getMany()` verifikasi terjadi sebelum blok
  rollback itu; partial-write failure perlu skenario khusus.
- [`makeCacheableSignalKeyStore`](../src/Utils/auth-utils.ts) memperbarui cache
  sebelum `await store.set(data)`. Jika persistensi menolak, perlu diuji apakah
  pembacaan berikutnya melihat data yang belum tersimpan.
- `StabilityManager` perlu skenario attach/dispose saat socket masih hidup;
  queue offline perlu skenario dependency rejection di luar handler dan penutupan
  saat backlog belum kosong.

Ini temuan alur kode dan target uji berikutnya, bukan klaim bahwa semua skenario
tersebut sudah direproduksi atau diperbaiki pada Fase 12.

## Technical Risks

| Risiko | Dampak | Batas desain yang disarankan |
|---|---|---|
| Cache peserta basi | Jalur kirim memakai daftar peserta/addressing mode yang lama | Invalidasi `group-participants.update` dan `groups.update`; TTL sebagai fallback; tetap sediakan bypass cache |
| Fetch selesai sesudah invalidasi | Respons lama mengisi ulang cache yang sudah dibuang | Generation token atau penanda invalidasi untuk hasil in-flight; buang Promise yang selesai/gagal dari registry |
| Event grup hanya partial | Menimpa metadata lengkap dengan patch dapat menghilangkan peserta | Utamakan invalidasi dan fetch ulang; hanya merge field jika kontrak patch terbukti |
| Duplikasi cache pengguna | Callback atau cache milik pengguna tertimpa tanpa sengaja | Opt-in, precedence eksplisit, jangan memodifikasi callback/config pengguna secara diam-diam |
| LID/PN dan lintas akun | Kunci queue/cache dapat memisahkan identitas yang sama atau mencampur sesi | Scope per socket/account, gunakan helper JID; `jidNormalizedUser` tidak otomatis memetakan PN ke LID |
| TTL/unit dan timer cache | Salah satuan mengubah masa berlaku; registry in-flight dapat tumbuh | Sesuaikan TTL detik pada `LRUCacheStore`, pasang `max`, hindari interval baru, uji cleanup |
| Error compatibility | Konsumen lama bergantung pada `error.output.statusCode` | Pertahankan Boom/kode asli/cause; kode operasi baru additive dan tidak menimpa `data` lama |
| Reconnect setelah shutdown disengaja | Handler pengguna membuka socket lagi | State shutdown milik aplikasi harus disetel sebelum penutupan; jangan menghapus listener pengguna agar reconnect berhenti |
| DB ditutup sebelum write selesai | Creds/Signal keys gagal tersimpan | Drain yang benar-benar di-await; DB ditutup setelah operasi produsen berhenti dan persistence selesai; bedakan handle shared vs owned |
| Shutdown tidak selesai | `ws.close()`, handler akhir, atau DB dapat tidak merespons | Deadline dan hasil cleanup terperinci; timeout Promise bukan pembatalan I/O; jangan klaim drain sukses bila belum selesai |
| Dua panggilan `end()` bersamaan | Guard `closed` membuat panggilan kedua kembali sebelum cleanup pertama selesai | Controller perlu membagikan satu Promise shutdown; evaluasi hook core sebelum menambah mekanisme lain |
| Mengantrekan stanza sebelum ACK/decrypt | Retry storm, urutan Signal berubah, deadlock mutex | Mulai queue aplikasi setelah event publik; perubahan queue protokol ditangani terpisah dengan test binary node |
| Async EventEmitter tanpa backpressure | Mengembalikan Promise dari listener tidak menghentikan producer | Batas queue dan kebijakan overflow eksplisit; jangan menjanjikan backpressure jaringan atau exactly-once |
| Handler dipanggil dua kali | Pengguna memasang listener langsung dan helper queue untuk pekerjaan sama | Queue memproses callback yang didaftarkan kepadanya saja; dokumentasikan pola pemasangan dan dispose |
| Retry handler berefek samping | Balasan/pembayaran/operasi aplikasi bisa berulang | Jangan retry otomatis secara default; kebijakan idempotensi dan deduplikasi harus dipilih aplikasi |
| Fault injection ikut runtime | Gangguan sintetis aktif pada bot produksi | Tempatkan harness di `src/__tests__/`, tanpa export produksi atau aktivasi melalui environment |
| Persistence saat backup/migrasi | Snapshot berubah selama aplikasi menulis | Tetapkan precondition quiescence; gunakan `BufferJSON` untuk fixture/record persistence dan jangan mengganti transaksi Signal |

## File-Level Plan

Semua path berikut adalah **rencana setelah persetujuan**, bukan file yang sudah
dibuat pada fase audit. Perubahan public API harus additive, memakai dependensi
yang sudah ada, dan tidak mengubah API/perilaku `useMultiFileAuthState`.

### A. Fondasi fault injection dan regression coverage

| Aksi | File | Tujuan |
|---|---|---|
| Baru | `src/__tests__/TestUtils/fault-injection.ts` | Helper kegagalan deterministik yang scoped per test; tidak di-export dari package |
| Ubah | `src/__tests__/Utils/auth/mock-stores.ts`, `src/__tests__/Utils/auth/migration-manager.test.ts` | Partial write, read rejection, rollback gagal, dan preserved target state |
| Ubah | `src/__tests__/Utils/auth-utils.test.ts` | Perilaku cache setelah persistensi gagal tanpa membuat transaksi/cache alternatif |
| Ubah | `src/__tests__/Utils/offline-node-processor.test.ts` | Backlog, close saat aktif, dependency rejection, dan pemulihan loop |
| Bersyarat | `src/Utils/auth/migration-manager.ts`, `src/Utils/auth-utils.ts` | Hanya perbaikan minimal setelah regression test membuktikan kasus; crypto/auth perlu koordinasi sesuai AGENTS.md |

### B. Helper Group Cache di atas hook core

| Aksi | File | Tujuan |
|---|---|---|
| Baru | `src/Utils/group-metadata-cache.ts` | Helper instance-scoped dengan loader yang diinjeksi, LRU/TTL, deduplikasi fetch, invalidasi, dispose |
| Baru | `src/__tests__/Utils/group-metadata-cache.test.ts` | Cache hit/miss, TTL, max entries, partial group update, participant update, invalidasi ketika fetch masih aktif |
| Ubah | `src/Utils/index.ts`, `docs/utilities.md`, `README.md`, `.github/README.md` | Export dan contoh opt-in melalui `cachedGroupMetadata` |

`src/Socket/groups.ts`, `src/Socket/messages-send.ts`, dan `src/Types/Socket.ts`
tidak memerlukan perubahan awal: hook dan bypass sudah tersedia. Bila integrasi
lebih dalam ternyata dibutuhkan, evaluasi terpisah sebelum mengubah jalur relay.

### C. Penyatuan error secara additive

| Aksi | File | Tujuan |
|---|---|---|
| Baru | `src/Utils/errors.ts` | Normalizer dan kode untuk operasi reliabilitas baru; mempertahankan Boom, status protokol, dan cause |
| Baru | `src/__tests__/Utils/errors.test.ts` | Boom/Error/unknown input, kode numerik/string, cause, dan kompatibilitas `output.statusCode` |
| Ubah | `src/Utils/index.ts`, `docs/api-reference.md`, `docs/utilities.md` | Export dan aturan pemakaian kode operasi |
| Bersyarat | `src/Utils/stability/types.ts`, `src/Utils/stability/index.ts` | Gunakan kembali kategori/envelope; hanya perubahan additive yang terbukti perlu |

Tidak merencanakan penggantian massal call site Boom atau enum protokol. Hindari
`src/Types/Errors.ts` baru jika tipe Stability yang ada sudah cukup.

### D. Queue handler aplikasi opt-in

| Aksi | File | Tujuan |
|---|---|---|
| Baru | `src/Utils/message-queue.ts` | Helper berbasis `PQueue`/mutex yang sudah ada: batas pending, urutan per-chat, pause/drain/dispose |
| Baru | `src/__tests__/Utils/message-queue.test.ts` | Urutan satu chat, concurrency lintas chat, overflow, handler gagal, dispose, dan drain timeout |
| Ubah | `src/Utils/index.ts`, `docs/utilities.md`, `README.md`, `.github/README.md` | Export dan contoh listener opt-in, termasuk pencegahan pemrosesan ganda |
| Bersyarat, terpisah | `src/Utils/offline-node-processor.ts`, `src/Socket/messages-recv.ts` | Penguatan bounded backlog/lifecycle queue offline setelah kebijakan ACK dan overflow disepakati |

Tidak memasukkan queue aplikasi ke jalur decrypt/ACK atau mengganti mutex core.
Retry, dead-letter persistence, dan jaminan delivery tidak otomatis menjadi bagian
dari versi pertama; tetapkan kontraknya sebelum implementasi.

### E. Graceful Shutdown sebagai orkestrator ownership

| Aksi | File | Tujuan |
|---|---|---|
| Baru | `src/Utils/graceful-shutdown.ts` | Controller dengan satu Promise bersama, deadline, hook stop/drain/save/close eksplisit, tanpa `process.exit()` otomatis |
| Baru | `src/__tests__/Utils/graceful-shutdown.test.ts` | Urutan cleanup, double shutdown, write yang masih aktif, close menggantung, kegagalan salah satu resource, shared DB |
| Ubah | `src/Utils/stability/manager.ts` | Simpan handler sebagai field dan tambahkan dispose instance-scoped/idempoten |
| Baru | `src/__tests__/Utils/stability-manager-lifecycle.test.ts` | Attach/dispose berulang dan pembuktian listener pengguna tetap hidup |
| Ubah | `src/Utils/index.ts`, `docs/stability.md`, `docs/auth-stores.md`, `README.md`, `.github/README.md` | Export, ownership DB, saveCreds, dan contoh shutdown yang mempertahankan sesi |
| Bersyarat | `src/Socket/index.ts`, `src/Socket/socket.ts`, `src/Utils/auth-store.ts` | Integrasi disposal manager/hook akhir atau akses lifecycle DB hanya jika adapter eksternal tidak memadai; hindari pengubahan return shape lama |

Controller harus menerima callback close DB secara eksplisit jika store tidak
mempunyai handle lifecycle. Registrasi signal proses menjadi pilihan aplikasi,
bukan efek samping import library. Gunakan `sock.end(undefined)` sebagai primitif
penutupan, bukan `logout()`.

## Urutan dan kriteria penerimaan roadmap

1. **Fault injection test dan kontrak lifecycle terlebih dahulu.** Reproduksi
   kegagalan yang akan diperbaiki; regression test harus gagal sebelum fix dan
   lulus sesudahnya sesuai AGENTS.md.
2. **Group Cache dan normalisasi error.** Integrasikan fasilitas core yang sudah
   ada, dengan test TTL/invalidation dan kompatibilitas statusCode.
3. **Queue aplikasi dan batas overload.** Setujui ordering, batas pending, perilaku
   overflow, dan drain sebelum menghubungkannya dengan shutdown.
4. **Orkestrator shutdown.** Integrasikan drain/ownership yang sudah didefinisikan;
   uji race dengan disconnect/reconnect dan write terakhir.

Seluruh test memakai mock, fake timers, dan fixture sintetis. Runtime helper baru
harus memiliki cleanup instance-scoped, tidak menghapus listener pengguna, dan
tidak menambah dependensi wajib. Sebelum merge implementasi, jalankan type-check,
lint, suite yang relevan beserta suite penuh, build CJS/ESM, smoke test export,
dan `npm run check:docs`.

**Batas Fase 12:** hanya dokumentasi audit/roadmap. Tidak ada implementasi cache,
error system, shutdown, queue, ataupun fault injection baru dalam perubahan ini.
