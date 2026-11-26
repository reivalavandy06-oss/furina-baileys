# Upgrade Notes — Branch Pengembangan

[Indeks](index.md) · [Auth Store](auth-stores.md) · [Audit kompatibilitas Fase 13.7](architecture/api-compatibility-audit.md)

Dokumen ini menjelaskan perubahan pada jalur rilis `1.7.0-furina` (termasuk
`1.7.0-furina-rc.2`). Isi branch pengembangan **belum tentu sama dengan package npm
`latest`**. Jangan menganggap fitur yang hanya ada di branch sudah tersedia dari npm
sampai rilis berikutnya dipublikasikan oleh maintainer. Nomor versi package tidak
diubah oleh dokumen ini.

## Node.js

Package membutuhkan **Node.js >= 22.0.0**. Node.js 20 sudah End-of-Life dan tidak
lagi didukung. Build CJS memuat shared `WAProto` yang berupa ESM, sehingga runtime
modern dengan dukungan `require(esm)` diperlukan.

## Panduan Migrasi Lengkap dari Upstream Baileys v6 ke v7 (`7.0.0-rc14`) & `1.7.0-furina`

Bagian ini merangkum perubahan yang perlu diperiksa saat memindahkan bot dari
upstream Baileys v6 ke jalur `7.0.0-rc14` / `1.7.0-furina`. Tidak semua perubahan
kompatibel secara otomatis; uji ulang pairing, penyimpanan sesi, dan alur pesan.

### ES Modules dan Node.js

- Gunakan **Node.js >= 22.0.0**. Node.js 20 sudah End-of-Life.
- Upstream v7 berorientasi ESM. Paket ini tetap menyediakan **dual CJS/ESM**:
  `lib/esm/package.json` bertipe `module`, `lib/cjs/package.json` bertipe
  `commonjs`, dan root package tidak dipaksa menjadi `"type": "module"`.
- `import` dan `require` sama-sama didukung. Jangan mencampur default export lama
  dengan named export baru; periksa ulang import `makeWASocket`, `proto`, dan
  helper Auth Store.

### LID (`@lid`) vs Phone Number (`@s.whatsapp.net`)

- Identitas tidak lagi selalu berupa phone-number JID. Kontak dapat memakai
  **LID** (`@lid`) atau **PN** (`@s.whatsapp.net`).
- Jangan membandingkan JID mentah untuk menentukan identitas yang sama. Gunakan
  helper JID dan resolver LID ↔ PN yang disediakan library.
- Mapping LID/PN disimpan di Auth State sebagai Signal key `lid-mapping`, dengan
  entri balik `_reverse`. Jangan menghapus, memfilter, atau memigrasikan key ini
  secara manual. Jika mapping hilang, sesi dapat gagal resolve kontak atau
  mengalami error pengiriman.
- Backend Auth Store harus mempertahankan seluruh key `lid-mapping` bersama
  `creds` dan Signal key lainnya.

### Struktur `WAProto`, `Long`, dan `whatsapp-rust-bridge`

- Field protobuf 64-bit dapat berupa `number` atau objek `Long`. Kode lama yang
  memanggil `.hydrate()` pada field tersebut harus diperbarui; gunakan helper
  `toNumber` atau API protobufjs yang sesuai. Jangan mengarang field baru.
- Package bergantung pada `whatsapp-rust-bridge` `0.5.5`. Bridge bersifat ESM-only,
  sehingga build CJS tidak memuatnya secara langsung; jalur LT hash tetap memakai
  implementasi JS yang kompatibel. Jangan mengubah algoritma atau format session
  Signal hanya untuk menghindari bridge.
- File generated `WAProto` tidak boleh diedit manual. Regenerasi memakai
  `yarn gen:protobuf` dan `proto-extract/`.

### Trusted Contact (TC) Token

- Token TC disimpan di Auth State sebagai Signal key `tctoken`, termasuk entry
  index internal. Token dapat diterbitkan ulang saat device identity berubah.
- Jangan menghapus key `tctoken` saat logout ringan, reconnect, atau migrasi.
  Hapus hanya jika pengguna memang mengakhiri sesi dan melakukan pairing ulang.
- Error 463 biasanya berarti akun dibatasi atau token TC untuk kontak tidak ada;
  jangan langsung menganggap sesi rusak.

### `printQRInTerminal`

- `printQRInTerminal` sudah deprecated dan tidak lagi mencetak QR secara otomatis.
- Tangani event `connection.update` sendiri: tampilkan `qr`, tangani `connection`
  `open`/`close`, lalu baca `lastDisconnect.error` untuk keputusan reconnect.

### Perbaikan keamanan GHSA-qvv5-jq5g-4cgg

- Advisory ini menyentuh validasi **placeholder resend** dan **app-state sync**.
- Placeholder resend hanya diminta untuk pesan unavailable yang memenuhi filter
  tipe dan batas umur (maksimum 14 hari).
- Verifikasi MAC app-state tersedia melalui `appStateMacVerification` untuk
  snapshot/patch. Jangan mematikan validasi tambahan tanpa memahami konsekuensi
  integritas state.

### Migrasi Auth Store

Wrapper berikut tetap mengembalikan `{ state, saveCreds }`:

```javascript
import {
  closeAuthState,
  makeWASocket,
  useMongoDBAuthState,
  useNekoDBAuth,
  useRedisAuthState,
  useSQLiteAuthState
} from '@vanzzz/furina-baileys'

// Library memiliki koneksi: tutup dengan closeAuthState.
const sqliteAuth = await useSQLiteAuthState('./', {
  path: './furina-auth.db',
  table: 'furina_auth'
})

// Wrapper Redis dan MongoDB juga memiliki koneksi internal.
const redisAuth = await useRedisAuthState({
  url: 'redis://127.0.0.1:6379',
  table: 'furina:auth'
})
const mongoAuth = await useMongoDBAuthState({
  url: 'mongodb://127.0.0.1:27017',
  database: 'furina',
  table: 'auth'
})

// NekoDB meminjam instance milik caller; caller yang menutup koneksi.
// const db = new NekoDB({ host, username, password })
const nekoAuth = await useNekoDBAuth(db, 'my_session')

const sock = makeWASocket({ auth: sqliteAuth.state })
sock.ev.on('creds.update', sqliteAuth.saveCreds)

try {
  // ...jalankan bot...
} finally {
  await sock.end()
  await closeAuthState(sqliteAuth)
  await closeAuthState(redisAuth)
  await closeAuthState(mongoAuth)
  // Jangan panggil closeAuthState(nekoAuth); tutup db milik caller.
}
```

- `closeAuthState` hanya untuk wrapper yang memiliki koneksi. Wrapper borrowed
  (`useNekoDBAuth`, `makeAuthStateFromStore`) ditolak.
- Migrasi/restore bersifat **best-effort dan non-atomic** kecuali backend
  menyediakan jaminan lebih kuat. Hentikan writer, backup source dan destination,
  lalu lakukan cutover eksplisit.
- Jangan menganggap `sock.end()` menunggu `saveCreds` atau menutup Auth Store.
- Jangan memakai satu koleksi/tabel/folder bersama tanpa namespace yang jelas.

## Auth State wrapper

Wrapper `useSQLiteAuthState`, `useRedisAuthState`, dan `useMongoDBAuthState`
kembali ke bentuk historis:

```javascript
const auth = await useSQLiteAuthState('./')
const { state, saveCreds } = auth
```

`Object.keys(auth)` berisi `state` dan `saveCreds` saja. `close` **tidak** menjadi
field enumerable dan tidak muncul pada tipe return default. Untuk resource yang
dimiliki library, gunakan helper additive:

```javascript
const { closeAuthState } = require('@vanzzz/furina-baileys')

try {
  await saveCreds()
} finally {
  await closeAuthState(auth)
}
```

`closeAuthState` menunggu operasi get/set/save yang sudah admitted, menolak operasi
baru, dan menutup resource satu kali. Repeated/concurrent close berbagi Promise yang
sama. Helper ini menolak wrapper borrowed (`useNekoDBAuth`, `makeAuthStateFromStore`)
karena resource tersebut milik caller. Timeout bukan cancellation: jika driver
hang, close tetap pending dan resource tidak boleh dianggap sudah tertutup.

Kode lama yang hanya melakukan destructuring `{ state, saveCreds }`, membandingkan
`Object.keys`, atau mengganti fungsi wrapper dengan tipe return lama tetap valid.
Kode yang sebelumnya mengharapkan field `close` harus beralih ke `closeAuthState`.
Metadata `Record<keyof AuthStore, ...>` yang menghitung semua key perlu menambahkan
`compareAndSet`; implementasi adapter tidak wajib menyediakannya.

## SQLite compareAndSet

`createSQLiteAuthStore` tetap menyediakan optional `compareAndSet`. Hasilnya:

- `true`: conditional UPDATE/DELETE cocok dan diterapkan.
- `false`: kondisi tidak cocok dan tidak ada mutasi.
- Rejection: operasi gagal atau hasil tidak dapat dipastikan.

Driver structural yang mengembalikan `void` dari `run()` sekarang memakai
`SELECT changes()` untuk menentukan hasil. Jika driver tidak menyediakan hasil
`changes` yang dapat diandalkan, `compareAndSet` **tidak diekspos**; recovery
memakai fallback read-before-restore yang non-atomic dan membutuhkan akses
eksklusif. Driver async tidak didukung untuk CAS karena `changes()` harus dibaca
pada koneksi yang sama secara sinkron.

## Missing data dan storage error

Hanya data yang benar-benar tidak ada yang diperlakukan sebagai missing. ENOENT
pada file store, `null` pada record API, dan key yang tidak ditemukan tetap
menghasilkan absent. Permission/IO/timeout, JSON malformed, tipe record salah, dan
storage read failure diteruskan sebagai rejection. Credentials yang rusak tidak
diganti diam-diam dengan sesi baru.

Signal session read/deserialization failure juga diteruskan. Aplikasi harus
menangkap error tersebut dan tidak menghapus session atau memulai pairing ulang
hanya karena storage gagal dibaca.

## Migrasi dan restore

Error setelah mutation dapat berupa `Boom` 500 dengan `cause` original dan
`data.phase`, `rollbackAttempted`, `rollbackErrors`, `rollbackConflicts`,
`conditionalRecovery`, `progressErrors`, serta `destinationMayBePartial`. Error
sebelum mutation dapat berupa error driver asli atau validation `Boom` 400. Jangan
mengandalkan satu class error untuk semua tahap.

Recovery tetap **best-effort dan non-atomic** kecuali backend memberikan jaminan
yang lebih kuat. Fallback tanpa CAS memiliki TOCTOU; value-CAS bukan version-CAS
dan tidak mendeteksi ABA. Tidak ada durable journal, completion marker, atau
automatic crash resume. Hentikan writer, gunakan akses eksklusif/offline, simpan
source dan backup destination, lalu lakukan cutover eksplisit.

## Ownership

- Wrapper SQLite/Redis/MongoDB memiliki koneksi internal; tutup dengan
  `closeAuthState`.
- `useNekoDBAuth` dan `makeAuthStateFromStore` meminjam store/client; caller yang
  menutupnya.
- Raw SQLite/NekoDB tidak menutup client.
- Raw Mongo hanya menutup callback `close` yang diberikan caller.
- Raw Redis mempertahankan legacy `close → quit`; gunakan
  `{ ownership: 'borrowed' }` untuk client bersama.
- `sock.end()` tidak menunggu `saveCreds` atau menutup AuthStore milik aplikasi.

## Public export

`__setAuthModuleLoader` adalah test seam internal. Simbol ini tidak pernah menjadi
bagian package `1.6.0-furina` dan sekarang tidak lagi diekspor dari root barrel.
Akses internal tetap tersedia bagi unit test melalui modul
`src/Utils/auth/nekodb-auth.ts`. Jangan mengandalkannya sebagai API publik.

## Deklarasi TypeScript

`URLGenerationOptions.fetchOpts.headers` memakai type structural, bukan alias DOM
`HeadersInit`. Ini membuat deklarasi publik tetap dapat dikompilasi dengan `lib`
Node saja. Consumer yang mengirim objek `Headers` (DOM atau undici), `HeadersInit`,
array tuple, atau record header tetap diterima. Fixture eksternal dengan
`lib: ["ES2022"]` ver NodeNext lulus.

`@types/ws` dipindahkan dari `devDependencies` ke `dependencies`. Deklarasi
publik `WebSocketClient` mengacu pada type `ws`, sehingga consumer TypeScript
dengan install produksi membutuhkan type tersebut saat memeriksa `.d.ts`.
Perubahan ini memindahkan paket type yang sudah terpasang di repo dari scope dev
ke scope produksi; tidak ada dependency runtime atau driver DB baru.

## Verifikasi backend

Fase 13.8 memakai driver doubles untuk lifecycle, CAS, recovery, dan tipe publik.
Fase 13.12 memverifikasi SQLite native melalui `better-sqlite3`, termasuk
conditional write, fallback `SELECT changes()`, dan close wrapper. Redis,
MongoDB, dan NekoDB tetap **NOT RUN** tanpa instance test terisolasi; suite
MongoDB dan workflow integrasi sudah tersedia untuk environment yang
menyediakannya. Jangan menyebut backend tersebut production-verified hanya
karena test doubles lulus.
