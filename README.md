<div align="center">

![Furina-Baileys](Media/furina-thumb.jpg)

# 💍 FURINA-BAILEYS

WhatsApp Web API library dengan **stabilitas koneksi**, **kelengkapan button interaktif**, **CRM automation**, **broadcast anti-ban**, dan **message detection 96+ tipe**.

Built on top of [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys).

`v1.0.6-furina` · TypeScript · Dual CJS/ESM · 🎬 [Demo Video](Media/furina-demo.mp4)

[![npm version](https://img.shields.io/npm/v/@vanzzz/furina-baileys.svg)](https://www.npmjs.com/package/@vanzzz/furina-baileys)
[![License](https://img.shields.io/npm/l/@vanzzz/furina-baileys.svg)](LICENSE)

> [!CAUTION]
> Baileys 7.0.0 introduced breaking changes. Check the [migration guide](https://whiskey.so/migrate-latest) before upgrading.

</div>

---

## 📋 Table of Contents

- [✨ What Makes This Different](#-what-makes-this-different)
- [📦 Installation](#-installation)
- [🚀 Quick Start](#-quick-start)
- [🔗 Connection & Pairing](#-connection--pairing)
- [🛡️ Stability Layer](#️-stability-layer)
- [🗂️ CRM System](#️-crm-system)
- [📨 Broadcast Automation](#-broadcast-automation)
- [🔍 Message Detection](#-message-detection)
- [🛰️ Anti-BAN Protection](#️-anti-ban-protection)
- [🆔 Furina Resolver](#-furina-resolver)
- [🔘 Button Interaktif](#-button-interaktif)
- [🎠 Carousel](#-carousel)
- [🔨 MessageBuilder](#-messagebuilder)
- [📊 Button Tracker](#-button-tracker)
- [⚠️ Region & Asset-Gated Buttons](#️-region--asset-gated-buttons)
- [🏪 Business Account Notes](#-business-account-notes)
- [📚 API Reference](#-api-reference)
- [🐛 Troubleshooting](#-troubleshooting)
- [⚠️ Known Limitations](#️-known-limitations)
- [📄 License](#-license)

---

## ✨ What Makes This Different

Most WhatsApp libraries give you raw socket access and leave the rest to you. Furina-Baileys adds production features that take weeks to build:

- **🛰️ Stability layer** — Monitor koneksi + stats (`sock.stability.getStats()`), exponential backoff calculator, stealth mode buat reconnect delay. **Catatan:** library nggak auto-reconnect — user tetap panggil `makeWASocket` ulang berdasarkan stats
- **🔘 Button set terlengkap** — 17 tipe native + 4 modifier message-level, verified on-device
- **🗂️ CRM system** — Track customers, conversations, activity, analytics
- **📨 Broadcast automation** — Personal/group/channel dengan anti-ban delays (Gaussian, rate cap)
- **🔍 Message detection** — Recognize 96+ message types termasuk view-once dan reactions
- **🛡️ Anti-BAN protection** — Health monitor, auto-pause, stealth composing
- **🆔 Custom pairing code** — `requestPairingCode(phone, customCode)` tanpa error conflict ID
- **🌐 Custom browser identity** — `Browsers.ubuntu/macOS/baileys/windows/android/appropriate`
- **🔨 MessageBuilder** — Fluent builder buat compose pesan kompleks. Dual-path: `sendMessage` untuk simple, `relayMessage` + `additionalNodes` untuk button/carousel. Auto-inject node `bot` di private chat
- **🆔 Identity resolver** — LID mapping bidirectional, USync queries, link utils (`wa.me` generator + parser), bulk resolve, legacy helpers

You still get full Baileys API access. This just handles the boring stuff so you can focus on your bot logic.

---

## 📦 Installation

```bash
npm install @vanzzz/furina-baileys
```

### Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.0.0 (optional, library sudah compiled)

### Verify Installation

```javascript
const baileys = require('@vanzzz/furina-baileys')
console.log('Version:', baileys.DEFAULT_CONNECTION_CONFIG?.version)
console.log('Browsers:', Object.keys(baileys.Browsers))
```

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

## 🛡️ Stability Layer

Connection monitoring dengan structured logging, backoff calculator, dan stealth mode. Aktif by default, akses via `sock.stability`.

> [!IMPORTANT]
> Library ini **tidak auto-reconnect**. Stability layer cuma ngasih: stats, backoff delay calculator, dan saran kapan harus reconnect. User tetap yang panggil `makeWASocket` ulang.

### Access Stability

```javascript
const sock = makeWASocket({ auth: state })
const stability = sock.stability
const stats = stability.getStats()

console.log({
  totalErrors: stats.totalErrors,
  reconnectAttempts: stats.reconnectAttempts,
  isPaused: stats.isPaused,
  pausedUntil: stats.pausedUntil,
})
```

### Opt-Out & Custom Config

```javascript
// Matiin stability layer
const sock = makeWASocket({ auth: state, stability: false })

// Custom config
const sock = makeWASocket({
  auth: state,
  stability: {
    maxRetries: 10,
    baseReconnectDelay: 5000,
    autoPauseAfter: 5,
    stealthMode: true,
    logLevel: 'info',
    onLog: (level, msg) => console.log(`[stability][${level}]`, msg),
  },
})
```

### StabilityConfig Reference

| Field | Default | Deskripsi |
|---|---|---|
| `autoRecovery` | `true` | Cek apakah disconnect recoverable |
| `maxRetries` | `5` | Max reconnect attempt sebelum pause |
| `baseReconnectDelay` | `3000` | Base delay backoff (ms) |
| `maxReconnectDelay` | `30000` | Cap delay backoff (ms) |
| `jitter` | `500` | Random jitter tambahan (ms) |
| `autoPauseAfter` | `3` | Auto-pause setelah N error beruntun |
| `autoPauseDuration` | `600000` | Durasi pause (ms) |
| `stealthMode` | `true` | Random jitter biar nggak detectable |
| `logLevel` | `'error'` | `silent`/`error`/`warn`/`info`/`debug` |
| `onLog` | — | Custom log handler |

### Manual Reconnect Pattern

Karena library nggak auto-reconnect, ini pattern yang disarankan:

```javascript
async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')
  const sock = makeWASocket({ auth: state })
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const stats = sock.stability?.getStats()

      if (code === DisconnectReason.loggedOut) {
        console.log('Logged out. Pairing ulang.')
        return
      }

      const delay = stats?.isPaused
        ? (stats.pausedUntil - Date.now())
        : 3000

      console.log(`Reconnect in ${delay / 1000}s`)
      setTimeout(start, delay)
    }

    if (connection === 'open') {
      console.log('✅ Connected')
    }
  })
}
```

### Manual Reset

```javascript
sock.stability.resetReconnectCounters()
```

### Sub-Handlers

```javascript
sock.stability.getSessionHandler()   // Session recovery
sock.stability.getCryptoHandler()    // Crypto error handling
sock.stability.getProtocolHandler()  // Protocol error handling
sock.stability.getMessageHandler()   // Duplicate message detection
```

### Runtime Log Level

```javascript
sock.stability.setLogLevel('debug')
sock.stability.setLogLevel('silent')
```
## 🗂️ CRM System

Track customers, conversations, activity, dan analytics.

### Initialize CRM

```javascript
const { CRMBroadcastManager, InMemoryStorage } = require('@vanzzz/furina-baileys')

const storage = new InMemoryStorage() // atau implementasi custom storage
await storage.init()

const crm = new CRMBroadcastManager(sock, storage)
```

### Customer Management

```javascript
// Tag customer
await storage.tagCustomer('6281234567890@s.whatsapp.net', ['vip', 'active'])

// Remove tag
await storage.untagCustomer('6281234567890@s.whatsapp.net', ['inactive'])

// Get customer info
const customer = await storage.getCustomer('6281234567890@s.whatsapp.net')
console.log('Tags:', customer.tags)
console.log('Last active:', customer.lastActiveAt)

// Get customers by tag
const vips = await storage.getCustomersByTag('vip')
console.log('VIP customers:', vips.length)
```

### Conversation Tracking

```javascript
// Track conversation (auto-tracked via message events)
sock.ev.on('messages.upsert', async ({ messages }) => {
  for (const m of messages) {
    await crm.trackMessage(m)
  }
})

// Get conversation history
const history = await storage.getConversation('6281234567890@s.whatsapp.net')
console.log('Messages:', history.messages.length)

// Get active conversations
const active = await storage.getActiveConversations({ days: 7 })
```

### Activity & Analytics

```javascript
// Get analytics
const stats = await storage.getAnalytics()
console.log({
  totalCustomers: stats.totalCustomers,
  activeCustomers: stats.activeCustomers,
  messagesSent: stats.messagesSent,
  messagesReceived: stats.messagesReceived,
})

// Track custom activity
await storage.trackActivity('6281234567890@s.whatsapp.net', {
  type: 'purchase',
  data: { orderId: 'ORD-001', amount: 50000 }
})
```

---

## 📨 Broadcast Automation

### Personal Broadcast

Send to customers dengan spintax dan personalization:

```javascript
// Broadcast ke semua customer dengan tag 'vip'
await crm.send(
  { tags: ['vip'] }, 
  '{Halo|Hai|Selamat pagi} {nama}! Ada promo baru nih 📡'
)

// Broadcast ke specific customers
await crm.send(
  { jids: ['6281234567890@s.whatsapp.net', '6282345678901@s.whatsapp.net'] },
  'Halo {nama}, jangan lupa checkout ya!'
)

// Broadcast dengan custom delay
await crm.send(
  { tags: ['active'] },
  'Promo hari ini aja: diskon 50%!',
  { delayMs: 5000 } // 5 detik antar message
)
```

### Group Broadcast

```javascript
// Send to multiple groups
await crm.sendToGroups(
  ['120363xxx@g.us', '120364xxx@g.us'],
  '{Halo|Hai} semua! Ada update baru nih 🎉'
)

// Send to groups with category filter
await crm.sendToGroups(
  ['120363xxx@g.us'],
  'Update penting untuk semua member!',
  { category: 'announcement' }
)
```

### Channel Broadcast

```javascript
// Send to channels (with role check)
await crm.sendToChannels(
  ['https://whatsapp.com/channel/XXX'],
  'Update bot terbaru sudah rilis!'
)

// Broadcast dengan custom options
await crm.sendToChannels(
  ['https://whatsapp.com/channel/XXX'],
  'Pengumuman penting!',
  { requireAdmin: true } // hanya kirim kalau bot admin
)
```

### Spintax

```javascript
// Random variation
const message = '{Halo|Hai|Selamat pagi|Good morning} {nama}!'
// Bisa jadi: "Halo Budi!", "Hai Budi!", "Selamat pagi Budi!", dll

// Nested spintax
const nested = '{Halo {semua|teman-teman}|Hi {guys|everyone}}!'
```

---

## 🔍 Message Detection

Recognize 96+ message types termasuk view-once dan reactions.

### Detect Message Type

```javascript
const { detectMessageType } = require('@vanzzz/furina-baileys')

sock.ev.on('messages.upsert', ({ messages }) => {
  for (const m of messages) {
    const type = detectMessageType(m)
    console.log('Message type:', type)
    
    switch (type) {
      case 'text':
        console.log('Text:', m.message?.conversation)
        break
      case 'image':
        console.log('Image with caption:', m.message?.imageMessage?.caption)
        break
      case 'video':
        console.log('Video:', m.message?.videoMessage)
        break
      case 'audio':
        console.log('Audio/voice:', m.message?.audioMessage)
        break
      case 'document':
        console.log('Document:', m.message?.documentMessage?.fileName)
        break
      case 'sticker':
        console.log('Sticker received')
        break
      case 'contact':
        console.log('Contact card:', m.message?.contactMessage)
        break
      case 'location':
        console.log('Location:', m.message?.locationMessage)
        break
      case 'view-once':
        console.log('View-once message received')
        break
      case 'reaction':
        console.log('Reaction:', m.message?.reactionMessage)
        break
      // ... dan 80+ tipe lainnya
    }
  }
})
```

### View-Once Stub

```javascript
sock.ev.on('messages.upsert', ({ messages }) => {
  for (const m of messages) {
    if (m.message?.viewOnceMessageV2) {
      console.log('View-once message detected')
      // Library otomatis handle view-once stub
    }
  }
})
```

---

## 🛰️ Anti-BAN Protection

Health monitoring, Gaussian jitter delay, sliding-window rate limit, dan jam tidur opt-in.

> [!NOTE]
> Anti-ban layer ini **belum terintegrasi otomatis** ke `makeWASocket`. User panggil manual dari `@vanzzz/furina-baileys`. Integrasi otomatis di roadmap v1.0.7.

### Import

```javascript
const {
  HealthMonitor,
  RateLimiter,
  humanSend,
  getProfile,
  checkSendWindow,
  waitForSendWindow,
} = require('@vanzzz/furina-baileys')
```

### Profile ORI vs Business

```javascript
// ORI: relaxed (60 msg/jam, 600-4000ms typing)
const oriProfile = getProfile('ori')

// Business: stricter (30 msg/jam, 900-5000ms typing)
const bizProfile = getProfile('business')

// Custom override
const customProfile = getProfile('ori', {
  maxPerHour: 40,
  typingMin: 800,
  typingMax: 3000,
  errorThreshold: 4,
})
```

### Profile Reference

| Field | ORI | Business | Deskripsi |
|---|---|---|---|
| `maxPerHour` | 60 | 30 | Max pesan per jam |
| `typingMin` | 600 | 900 | Min typing duration (ms) |
| `typingMax` | 4000 | 5000 | Max typing duration (ms) |
| `cooldownMin` | 1500 | 2500 | Min cooldown after send (ms) |
| `cooldownMax` | 4500 | 6500 | Max cooldown after send (ms) |
| `errorThreshold` | 5 | 3 | Errors before pause |
| `pauseMs` | 600000 | 1800000 | Pause duration (ms) |
| `backoffBase` | 3000 | 5000 | Base reconnect delay (ms) |
| `backoffMax` | 60000 | 120000 | Cap reconnect delay (ms) |
| `errorWindowMs` | 3600000 | 1800000 | Error expiry window (ms) |
| `disconnectThreshold` | 3 | 2 | Disconnects before pause |
| `sleepEnabled` | false | false | Jam tidur opt-in |
| `sleepStart` | 22 | 22 | Jam mulai tidur |
| `sleepEnd` | 6 | 6 | Jam selesai tidur |

### Human Send

Kirim dengan typing simulation + cooldown natural:

```javascript
const profile = getProfile('ori')

await humanSend(sock, jid, { text: 'Halo!' }, {}, profile)
// Urutan: composing → sleep (berdasarkan panjang teks) → sendMessage → cooldown → paused
```

### Health Monitor

Track error/disconnect dan pause otomatis kalau threshold tercapai:

```javascript
const health = new HealthMonitor(profile)

// Record saat error
sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
  if (connection === 'close') {
    health.recordDisconnect()
    const code = lastDisconnect?.error?.output?.statusCode
    if (code) health.recordError(code)
  }
})

// Cek pause
if (health.isPaused()) {
  console.log('Bot di-pause, tunggu...')
  return
}

// Trigger pause (kalau error cukup)
if (health.maybePause()) {
  console.log('Pause triggered')
}

// Backoff untuk reconnect delay
const delay = health.nextBackoff()  // 3s → 6s → 12s → ... capped
setTimeout(start, delay)
```

### Health Persistence

State bisa di-export/import biar nggak reset saat restart:

```javascript
// Save sebelum shutdown
const state = health.exportState()
fs.writeFileSync('health-state.json', JSON.stringify(state))

// Restore saat start
const saved = JSON.parse(fs.readFileSync('health-state.json'))
health.importState(saved)
```

### Rate Limiter

Sliding-window rate cap:

```javascript
const limiter = RateLimiter.fromProfile(profile)
// atau manual: new RateLimiter(10, 60_000) → 10 per 60 detik

await limiter.take()  // Tunggu kalau kuota habis
await sock.sendMessage(jid, { text: 'Hello' })
```

### Send Window (Jam Tidur)

Opt-in — bot nggak kirim di rentang jam tertentu:

```javascript
const profile = getProfile('ori', {
  sleepEnabled: true,
  sleepStart: 22,  // 22:00
  sleepEnd: 6,     // 06:00 besoknya
})

// Cek manual
const check = checkSendWindow(profile)
if (!check.allowed) {
  console.log(`Sleep window aktif, tunggu ${check.waitMs / 60000} menit`)
}

// Atau tunggu otomatis
await waitForSendWindow(profile)  // Return saat di luar jam tidur
```

### Health Stats

```javascript
const stats = health.getStats()
console.log({
  totalErrors: stats.totalErrors,
  totalDisconnects: stats.totalDisconnects,
  totalPauses: stats.totalPauses,
  uptimeMs: stats.uptimeMs,
})
```

### Full Example

```javascript
const {
  makeWASocket,
  useMultiFileAuthState,
  getProfile,
  HealthMonitor,
  RateLimiter,
  humanSend,
  checkSendWindow,
  waitForSendWindow,
} = require('@vanzzz/furina-baileys')

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')
  const sock = makeWASocket({ auth: state })
  sock.ev.on('creds.update', saveCreds)

  const profile = getProfile('ori')
  const health = new HealthMonitor(profile)
  const limiter = RateLimiter.fromProfile(profile)

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      health.recordDisconnect()
      const code = lastDisconnect?.error?.output?.statusCode
      if (code) health.recordError(code)
    }
    if (connection === 'open') {
      health.resetBackoff()
    }
  })

  async function sendSafe(jid, content) {
    if (health.isPaused()) throw new Error('Bot paused')
    if (!checkSendWindow(profile).allowed) {
      await waitForSendWindow(profile)
    }
    await limiter.take()
    return humanSend(sock, jid, content, {}, profile)
  }

  await sendSafe(jid, { text: 'Halo!' })
}

start()
```
## 🆔 Furina Resolver

Complete WhatsApp identity resolver (LID mapping + USync queries + legacy helpers).

### Initialize Resolver

```javascript
const { getFurinaResolver } = require('@vanzzz/furina-baileys')

const resolver = getFurinaResolver(sock)
```

### LID ↔ Phone Number Resolution

```javascript
// Resolve Phone Number → LID
const lid = await resolver.resolveLID('6281234567890@s.whatsapp.net')
console.log('LID:', lid) // '54435237613621@lid'

// Resolve LID → Phone Number
const pn = await resolver.resolvePN('54435237613621@lid')
console.log('Phone:', pn) // '6281234567890@s.whatsapp.net'
```

### USync Queries

```javascript
// Search by username
const user = await resolver.searchByUsername('username')
console.log('User:', user) // { jid, name, status, ... }

// Fetch user info by JID
const info = await resolver.fetchUserInfo('6281234567890@s.whatsapp.net')
console.log('Info:', info) // { name, status, pictureUrl, ... }

// Fetch status
const status = await resolver.fetchStatus('6281234567890@s.whatsapp.net')
console.log('Status:', status) // 'Available' or custom status
```

### Smart Target Resolution

```javascript
// Auto-detect target type
const jid1 = await resolver.resolveTarget('@username') // Username → JID
const jid2 = await resolver.resolveTarget('6281234567890') // Phone → JID
const jid3 = await resolver.resolveTarget('6281234567890@s.whatsapp.net') // Already JID

console.log('Resolved:', jid1, jid2, jid3)
```

### Legacy Helpers

```javascript
const { isGroup, isLID, isNewsletter, isUser } = require('@vanzzz/furina-baileys')

console.log(isGroup('120363xxx@g.us')) // true
console.log(isGroup('6281234567890@s.whatsapp.net')) // false

console.log(isLID('54435237613621@lid')) // true
console.log(isLID('6281234567890@s.whatsapp.net')) // false

console.log(isNewsletter('120363xxx@newsletter')) // true
console.log(isUser('6281234567890@s.whatsapp.net')) // true
```

---

### Link Utilities

Convert JID ↔ WhatsApp link:

```javascript
// Generate wa.me link dari nomor atau JID
const link = await resolver.toWhatsAppLink('6281234567890')
console.log(link) // 'https://wa.me/6281234567890'

// Dari LID — otomatis resolve ke PN dulu
const link2 = await resolver.toWhatsAppLink('54435237613621@lid')
console.log(link2) // null kalau nggak bisa resolve

// Parse link jadi JID
const jid1 = await resolver.fromWhatsAppLink('https://wa.me/6281234567890')
console.log(jid1) // '6281234567890@s.whatsapp.net'

const jid2 = await resolver.fromWhatsAppLink('https://chat.whatsapp.com/KrffhAYf9AvH84diFuCLJS')
console.log(jid2) // group JID
```

### Bulk Resolve

Resolve banyak target paralel (chunk 5, hindari rate-limit):

```javascript
const results = await resolver.resolveMany([
  '6281234567890',
  '6289876543210',
  '120363xxx@g.us',
])
console.log(results) // ['...@lid', '...@lid', '...@g.us']
```

### Standalone Wrappers

Semua method juga tersedia sebagai fungsi standalone:

```javascript
const { toWhatsAppLink, fromWhatsAppLink } = require('@vanzzz/furina-baileys')

const link = await toWhatsAppLink(sock, '6281234567890')
const jid = await fromWhatsAppLink(sock, 'https://wa.me/6281234567890')
```

## 🔘 Button Interaktif

17 tipe button native + 4 modifier message-level, verified on-device.

### Basic Button

```javascript
const { sendButton } = require('@vanzzz/furina-baileys')

await sendButton(sock, jid, {
  text: 'Pilih salah satu:',
  footer: 'furina-baileys',
  buttons: [
    { type: 'reply', id: '#option1', text: 'Opsi 1' },
    { type: 'reply', id: '#option2', text: 'Opsi 2' },
    { type: 'reply', id: '#option3', text: 'Opsi 3' },
  ],
})
```

### All Button Types

```javascript
await sendButton(sock, jid, {
  text: 'Semua tipe button:',
  footer: 'furina-baileys',
  buttons: [
    // Personal (jalan di WA ORI)
    { type: 'reply', id: '#reply', text: 'Reply' },
    { type: 'list', title: 'List', sections: [{ title: 'Menu', rows: [{ id: '#row', title: 'Row' }] }] },
    { type: 'url', text: 'URL', url: 'https://example.com', webview: true },
    { type: 'call', text: 'Call', phone: '6281234567890' },
    { type: 'copy', text: 'Copy', code: 'CODE-123' },
    { type: 'reminder', text: 'Remind', expiresAt: Date.now() + 3600000 },
    { type: 'cancel-reminder', text: 'Cancel Remind', id: 'rem-1' },
    { type: 'location', text: 'Location' },
    { type: 'address', text: 'Address' },
    
    // Business (butuh akun WA Business)
    { type: 'catalog', text: 'Catalog' },
    { type: 'call-permission', text: 'Call Permission' },
    { type: 'pix', merchantName: 'Store', key: 'store@example.com' },
    { type: 'order', referenceId: 'ORD-1', currency: 'IDR', totalAmount: 50000, items: [{ id: 'i1', name: 'Item', amount: 50000, quantity: 1 }] },
    { type: 'flow', text: 'Flow', flowId: 'flow-id' },
  ],
})
```

### Button with Header

```javascript
await sendButton(sock, jid, {
  header: {
    title: 'Header Title',
    image: fs.readFileSync('./image.jpg'), // atau video: Buffer
  },
  text: 'Body text',
  footer: 'Footer text',
  buttons: [
    { type: 'reply', id: '#btn', text: 'Button' },
  ],
})
```

### Button with Modifiers

```javascript
await sendButton(sock, jid, {
  text: 'Dengan modifier:',
  footer: 'furina-baileys',
  
  // Limited time offer (banner countdown)
  limitedTimeOffer: {
    text: 'Promo berakhir dalam',
    copyCode: 'FLASH50',
    expiresAtMs: Date.now() + 3600000, // 1 jam
  },
  
  // Bottom sheet (collapse button >N)
  bottomSheet: {
    buttonsLimit: 2, // Tampilkan 2 inline, sisanya di sheet
    listTitle: 'Semua opsi',
    buttonTitle: 'Lihat semua',
  },
  
  buttons: [
    { type: 'reply', id: '#1', text: 'Opsi 1' },
    { type: 'reply', id: '#2', text: 'Opsi 2' },
    { type: 'reply', id: '#3', text: 'Opsi 3' },
    { type: 'reply', id: '#4', text: 'Opsi 4' },
    { type: 'copy', text: 'Copy', code: 'CODE' },
  ],
  // has_multiple_buttons otomatis di-inject karena tipe di-mix
})
```

### Button Rules

```javascript
const { FURINA_BUTTON_RULES } = require('@vanzzz/furina-baileys')

console.log('Max buttons per message:', FURINA_BUTTON_RULES.buttonsMax) // 10
console.log('Max template buttons:', FURINA_BUTTON_RULES.templateButtonsMax) // 3
console.log('Max list rows:', FURINA_BUTTON_RULES.listRowsMax) // 10
console.log('Max carousel cards:', FURINA_BUTTON_RULES.carouselCardsMax) // 10
console.log('Max buttons per card:', FURINA_BUTTON_RULES.buttonsPerCardMax) // 10

// Violation = throw (bukan silent truncate)
try {
  await sendButton(sock, jid, {
    text: 'Test',
    buttons: Array(15).fill({ type: 'reply', id: '#x', text: 'X' }),
  })
} catch (e) {
  console.log('Error:', e.message) // "[furina-buttons] maksimal 10 button per pesan"
}
```

---

## 🎠 Carousel

1–10 kartu geser dengan media.

### Basic Carousel

```javascript
const { sendCarousel } = require('@vanzzz/furina-baileys')

await sendCarousel(sock, jid, {
  cards: [
    {
      header: { image: fs.readFileSync('./card1.jpg') },
      body: 'Card 1',
      footer: 'Footer 1',
      buttons: [
        { type: 'reply', id: '#card1', text: 'Card 1 Button' },
      ],
    },
    {
      header: { image: fs.readFileSync('./card2.jpg') },
      body: 'Card 2',
      footer: 'Footer 2',
      buttons: [
        { type: 'url', text: 'Visit', url: 'https://example.com' },
      ],
    },
  ],
})
```

### Carousel with Rules

```javascript
const { FURINA_CAROUSEL_RULES } = require('@vanzzz/furina-baileys')

console.log('Max cards:', FURINA_CAROUSEL_RULES.carouselCardsMax) // 10
console.log('Max buttons per card:', FURINA_CAROUSEL_RULES.buttonsPerCardMax) // 10

// Violation = throw
try {
  await sendCarousel(sock, jid, {
    cards: Array(15).fill({
      header: { image: Buffer.from('') },
      body: 'Card',
      buttons: [{ type: 'reply', id: '#x', text: 'X' }],
    }),
  })
} catch (e) {
  console.log('Error:', e.message) // "[furina-carousel] maksimal 10 kartu"
}
```

---

## 🔨 MessageBuilder

Fluent builder buat compose pesan kompleks. Unifikasi text, media, button, carousel, poll, contact — semua dari satu API.

### Basic Usage

```javascript
const { MessageBuilder } = require('@vanzzz/furina-baileys')

await new MessageBuilder()
  .setText('Halo dari MessageBuilder!')
  .send(sock, jid)
```

### Dengan Button

```javascript
await new MessageBuilder()
  .setText('Pilih salah satu:')
  .addButton({ type: 'reply', id: '#yes', text: 'Ya' })
  .addButton({ type: 'reply', id: '#no', text: 'Tidak' })
  .send(sock, jid)
```

Saat ada button, MessageBuilder otomatis pakai jalur relay + inject node bot (private chat) supaya WhatsApp render button beneran.

### Image + Button (Header Media)

```javascript
const img = fs.readFileSync('./promo.jpg')

await new MessageBuilder()
  .setImage(img, 'Promo hari ini!')
  .addButton({ type: 'url', text: 'Lihat Detail', url: 'https://example.com', webview: true })
  .addButton({ type: 'reply', id: '#beli', text: 'Beli Sekarang' })
  .send(sock, jid)
```

### Carousel

```javascript
await new MessageBuilder()
  .addCard({
    header: { image: img, title: 'Kartu 1' },
    body: 'Deskripsi kartu 1',
    buttons: [{ type: 'reply', id: '#c1', text: 'Pilih' }],
  })
  .addCard({
    header: { image: img, title: 'Kartu 2' },
    body: 'Deskripsi kartu 2',
    buttons: [{ type: 'url', text: 'Buka', url: 'https://example.com' }],
  })
  .send(sock, jid)
```

### Quoted + Ad Reply

```javascript
await new MessageBuilder()
  .setText('Balasan dengan quote:')
  .setQuoted(originalMessage)
  .setAdReply({
    title: 'Furina Store',
    body: 'Promo hari ini',
    thumbnail: 'https://example.com/thumb.png',
    sourceUrl: 'https://github.com/reivalavandy06-oss/furina-baileys',
  })
  .send(sock, jid)
```

### Media Lainnya

```javascript
// Video
await new MessageBuilder()
  .setVideo(fs.readFileSync('./clip.mp4'), 'Caption video')
  .send(sock, jid)

// Document
await new MessageBuilder()
  .setDocument(fs.readFileSync('./file.pdf'), 'laporan.pdf', 'application/pdf')
  .send(sock, jid)

// Audio (voice note)
await new MessageBuilder()
  .setAudio(fs.readFileSync('./voice.ogg'), true)
  .send(sock, jid)

// Sticker (harus WebP)
await new MessageBuilder()
  .setSticker(fs.readFileSync('./sticker.webp'))
  .send(sock, jid)
```

### Poll, Location, Contact

```javascript
// Poll
await new MessageBuilder()
  .setPoll('Makan apa?', ['Pizza', 'Bakso', 'Mie'], 1)
  .send(sock, jid)

// Location
await new MessageBuilder()
  .setLocation({ degreesLatitude: -6.1754, degreesLongitude: 106.8272, name: 'Monas', address: 'Jakarta' })
  .send(sock, jid)

// Contact vCard
await new MessageBuilder()
  .setContact({ phoneNumber: '6281234567890', fullName: 'Furina Store', org: 'Furina Corp' })
  .send(sock, jid)
```

### Auto-Mention

```javascript
// Mention otomatis parse @6281234567890 dari text
await new MessageBuilder()
  .setText('Halo @6281234567890, cek ini!')
  .send(sock, jid)

// Atau tambah manual
await new MessageBuilder()
  .setText('Update penting:')
  .addMention('6281234567890@s.whatsapp.net')
  .send(sock, jid)
```

### Method Reference

| Method | Deskripsi |
|---|---|
| `setText(text, autoMention?)` | Set text + auto-parse mention |
| `setImage(buf, caption?)` | Image + caption |
| `setVideo(buf, caption?, gifPlayback?)` | Video |
| `setAudio(buf, ptt?)` | Audio / voice note |
| `setDocument(buf, fileName, mimetype?, caption?)` | Document |
| `setSticker(buf, isAnimated?)` | Sticker (WebP) |
| `setLocation(opts)` | Location message |
| `setContact(opts)` | Contact vCard |
| `setPoll(name, values, selectableCount?)` | Poll |
| `setReaction(key, text)` | Reaction ke pesan |
| `setViewOnce(enabled?)` | View-once (image/video only) |
| `setQuoted(msg)` | Quote pesan lain |
| `setAdReply(opts)` | Ad reply (thumbnail + source URL) |
| `addMention(...jids)` | Tambah mention |
| `addButton(btn)` | Tambah button (maks 10) |
| `addCard(card)` | Tambah carousel card (maks 10, wajib media) |
| `send(sock, jid, opts?)` | Kirim ke tujuan |

### Auto-Deteksi Jalur

MessageBuilder otomatis pilih jalur kirim:

- **Pesan biasa** (text, media, dll) → `sock.sendMessage()`
- **Ada button** → `generateWAMessageFromContent()` + `sock.relayMessage()` + node bot
- **Ada carousel** → jalur relay + node carousel

User nggak perlu tau bedanya.

## 📊 Button Tracker

Track button taps dari user.

### Basic Tracker

```javascript
const { parseButtonResponse, createFurinaButtonTracker } = require('@vanzzz/furina-baileys')

// Manual parsing
sock.ev.on('messages.upsert', ({ messages }) => {
  for (const m of messages) {
    const btn = parseButtonResponse(m)
    if (btn) {
      console.log('Button tapped:', btn.kind, btn.id, btn.displayText)
      
      switch (btn.kind) {
        case 'reply':
          console.log('Reply button:', btn.id)
          break
        case 'list':
          console.log('List row:', btn.id, btn.displayText)
          break
        case 'order':
          console.log('Order:', btn.order)
          break
        // ... other kinds
      }
    }
  }
})

// Or use tracker
const tracker = createFurinaButtonTracker()

tracker.on('reply', (id, text) => {
  console.log('Reply:', id, text)
})

tracker.on('list', (id, title) => {
  console.log('List:', id, title)
})

tracker.on('order', (order) => {
  console.log('Order:', order)
})

sock.ev.on('messages.upsert', ({ messages }) => {
  for (const m of messages) {
    tracker.process(m)
  }
})
```

---

## ⚠️ Region & Asset-Gated Buttons

Empat tipe button **sudah ada di library dan payload-nya benar**, tetapi WhatsApp **tidak akan merendernya** kecuali syarat platform terpenuhi. Validasi terjadi **server-side di Meta** — bukan bug library.

### Affected Buttons

| Tipe | Syarat platform | Realita di Indonesia |
|---|---|---|
| `pix` (`payment_info`) | Rekening/CPF **Brasil**, divalidasi bank sentral BR | ❌ tidak akan pernah render |
| `order` (`review_and_pay`) | Payments live penuh hanya **India & Brasil** + onboarding payment provider | ❌ limited testing |
| `flow` | `flow_id` wajib published via **WABA/Cloud API** (nomor Cloud API tidak bisa bareng sesi Web) | ❌ tidak bisa dimiliki dari Baileys |
| `product-list` | `productId` wajib asli dari katalog yang **commerce-ready** (produk draft/review tidak terbaca API) | ⚠️ bisa kalau produk sudah approved |

### Workaround untuk Seller Indo

```javascript
// Pembayaran manual ala QRIS (pengganti PIX/review_and_pay)
await sendButton(sock, jid, {
  text: '💳 Pembayaran INV-2026-001',
  limitedTimeOffer: { 
    text: 'Bayar dalam', 
    copyCode: 'INV-2026-001', 
    expiresAtMs: Date.now() + 3600000 
  },
  buttons: [
    { type: 'copy', text: '💠 Copy Kode QRIS', code: 'QRIS-LO' },
    { type: 'url', text: '🔗 Payment Link', url: 'https://payment.link/lo', webview: true },
    { type: 'reply', id: '#paid', text: '✅ Udah Bayar' },
  ],
})

// Form via webview in-app (pengganti flow — UX mirip, server milik lo)
await sendButton(sock, jid, {
  text: '📝 Form order (buka in-app):',
  buttons: [
    { type: 'url', text: '📝 Isi Form', url: 'https://form.lo/order', webview: true },
  ],
})
```

### Product-List dengan Produk Asli

```javascript
// Pastikan produk status "Aktif/approved" di app WA Business

// Check catalog
const catalog = await sock.getCatalog({ jid: sock.user.id, limit: 20 })
console.log('Products:', catalog.products)

// Create product (helper tersedia)
await sock.productCreate({
  name: 'Produk Saya',
  description: 'Deskripsi produk',
  price: 50000,
  currency: 'IDR',
  images: [fs.readFileSync('./product.jpg')],
})

// Send product-list dengan productId asli
await sendButton(sock, jid, {
  text: 'Katalog produk:',
  buttons: [
    { type: 'product-list', productIds: ['productIdAsli1', 'productIdAsli2'] },
  ],
})
```

---

## 🏪 Business Account Notes

Status business menempel ke **nomor**, bukan app.

### Convert ke Business

1. Download app **WhatsApp Business** (gratis)
2. Convert nomor lo ke business (bisa di-uninstall setelahnya)
3. Link device via pairing code dari library ini

### Business-Only Features

- `catalog` button — Buka katalog
- `call-permission` button — Minta izin telepon
- `pix` button — Payment (region Brasil)
- `order` button — Review & pay (region India/Brasil)
- `product-list` — Grid produk dari katalog

### Personal Account Limitations

Di akun personal, button business akan **silent-ignore** oleh WhatsApp (body render, button drop).

---

## 📚 API Reference

### Core Functions

- `makeWASocket(config)` — Create socket instance
- `useMultiFileAuthState(folder)` — Multi-file auth state
- `useSingleFileAuthState(file)` — Single-file auth state (deprecated)

### Connection

- `sock.ev.on('connection.update', callback)` — Connection events
- `sock.ev.on('creds.update', callback)` — Credentials update
- `sock.ev.on('messages.upsert', callback)` — New messages
- `sock.requestPairingCode(phone, customCode?)` — Request pairing code

### Messages

- `sock.sendMessage(jid, message, options?)` — Send message
- `sock.sendPresenceUpdate(type, jid?)` — Update presence
- `sock.readMessages(keys)` — Mark as read

### Buttons

- `sendButton(sock, jid, options)` — Send interactive button
- `sendCarousel(sock, jid, options)` — Send carousel
- `parseButtonResponse(message)` — Parse button tap
- `createFurinaButtonTracker()` — Create button tracker

### CRM

- `CRMBroadcastManager(sock, storage)` — CRM manager
- `InMemoryStorage()` — In-memory storage
- `storage.tagCustomer(jid, tags)` — Tag customer
- `storage.getCustomer(jid)` — Get customer
- `storage.getAnalytics()` — Get analytics
- `crm.send(filter, message, options?)` — Broadcast

### Resolver

- `getFurinaResolver(sock)` — Get resolver instance
- `resolver.resolveLID(pn)` — Phone → LID
- `resolver.resolvePN(lid)` — LID → Phone
- `resolver.searchByUsername(username)` — Search user
- `resolver.fetchUserInfo(jid)` — Fetch user info
- `isGroup(jid)`, `isLID(jid)`, `isNewsletter(jid)` — Type checks

### Utilities

- `Browsers.ubuntu/macOS/windows/android/baileys/appropriate` — Browser identities
- `FURINA_BUTTON_RULES` — Button validation rules
- `FURINA_CAROUSEL_RULES` — Carousel validation rules
- `DisconnectReason` — Disconnect reason codes
- `detectMessageType(message)` — Detect 96+ message types

---

## 🐛 Troubleshooting

### Connection Issues

**Problem:** Connection closed immediately
```javascript
// Check reason
sock.ev.on('connection.update', (update) => {
  const { connection, lastDisconnect } = update
  if (connection === 'close') {
    console.log('Reason:', lastDisconnect?.error?.output?.statusCode)
    // 401 = logged out, need to re-pair
    // 503 = temporary, will auto-reconnect
  }
})
```

**Problem:** Pairing code not working
- Pastikan nomor format internasional (6281234567890)
- Tunggu 30 detik setelah request
- Cek koneksi internet

### Button Issues

**Problem:** Button tidak muncul di HP
- Cek apakah button region-gated (PIX, order, flow, product-list)
- Pastikan akun business untuk button business
- Cek `FURINA_BUTTON_RULES` — violation = throw

**Problem:** Button tap tidak ke-catch
```javascript
// Pastikan parse button response
sock.ev.on('messages.upsert', ({ messages }) => {
  for (const m of messages) {
    const btn = parseButtonResponse(m)
    if (btn) console.log('Tap:', btn)
  }
})
```

### CRM Issues

**Problem:** Storage tidak persist
- Gunakan custom storage implementation (database)
- `InMemoryStorage` hilang saat restart

**Problem:** Broadcast tidak terkirim
- Cek health score (`antiban.on('health-change')`)
- Pastikan tidak auto-paused
- Cek rate cap

---

## 📄 License

### English

Licensed under **Apache License 2.0** with attribution requirements.

**Copyright:**
- WhiskeySockets/Baileys (2025) — original project
- Avandy (2026) — modifications and additional features

**Attribution Requirement:**

If you use, modify, or distribute this library, you must credit:
- Original creators: WhiskeySockets
- Modifications: Avandy
- Repository: https://github.com/reivalavandy06-oss/furina-baileys

**How to credit:**
```markdown
Built with [Furina-Baileys](https://github.com/reivalavandy06-oss/furina-baileys)
Based on [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys)
Modifications by Avandy
```

**Forking policy:** Forks must maintain proper attribution. Removing credits without permission may result in DMCA takedown notices.

---

### Bahasa Indonesia

Dilisensikan di bawah **Apache License 2.0** dengan syarat atribusi.

**Hak Cipta:**
- WhiskeySockets/Baileys (2025) — proyek asli
- Avandy (2026) — modifikasi dan fitur tambahan

**Syarat Atribusi:**

Jika Anda menggunakan, memodifikasi, atau mendistribusikan library ini, Anda wajib memberikan kredit kepada:
- Pembuat asli: WhiskeySockets
- Modifikasi: Avandy
- Repository: https://github.com/reivalavandy06-oss/furina-baileys

**Cara memberikan kredit:**
```markdown
Dibuat dengan [Furina-Baileys](https://github.com/reivalavandy06-oss/furina-baileys)
Berdasarkan [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys)
Modifikasi oleh Avandy
```

**Kebijakan forking:** Fork wajib mempertahankan atribusi yang tepat. Menghapus kredit tanpa izin dapat dikenakan DMCA takedown notice.

**Disclaimer:** Library ini untuk automation yang legitim. Penyalahgunaan (spam, scam, blast tanpa izin) adalah tanggung jawab user, bukan developer.

---

## 🎭 Credits

- **Furina** (Genshin Impact character) — inspiration for project name and visual identity
- **Art & demo content** — created by Avandy
- **Upstream foundation** — [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys)

---

<div align="center">

**Made with 💙 by the Furina-Baileys team**

[Report Bug](https://github.com/reivalavandy06-oss/furina-baileys/issues) · [Request Feature](https://github.com/reivalavandy06-oss/furina-baileys/issues)

</div>
