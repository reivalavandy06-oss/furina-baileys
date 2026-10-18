Getting Started

Koneksi dasar, pairing, dan quick start.

[Dokumentasi utama](../README.md) · **Navigasi docs:** [beranda](index.md)

---

## 🚀 Quick Start

### Basic Connection (CommonJS)

```javascript
const { makeWASocket, useMultiFileAuthState } = require('@vanzzz/furina-baileys')

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')
  const sock = makeWASocket({ auth: state })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      console.log('Connection closed due to:', lastDisconnect?.error)
      if (shouldReconnect) start()
    } else if (connection === 'open') {
      console.log('✅ Connected to WhatsApp')
      console.log('User:', sock.user)
    }
  })

  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const m of messages) {
      if (m.message?.conversation) {
        console.log(`[MSG] ${m.key.remoteJid}:`, m.message.conversation)
      }
    }
  })
}

start()
```

### Basic Connection (ESM)

```javascript
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@vanzzz/furina-baileys'

const { state, saveCreds } = await useMultiFileAuthState('auth_info')
const sock = makeWASocket({ auth: state })

sock.ev.on('creds.update', saveCreds)
sock.ev.on('connection.update', (update) => {
  const { connection, lastDisconnect } = update

  if (connection === 'close') {
    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
    if (shouldReconnect) start()
  } else if (connection === 'open') {
    console.log('Connected')
  }
})
```

### Send First Message

```javascript
// Text message
await sock.sendMessage('6281234567890@s.whatsapp.net', {
  text: 'Hello from Furina-Baileys! 🎭'
})

// Image message
await sock.sendMessage(jid, {
  image: fs.readFileSync('./image.jpg'),
  caption: 'Check this out!'
})

// Document
await sock.sendMessage(jid, {
  document: fs.readFileSync('./file.pdf'),
  mimetype: 'application/pdf',
  fileName: 'document.pdf'
})
```

---

## 🔗 Connection & Pairing

### QR Code (Default)

```javascript
const sock = makeWASocket({ auth: state })

sock.ev.on('connection.update', (update) => {
  const { qr } = update
  if (qr) {
    console.log('Scan this QR code in WhatsApp → Linked Devices')
    // Integrate with qrcode-terminal or qrcode package
  }
})
```

### Pairing Code (No QR Scan)

```javascript
const sock = makeWASocket({ auth: state })

sock.ev.on('connection.update', async (update) => {
  const { connection } = update

  if (connection === 'open') return

  // Request pairing code
  const code = await sock.requestPairingCode('6281234567890')
  console.log('Enter this code in WhatsApp → Link a Device:', code)
})
```

### Custom Pairing Code

Customize the pairing code (useful for multi-instance identification):

```javascript
const code = await sock.requestPairingCode('6281234567890', 'FURINA')
console.log('Custom pairing code:', code)
// Output: FURINA-XXXX or similar
```

### Custom Browser Identity

Change what appears in "Linked Devices":

```javascript
const { Browsers } = require('@vanzzz/furina-baileys')

const sock = makeWASocket({
  auth: state,
  browser: Browsers.macOS('Chrome'), // atau:
  // browser: Browsers.ubuntu('Firefox'),
  // browser: Browsers.windows('Edge'),
  // browser: Browsers.android('Chrome'),
  // browser: Browsers.baileys('Safari'),
  // browser: Browsers.appropriate('Chrome'), // auto-detect OS
})
```

### Connection Options

```javascript
const sock = makeWASocket({
  auth: state,
  browser: Browsers.ubuntu('Chrome'),

  // Connection tuning
  connectTimeoutMs: 30_000,
  keepAliveIntervalMs: 30_000,
  defaultQueryTimeoutMs: 60_000,

  // Retry strategy
  retryRequestDelayMs: 250,

  // Logger (pino)
  logger: pino({ level: 'silent' }),

  // Version (optional, auto-detected)
  version: [2, 2467, 0],
})
```

---

---

## Navigasi dokumentasi

- **Getting Started** — _halaman ini_
- [Stability Layer](stability.md) — Pemantau koneksi, backoff eksponensial, dan stealth mode.
- [Broadcast CRM](broadcast-crm.md) — Broadcast personal, grup, dan kanal dengan segmentasi dan anti-ban.
- [Message Detection](message-detection.md) — Mengenali 97 tipe pesan WhatsApp.
- [Anti-BAN Protection](antiban.md) — Perlindungan anti-ban: timing manusia, rate limiter, dan health monitor.
- [Furina Resolver](resolver.md) — Mapping LID ↔ PN dua arah, query USync, dan util link wa.me.
- [Message Builder](message-builder.md) — Button interaktif, carousel, MessageBuilder, dan button tracker.
- [API Reference](api-reference.md) — Daftar API publik yang tersedia.
- [Troubleshooting](troubleshooting.md) — Masalah umum, reconnect, session, rate limit, delivery, quarantine.
- [Lisensi](license.md) — Detail lisensi Apache-2.0 dan kewajiban atribusi.
- [Credits](credits.md) — Kredit dan atribusi proyek.
