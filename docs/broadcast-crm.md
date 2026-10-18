Broadcast CRM

Broadcast personal, grup, dan kanal dengan segmentasi dan anti-ban.

[Dokumentasi utama](../README.md) · **Navigasi docs:** [beranda](index.md)

---

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

---

## Navigasi dokumentasi

- [Getting Started](getting-started.md) — Koneksi dasar, pairing, dan quick start.
- [Stability Layer](stability.md) — Pemantau koneksi, backoff eksponensial, dan stealth mode.
- **Broadcast CRM** — _halaman ini_
- [Message Detection](message-detection.md) — Mengenali 97 tipe pesan WhatsApp.
- [Anti-BAN Protection](antiban.md) — Perlindungan anti-ban: timing manusia, rate limiter, dan health monitor.
- [Furina Resolver](resolver.md) — Mapping LID ↔ PN dua arah, query USync, dan util link wa.me.
- [Message Builder](message-builder.md) — Button interaktif, carousel, MessageBuilder, dan button tracker.
- [API Reference](api-reference.md) — Daftar API publik yang tersedia.
- [Troubleshooting](troubleshooting.md) — Masalah umum, reconnect, session, rate limit, delivery, quarantine.
- [Lisensi](license.md) — Detail lisensi Apache-2.0 dan kewajiban atribusi.
- [Credits](credits.md) — Kredit dan atribusi proyek.
