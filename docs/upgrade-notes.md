# Upgrade Notes — Branch Pengembangan

[Indeks](index.md) · [Auth Store](auth-stores.md) · [Audit kompatibilitas Fase 13.7](architecture/api-compatibility-audit.md)

Dokumen ini menjelaskan perubahan pada branch `feat/reliability-audit`. Branch ini
**belum tentu sama dengan package npm `latest`** (`1.6.0-furina`). Jangan menganggap
fitur yang hanya ada di branch sudah tersedia dari npm sampai rilis berikutnya
dipublikasikan oleh maintainer. Nomor versi package tidak diubah oleh dokumen ini.

## Node.js

Package sekarang membutuhkan **Node.js `^20.19.0 || >=22.12.0`**. Build CJS memuat
shared `WAProto` yang berupa ESM, sehingga bergantung pada `require(esm)` dan
module syntax detection yang aktif secara default mulai Node 20.19 dan 22.12.
Node 21 dan Node 22.0–22.11 tidak termasuk range yang didukung.

Hasil pengujian Fase 13.8: Node 20.20.2 dan 22.23.5 lulus CJS/ESM. Binary Node
20.19.0 dan 20.0.0 tidak tersedia, jadi versi exact tersebut **NOT RUN**. Node 20.0
sampai 20.18 tidak memiliki loader default yang dibutuhkan dan tidak didukung.

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
`better-sqlite3`, `redis`, `mongodb`, dan `@nekodb/client` tidak tersedia pada
lingkungan validasi; native driver behavior, durability, reconnect, dan close
nyata **NOT RUN**. Jangan menyebut backend tersebut production-verified hanya
karena test doubles lulus.
