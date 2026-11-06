Utilities

Username Manager, Message Search Index, Panorama Profile, HD Media, Scheduler, Auto-Reply, dan Anti-Spam.

[Dokumentasi utama](../README.md) · **Navigasi docs:** [beranda](index.md)

---

## 🧰 Utilities

Kumpulan helper yang bisa dipakai berdiri sendiri (tanpa memodifikasi socket core).

### Username Management

Modul `src/Utils/username-manager.ts`.

```javascript
const {
  checkUsername,
  setUsername,
  setUsernamePin,
  getMyUsername,
  deleteUsername,
  findUserByUsername
} = require('@vanzzz/furina-baileys')

// @handle tersedia?
const available = await checkUsername(sock, 'avandy')

// resolve handle ke profil
const user = await findUserByUsername(sock, '@furina')

// klaim handle
await setUsername(sock, 'avandy')

// kunci dengan PIN (4-8 digit)
await setUsernamePin(sock, { pin: '4321' })

// baca handle milik sendiri
const mine = await getMyUsername(sock)

// lepas handle
await deleteUsername(sock)
```

Aturan username: 5–30 karakter, `a-z`, `0-9`, `_`, `.`. Gunakan
`isValidUsername()`/`isValidPin()` untuk validasi di sisi klien.

> [!NOTE]
> `checkUsername` hanya bisa memastikan handle **sudah dipakai**. Kegagalan server
> akan melempar error, bukan dilaporkan sebagai "tersedia".

### Message Search Index

`MessageSearchIndex` adalah indeks **in-memory** atas array `WAMessage`.

```javascript
const { MessageSearchIndex } = require('@vanzzz/furina-baileys')

const index = new MessageSearchIndex()
index.addMessages(messages)

// full-text + skor relevansi
const hits = index.search('pesanan 123', { limit: 20 })

// regex
const numeric = index.searchRegex(/\d{5}/)

// filter lanjutan
index.search('halo', { chatIds: ['628@s.whatsapp.net'], includeFromMe: false })
index.search('halo', { from: 1_700_000_000, to: 1_700_999_999 })
```

Skor: tumpang-tindih istilah query ditambah bonus bila query muncul verbatim.
Indeks tidak persisten — muat ulang dari riwayat Anda sendiri bila perlu.

### Panorama Profile Picture

`src/Utils/panorama-profile.ts` memakai `sharp` atau `jimp` (opsional).

```bash
npm install sharp
```

```javascript
const {
  buildPanoramaProfileImages,
  updatePanoramaProfilePicture
} = require('@vanzzz/furina-baileys')

// gambar persegi 640x640 + banner lebar (default 1280x427)
const pics = await buildPanoramaProfileImages('./foto.jpg', {
  squareSize: 640,
  maxWidth: 1280,
  bannerAspect: 3
})

// terapkan ke profil
await updatePanoramaProfilePicture(sock, sock.user.id, './foto.jpg')
```

Tanpa `sharp` maupun `jimp`, helper melempar error yang jelas.

### HD Media

Tambahkan `hd: true` pada konten media agar klien **tidak** melakukan
thumbnail/downsampling — byte sumber dan dimensi asli dipertahankan.

```javascript
await sock.sendMessage(jid, { image: buffer, hd: true })
await sock.sendMessage(jid, { video: buffer, hd: true, ptv: true })
```

### Message Scheduler

`MessageScheduler` menjadwalkan pesan (in-memory; restart mengosongkan antrean).

```javascript
const { MessageScheduler } = require('@vanzzz/furina-baileys')

const scheduler = new MessageScheduler({
  onSent: (entry) => console.log('terkirim', entry.id)
})

const entry = scheduler.schedule(
  sock,
  '628@s.whatsapp.net',
  { text: 'Siaran terjadwal' },
  new Date(Date.now() + 60_000)
)

scheduler.cancel(entry.id)
```

`sendAt` wajib di masa depan — pesan yang langsung dikirim otomatis akan
menyembunyikan bug pemanggil.

### Auto-Reply Engine

```javascript
const { AutoReplyEngine } = require('@vanzzz/furina-baileys')

const engine = new AutoReplyEngine()

// substring, glob (`halo*`), atau RegExp
engine.addRule('halo*', 'Halo juga!')
engine.addRule(/order\s+\d+/, 'Diterima, segera diproses.')
engine.addRule('!vip', 'Siap!', { chatIds: ['628@s.whatsapp.net'] })

sock.ev.on('messages.upsert', async ({ messages }) => {
  for (const message of messages) {
    await engine.processMessage(sock, message)
  }
})
```

Opsi per aturan: `caseSensitive`, `chatIds`, `ignoredChatIds`, `ignoreFromMe`,
`delayMs`, `options`. Aturan dicocokkan berurutan dan yang pertama menang.

### Anti-Spam Filter

`AntiSpamFilter` murni heuristik **offline** — tidak memanggil API reputasi
eksternal, jadi isi chat tidak bocor ke pihak ketiga.

```javascript
const { AntiSpamFilter } = require('@vanzzz/furina-baileys')

const filter = new AntiSpamFilter()
const verdict = filter.checkMessage(text)

if (verdict.spam) {
  console.log(verdict.score, verdict.reasons)
  for (const link of verdict.links) {
    if (!link.safe) console.log('link berisiko:', link.url, link.reasons)
  }
}
```

Sinyal yang dinilai: kata kunci spam, shortener, TLD berisiko, host berupa IP,
subdomain sangat dalam, homograph, kredensial tertanam di URL, kapitalisasi
berlebih, dan proporsi karakter non-huruf.

```javascript
// daftar kustom
const filter = new AntiSpamFilter({
  threshold: 0.6,
  keywords: ['cepat klik', 'hadiah'],
  blockedHosts: ['contoh-malware.test'],
  shorteners: ['s.test']
})
```

> [!NOTE]
> Heuristik ini menangkal pola umum, **bukan** pengganti verifikasi reputasi URL.
> Untuk cek menyeluruh, hubungkan `scanLink` ke layanan pilihan Anda.

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
- [Multi-Backend Auth Store](auth-stores.md) — File/SQLite/MongoDB/Redis melalui satu kontrak `AuthStore`.
- **Utilities** — _halaman ini_
- [API Reference](api-reference.md) — Daftar API publik yang tersedia.
- [Troubleshooting](troubleshooting.md) — Masalah umum, reconnect, session, rate limit, delivery, quarantine.
- [Lisensi](license.md) — Detail lisensi Apache-2.0 dan kewajiban atribusi.
- [Credits](credits.md) — Kredit dan atribusi proyek.
