<div align="center">

![Furina-Baileys](Media/furina-thumb.jpg)

# 💍 FURINA-BAILEYS

WhatsApp Web API library dengan **stabilitas koneksi**, **kelengkapan button interaktif**, **CRM automation**, **broadcast anti-ban**, dan **message detection 96+ tipe**.

Built on top of [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys).

`v1.0.5-furina` · TypeScript · Dual CJS/ESM · 🎬 [Demo Video](Media/furina-demo.mp4)

[![npm version](https://img.shields.io/npm/v/furina-baileys.svg)](https://www.npmjs.com/package/furina-baileys)
[![License](https://img.shields.io/npm/l/furina-baileys.svg)](LICENSE)

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
- [📊 Button Tracker](#-button-tracker)
- [⚠️ Region & Asset-Gated Buttons](#️-region--asset-gated-buttons)
- [🏪 Business Account Notes](#-business-account-notes)
- [📚 API Reference](#-api-reference)
- [🐛 Troubleshooting](#-troubleshooting)
- [📄 License](#-license)

---

## ✨ What Makes This Different

Most WhatsApp libraries give you raw socket access and leave the rest to you. Furina-Baileys adds production features that take weeks to build:

- **🛰️ Stability layer** — Auto-reconnect tangguh, exponential backoff, stealth mode untuk reconnects
- **🔘 Button set terlengkap** — 17 tipe native + 4 modifier message-level, verified on-device
- **🗂️ CRM system** — Track customers, conversations, activity, analytics
- **📨 Broadcast automation** — Personal/group/channel dengan anti-ban delays (Gaussian, rate cap)
- **🔍 Message detection** — Recognize 96+ message types termasuk view-once dan reactions
- **🛡️ Anti-BAN protection** — Health monitor, auto-pause, stealth composing
- **🆔 Custom pairing code** — `requestPairingCode(phone, customCode)` tanpa error conflict ID
- **🌐 Custom browser identity** — `Browsers.ubuntu/macOS/baileys/windows/android/appropriate`
- **🆔 Identity resolver** — LID mapping, USync queries, legacy helpers dalam satu interface

You still get full Baileys API access. This just handles the boring stuff so you can focus on your bot logic.

---

## 📦 Installation

```bash
npm install furina-baileys
```

### Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.0.0 (optional, library sudah compiled)

### Verify Installation

```javascript
const baileys = require('furina-baileys')
console.log('Version:', baileys.DEFAULT_CONNECTION_CONFIG?.version)
console.log('Browsers:', Object.keys(baileys.Browsers))
```

---

## 🚀 Quick Start

### Basic Connection (CommonJS)

```javascript
const { makeWASocket, useMultiFileAuthState } = require('furina-baileys')

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
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from 'furina-baileys'

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
const { Browsers } = require('furina-baileys')

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

Auto-reconnect dengan exponential backoff dan stealth mode aktif by default.

### What It Does

- **Auto-reconnect** — Connection putus? Reconnect otomatis dengan exponential backoff
- **Keep-alive tuning** — Ping interval optimal buat mobile/network tidak stabil
- **Stealth mode** — Presence composing saat reconnect biar nggak detectable
- **Auto-recovery** — Session recovery otomatis kalau auth corrupt

### Example with Stability

```javascript
const sock = makeWASocket({
  auth: state,
  // Stability features aktif otomatis
})

sock.ev.on('connection.update', (update) => {
  const { connection, lastDisconnect } = update
  
  if (connection === 'close') {
    const reason = lastDisconnect?.error?.output?.statusCode
    
    if (reason === DisconnectReason.loggedOut) {
      console.log('Logged out, need to re-pair')
      // Clear auth dan re-pair
    } else {
      console.log(`Connection closed (${reason}), auto-reconnecting...`)
      // Library akan auto-reconnect
    }
  }
})
```

---

## 🗂️ CRM System

Track customers, conversations, activity, dan analytics.

### Initialize CRM

```javascript
const { CRMBroadcastManager, InMemoryStorage } = require('furina-baileys')

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
const { detectMessageType } = require('furina-baileys')

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

Gaussian delay (pola natural), rate cap per menit, dan health monitor dengan auto-pause.

### Basic Anti-BAN

```javascript
const { AntiBan } = require('furina-baileys')

const antiban = new AntiBan(sock, {
  gaussianDelay: true, // Delay Gaussian (natural)
  rateCap: 10, // Max 10 message/menit
  healthMonitor: true, // Auto-pause kalau health score turun
})

// Send with anti-ban protection
await antiban.sendMessage(jid, { text: 'Hello' })
await antiban.sendMessage(jid, { text: 'World' })
// Delay otomatis antara message
```

### Advanced Configuration

```javascript
const antiban = new AntiBan(sock, {
  gaussianDelay: true,
  gaussianMean: 3000, // Mean delay 3 detik
  gaussianStdDev: 1000, // Standard deviation 1 detik
  
  rateCap: 15, // Max 15 message/menit
  rateWindow: 60_000, // Window 60 detik
  
  healthMonitor: true,
  healthThreshold: 70, // Pause kalau health < 70
  healthCheckInterval: 300_000, // Check setiap 5 menit
})

// Monitor health
antiban.on('health-change', (score) => {
  console.log('Health score:', score)
  if (score < 50) console.log('⚠️ Health critical!')
})

antiban.on('auto-pause', (reason) => {
  console.log('Auto-paused:', reason)
})
```

### Warm-Up Strategy

```javascript
// Warm up new number gradually
const warmUpDays = 7
const messagesPerDay = [5, 10, 20, 30, 50, 75, 100]

for (let day = 0; day < warmUpDays; day++) {
  const maxMessages = messagesPerDay[day]
  console.log(`Day ${day + 1}: max ${maxMessages} messages`)
  
  // Send up to maxMessages
  for (let i = 0; i < maxMessages; i++) {
    await antiban.sendMessage(jid, { text: `Message ${i + 1}` })
  }
  
  // Wait 24 hours
  await new Promise(resolve => setTimeout(resolve, 24 * 60 * 60 * 1000))
}
```

---

## 🆔 Furina Resolver

Complete WhatsApp identity resolver (LID mapping + USync queries + legacy helpers).

### Initialize Resolver

```javascript
const { getFurinaResolver } = require('furina-baileys')

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
const { isGroup, isLID, isNewsletter, isUser } = require('furina-baileys')

console.log(isGroup('120363xxx@g.us')) // true
console.log(isGroup('6281234567890@s.whatsapp.net')) // false

console.log(isLID('54435237613621@lid')) // true
console.log(isLID('6281234567890@s.whatsapp.net')) // false

console.log(isNewsletter('120363xxx@newsletter')) // true
console.log(isUser('6281234567890@s.whatsapp.net')) // true
```

---

## 🔘 Button Interaktif

17 tipe button native + 4 modifier message-level, verified on-device.

### Basic Button

```javascript
const { sendButton } = require('furina-baileys')

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
const { FURINA_BUTTON_RULES } = require('furina-baileys')

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
const { sendCarousel } = require('furina-baileys')

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
const { FURINA_CAROUSEL_RULES } = require('furina-baileys')

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

## 📊 Button Tracker

Track button taps dari user.

### Basic Tracker

```javascript
const { parseButtonResponse, createFurinaButtonTracker } = require('furina-baileys')

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
