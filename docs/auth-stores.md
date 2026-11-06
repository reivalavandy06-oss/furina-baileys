Multi-Backend Auth Store

Simpan auth state di file, SQLite, MongoDB, atau Redis lewat satu kontrak `AuthStore`.

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
