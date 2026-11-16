Multi-Backend Auth Store

Simpan auth state di file, SQLite, MongoDB, Redis, atau NekoDB lewat satu kontrak `AuthStore`.

[Dokumentasi utama](../README.md) · **Navigasi docs:** [beranda](index.md)

---

## 🗄️ Multi-Backend Auth Store

Secara default `useMultiFileAuthState` menyimpan state ke folder lokal. Untuk
produksi, `src/Utils/auth-store.ts` menyediakan kontrak `AuthStore` dan beberapa
backend yang mengembalikan **bentuk keluaran yang identik**:
`{ state, saveCreds }`.

Semua backend jaringan/DB adalah **peer dependency opsional** dan dimuat lewat
dynamic import — install biasa **tidak** menariknya masuk.

### Kontrak `AuthStore`

```typescript
interface AuthStore {
	readonly backend: string
	get(key: string): Promise<string | null>
	getMany(keys: string[]): Promise<Record<string, string>>
	set(key: string, value: string): Promise<void>
	setMany(entries: Record<string, string>): Promise<void>
	remove(key: string): Promise<boolean>
	keys(): Promise<string[]>
	clear?(): Promise<void>
	close?(): Promise<void>
}
```

### File (bawaan, tanpa dependensi tambahan)

```javascript
const { useMultiFileAuthState } = require('@vanzzz/furina-baileys')
const { state, saveCreds } = await useMultiFileAuthState('./auth_info')
```

`createFileAuthStore(folder)` juga tersedia bila Anda ingin memakai backend file
secara eksplisit lewat kontrak `AuthStore`.

### SQLite

Install peer dependency:

```bash
npm install better-sqlite3
```

```javascript
const { useSQLiteAuthState } = require('@vanzzz/furina-baileys')

const { state, saveCreds } = await useSQLiteAuthState('./', {
  path: './furina-auth.db',
  table: 'furina_auth'
})
```

### MongoDB

```bash
npm install mongodb
```

```javascript
const { useMongoDBAuthState } = require('@vanzzz/furina-baileys')

const { state, saveCreds } = await useMongoDBAuthState({
  url: 'mongodb://127.0.0.1:27017',
  database: 'furina',
  table: 'auth'
})
```

### Redis

```bash
npm install redis
```

```javascript
const { useRedisAuthState } = require('@vanzzz/furina-baileys')

const { state, saveCreds } = await useRedisAuthState({
  url: 'redis://127.0.0.1:6379',
  table: 'furina:auth'
})
```

`table` dipakai sebagai **prefix key** untuk Redis (default `furina:auth`).

### NekoDB

Install peer dependency:

```bash
npm install @nekodb/client
```

`useNekoDBAuth(db)` menerima instance yang **sudah Anda inisialisasi** —
kredensial, cara koneksi, dan penutupan koneksi tetap di tangan Anda.

#### Ambil kredensial NekoDB

| Nilai | Di mana mendapatkannya |
|---|---|
| `host` | Endpoint cluster NekoDB Anda (mis. `cluster.example.com`) |
| `username` | User database yang Anda buat di dashboard NekoDB |
| `password` | Password user tersebut |

Alternatifnya, `NekoDB.fromEnv()` membaca `NEKODB_HOST`, `NEKODB_USERNAME`, dan
`NEKODB_PASSWORD` dari environment variable — lebih aman daripada hardcode.

#### Cara pakai

```javascript
const { makeWASocket, useNekoDBAuth } = require('@vanzzz/furina-baileys')
const NekoDB = require('@nekodb/client')

const db = new NekoDB({
  host: 'cluster.example.com',
  username: 'furina',
  password: process.env.NEKODB_PASSWORD,
  logging: 'warn'
})

const { state, saveCreds } = await useNekoDBAuth(db, 'my_session')

const sock = makeWASocket({ auth: state })
sock.ev.on('creds.update', saveCreds)
```

`collectionName` bersifat opsional (default `baileys_auth`). Kalau satu koleksi
dipakai untuk lebih dari satu bot, beri nama berbeda per bot.

#### Tutup koneksi saat bot mati

`useNekoDBAuth` **tidak pernah** memanggil `db.close()` — Anda pemilik koneksinya:

```javascript
process.on('SIGINT', () => {
  sock.end()
  db.close()
  process.exit(0)
})
```

#### L1 cache client (hati-hati untuk multi-proses)

`@nekodb/client` punya L1 cache internal untuk `get`, dengan **TTL dalam
milidetik** (default 10000 ms) dan `maxSize` (default 200 dokumen):

```javascript
const db = new NekoDB({
  host: 'cluster.example.com',
  username: 'furina',
  password: process.env.NEKODB_PASSWORD,
  cache: { ttl: 0 }   // 0 = matikan cache client
})
```

Untuk satu instance bot, cache ini mempercepat pembacaan berulang. Kalau Anda
**sengaja** membagi satu koleksi untuk beberapa proses, matikan cache client
(`ttl: 0`) supaya satu proses tidak membaca salinan yang sudah kedaluwarsa.

#### Penamaan dokumen

NekoDB menghasilkan id dokumen sendiri, jadi setiap record dibedakan lewat field
`k` (`creds.json`, `pre-key-1.json`, dst) dan ditandai field `________furina`.
`keys()` dan `clear()` hanya menyentuh dokumen bertanda itu — record milik Anda
sendiri di koleksi yang sama tidak akan tersentuh.

#### Peringatan keamanan

- **`@nekodb/client` bukan bagian dari audit dependency Furina.** Package ini
  dikelola pihak ketiga dan hanya masuk sebagai peer dependency opsional ketika
  Anda meng-Install-nya sendiri. **Jalankan `npm audit` (dan `npm audit fix`)
  secara mandiri** pada proyek Anda — jangan berasumsi paket ini ikut terpantau
  oleh audit repo ini.
- Proses autentikasi ini menangani **Signal key dan kredensial login** Anda.
  Simpan `NEKODB_PASSWORD` di environment variable/secret manager, jangan di
  kode, dan pastikan host NekoDB Anda memakai TLS.

### Backup & restore

`exportAuthState(store)` mengemas seluruh session (creds + Signal keys) menjadi
satu Buffer gzip ber-metadata — cocok untuk backup terjadwal atau memindahkan
session antar mesin:

```javascript
const { makeWASocket, createFileAuthStore, exportAuthState } = require('@vanzzz/furina-baileys')
const fs = require('fs')

const store = await createFileAuthStore('./auth_info')
const backup = await exportAuthState(store, { level: 9 })

fs.writeFileSync('session.backup.gz', backup)
```

Memeriksa isi backup tanpa menulis apa pun:

```javascript
const { peekAuthBackup } = require('@vanzzz/furina-baileys')

const info = peekAuthBackup(fs.readFileSync('session.backup.gz'))
// { backend: 'file', timestamp: 1731120000000, hasCreds: true, recordCount: 12 }
```

Mengembalikannya ke store tujuan (record yang tidak ada di backup tidak
disentuh — panggil `store.clear()` dulu bila ingin restore bersih):

```javascript
const { importAuthState } = require('@vanzzz/furina-baileys')

await importAuthState(store, fs.readFileSync('session.backup.gz'))
```

Format envelope:

```javascript
{
  version: 1,          // BACKUP_VERSION
  timestamp: 1731120000000,   // epoch ms
  backend: 'file',
  data: {
    creds: '<BufferJSON string>',   // opsional — absen bila belum pernah login
    keys: { 'pre-key-1.json': '<BufferJSON string>', ... }
  }
}
```

Backup yang korup (bukan gzip, bukan JSON, `version` tak didukung, atau record
bukan string) ditolak dengan `Boom` `statusCode: 400` dan pesan yang menyebut
penyebabnya — tidak ada tulisan separuh jalan masuk ke store.

### Migrasi antar backend

`migrateAuthState(fromStore, toStore)` memindahkan session antar backend lewat
kontrak `AuthStore` saja, tanpa socket:

```javascript
const {
  createFileAuthStore,
  createNekoDBAuthStore,
  migrateAuthState
} = require('@vanzzz/furina-baileys')

const from = await createFileAuthStore('./auth_info')
const to = createNekoDBAuthStore(db, 'bot_a_session')

await migrateAuthState(from, to, {
  onProgress: step => console.log('migrate:', step)   // read → write → verify → done
})
```

Setelah menulis, setiap record dibaca ulang dari target dan dibandingkan dengan
sumber. Jika ada yang tidak cocok, tulisan ke target **dibatalkan**: record yang
sudah ada sebelumnya dipulihkan ke nilai lamanya, record baru dihapus — lalu
error dilempar. Store sumber tidak pernah diubah.

### Backend kustom

Implementasikan `AuthStore`, lalu pakai `makeAuthStateFromStore`:

```javascript
const { makeAuthStateFromStore } = require('@vanzzz/furina-baileys')

const store = {
  backend: 'custom',
  get: async key => (await myDb.query(key)) ?? null,
  getMany: async keys => ({ ... }),
  set: async (key, value) => { await myDb.write(key, value) },
  setMany: async entries => { /* ... */ },
  remove: async key => true,
  keys: async () => []
}

const { state, saveCreds } = await makeAuthStateFromStore(store)
```

### Pakai dengan `makeWASocket`

```javascript
const { makeWASocket, useSQLiteAuthState } = require('@vanzzz/furina-baileys')

const { state, saveCreds } = await useSQLiteAuthState('./')

const sock = makeWASocket({ auth: state })
sock.ev.on('creds.update', saveCreds)
```

---

## Navigasi dokumentasi

- [Getting Started](getting-started.md) — Koneksi dasar, pairing, dan quick start.
- [Stability Layer](stability.md) — Pemantau koneksi, backoff eksponensial, dan stealth mode.
- [Broadcast CRM](broadcast-crm.md) — Broadcast personal, grup, dan kanal dengan segmentasi dan anti-ban.
- [Message Detection](message-detection.md) — Mengenali 97 tipe pesan WhatsApp.
- [Anti-BAN Protection](antiban.md) — Perlindungan anti-ban: timing manusia, rate limiter, dan health monitor.
- [Furina Resolver](resolver.md) — Mapping LID ↔ PN dua arah, query USync, dan util link wa.me.
- [Message Builder](message-builder.md) — Button interaktif, carousel, MessageBuilder, dan button tracker.
- [AI Rich Message](ai-rich-message.md) — Teks kaya, code/tabel, embedded screens, album, tombol, dan DSL markdown.
- [VoIP (Fondasi)](voip.md) — Deteksi panggilan masuk dan penolakan call (eksperimental).
- [Commerce](commerce.md) — Payment request, katalog produk, dan fetch catalog bisnis.
- **Multi-Backend Auth Store** — _halaman ini_
- [Utilities](utilities.md) — Username Manager, Message Scheduler, Auto-Reply, Anti-Spam, dan HD Media.
- [API Reference](api-reference.md) — Daftar API publik yang tersedia.
- [Troubleshooting](troubleshooting.md) — Masalah umum, reconnect, session, rate limit, delivery, quarantine.
- [Lisensi](license.md) — Detail lisensi Apache-2.0 dan kewajiban atribusi.
- [Credits](credits.md) — Kredit dan atribusi proyek.
