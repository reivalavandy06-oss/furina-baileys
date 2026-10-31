<p align="center"><img src="Media/furina-thumb.jpg" alt="Furina Baileys" width="400" /></p>

# 💍 FURINA-BAILEYS

Baileys versi Furina untuk membuat bot WhatsApp dengan lebih banyak fitur, lebih stabil, dan mudah dikustomisasi.

Fork dari [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys) dengan lapisan produksi: stabilitas koneksi, broadcast CRM anti-ban, tracking delivery, dan button interaktif.

[![npm version](https://img.shields.io/npm/v/@vanzzz/furina-baileys.svg)](https://www.npmjs.com/package/@vanzzz/furina-baileys)
[![License](https://img.shields.io/npm/l/@vanzzz/furina-baileys.svg)](https://github.com/reivalavandy06-oss/furina-baileys/blob/master/LICENSE)
[![TypeScript](https://img.shields.io/badge/typescript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Dual CJS/ESM](https://img.shields.io/badge/module-dual%20CJS%2FESM-brightgreen.svg)](package.json)

`v1.2.0-furina-rc.2` · Node.js >= 20

> [!CAUTION]
> Baileys 7.0.0 memperkenalkan breaking changes. Baca [migration guide upstream](https://whiskey.so/migrate-latest) sebelum naik versi.

---

## ✨ Fitur Utama

**Inti bot**

- **Bot WhatsApp berbasis Baileys** — socket Noise/protobuf langsung, tanpa browser dan tanpa Selenium
- **Multi-device support** — device suffix, agent suffix, dan LID/PN duality ditangani lewat helper JID
- **Message detection 97 tipe** — termasuk view-once, reaction, dan interactive response
- **Button & carousel** — 17 tipe button native, plus `MessageBuilder` fluent untuk compose pesan kompleks

**Anti-ban**

- **Rate limiter per menit dan per jam** — `RateLimiter`, rolling window, akurasi lintas panggilan paralel
- **Quarantine 403 persisten** — grup/kontak yang menolak 403 dicatat ke disk, bukan hanya di memori
- **Delivery tracking** — status `messages.update` dengan buffer untuk update yang datang sebelum record terdaftar
- **Health guard** — risk score, auto-pause saat risiko tinggi, dan latch per jendela konten
- **Timing manusia** — `jitter`, `waitForSendWindow`, `humanSend`, plus profil `ori` dan `business`

**Produksi**

- **Stabilizer koneksi** — `StabilityManager` dengan statistik, backoff, dan mode stealth
- **Broadcast CRM** — segmentasi customer (termasuk whitelist `jids`), template spintax, dan kanal newsletter
- **Retry & backoff** — percobaan ulang dengan klasifikasi error 403/408/440/411
- **Identity resolver** — mapping LID ↔ PN dua arah, pencarian @username via USync (mendukung akun ORI & WhatsApp Business/SMB), dan util link wa.me

> Setiap listener punya jalur pelepasan (`dispose()`) dan setiap buffer punya batas, jadi uptime panjang tidak menyebabkan buildup.

---

## 📦 Instalasi

```bash
npm install @vanzzz/furina-baileys
```

atau

```bash
yarn add @vanzzz/furina-baileys
```

atau

```bash
pnpm add @vanzzz/furina-baileys
```

**Kebutuhan:** Node.js >= 20 (library memblokir versi lebih lama saat install). TypeScript >= 5 opsional — library sudah dikompilasi.

---

## 🚀 Quick Start

### CommonJS (require)

```javascript
const { makeWASocket, useMultiFileAuthState } = require('@vanzzz/furina-baileys')

async function start() {
  // state auth disimpan di folder ./session
  const { state, saveCreds } = await useMultiFileAuthState('session')
  const sock = makeWASocket({ auth: state })

  // simpan credential setiap kali berubah
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'close') {
      console.log('terputus:', lastDisconnect?.error)
    } else if (connection === 'open') {
      console.log('terhubung sebagai', sock.user?.name)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages) {
      if (m.message?.conversation) {
        console.log(`${m.key.remoteJid}: ${m.message.conversation}`)
      }
    }
  })

  // kirim pesan
  await sock.sendMessage('628xxxxxxxxxx@s.whatsapp.net', { text: 'Halo dari Furina!' })
}

start()
```

### ESM (import)

```javascript
import { makeWASocket, useMultiFileAuthState } from '@vanzzz/furina-baileys'

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('session')
  const sock = makeWASocket({ auth: state })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'close') {
      console.log('terputus:', lastDisconnect?.error)
    } else if (connection === 'open') {
      console.log('terhubung sebagai', sock.user?.name)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages) {
      if (m.message?.conversation) {
        console.log(`${m.key.remoteJid}: ${m.message.conversation}`)
      }
    }
  })

  await sock.sendMessage('628xxxxxxxxxx@s.whatsapp.net', { text: 'Halo dari Furina!' })
}

start()
```

---

## 🔄 Migrasi dari `furina-baileys`

Paket ini menggantikan paket unscoped `furina-baileys`.

**1. Install paket baru:**

```bash
npm install @vanzzz/furina-baileys
```

**2. Ganti nama import:**

```diff
- const { makeWASocket } = require('furina-baileys')
+ const { makeWASocket } = require('@vanzzz/furina-baileys')
```

```diff
- import { makeWASocket } from 'furina-baileys'
+ import { makeWASocket } from '@vanzzz/furina-baileys'
```

**3. Tidak ada perubahan API besar.** Semua fungsi, opsi, dan event tetap sama. Yang berubah hanya nama paket.

Kalau package `furina-baileys` lama masih terpasang di project yang sama, tidak masalah — keduanya bisa hidup berdampingan.

---

## 📚 Dokumentasi

Ringkasan di atas adalah pintu masuk. Dokumentasi lengkap dipisah per topik supaya mudah dicari dan tetap ringkas di halaman npm.

| Topik | Isi |
|---|---|
| [Getting Started](docs/getting-started.md) | Koneksi dasar, pairing device, quick start |
| [Antiban](docs/antiban.md) | Cara aktifkan & konfigurasi anti-ban, `waitForSendWindow`, `getProfile`, `RateLimiter` |
| [Stability](docs/stability.md) | Reconnect, backoff eksponensial, stealth mode, `StabilityManager` |
| [Broadcast CRM](docs/broadcast-crm.md) | Segmentasi customer, template spintax, kanal newsletter, alur end-to-end |
| [Message Builder](docs/message-builder.md) | 17 tipe button, carousel, `MessageBuilder`, button tracker |
| [Resolver](docs/resolver.md) | Mapping LID ↔ PN dua arah, query USync, util link `wa.me` |
| [Message Detection](docs/message-detection.md) | Mengenali 97 tipe pesan WhatsApp |
| [Troubleshooting](docs/troubleshooting.md) | Masalah umum, reconnect, session, rate limit, delivery, quarantine |
| [API Reference](docs/api-reference.md) | Daftar API publik yang tersedia |

👉 **[Mulai dari beranda docs/](docs/index.md)**

---

## 📄 Lisensi

**Apache License 2.0** dengan kewajiban atribusi.

**Hak cipta:**
- WhiskeySockets/Baileys (2025) — proyek asli
- Avandy (2026) — modifikasi dan fitur tambahan

Anda wajib mencantumkan kredit saat memakai, memodifikasi, atau mendistribusikan library ini:

```markdown
Built with [Furina-Baileys](https://github.com/reivalavandy06-oss/furina-baileys)
Based on [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys)
Modifications by Avandy
```

> Fork wajib mempertahankan atribusi. Menghapus kredit tanpa izin dapat berakibat DMCA takedown notice.
>
> Library ini untuk automation yang legitimate. Penyalahgunaan (spam, scam, blast tanpa izin) adalah tanggung jawab pengguna, bukan developer.

---

<div align="center">

**Made with 💙 by the Furina-Baileys team**

[Report Bug](https://github.com/reivalavandy06-oss/furina-baileys/issues) · [Request Feature](https://github.com/reivalavandy06-oss/furina-baileys/issues)

</div>