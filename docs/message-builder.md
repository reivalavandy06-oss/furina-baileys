Message Builder

Button interaktif, carousel, MessageBuilder, dan button tracker.

[Dokumentasi utama](../README.md) · **Navigasi docs:** [beranda](index.md)

---

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

---

## Navigasi dokumentasi

- [Getting Started](getting-started.md) — Koneksi dasar, pairing, dan quick start.
- [Stability Layer](stability.md) — Pemantau koneksi, backoff eksponensial, dan stealth mode.
- [Broadcast CRM](broadcast-crm.md) — Broadcast personal, grup, dan kanal dengan segmentasi dan anti-ban.
- [Message Detection](message-detection.md) — Mengenali 97 tipe pesan WhatsApp.
- [Anti-BAN Protection](antiban.md) — Perlindungan anti-ban: timing manusia, rate limiter, dan health monitor.
- [Furina Resolver](resolver.md) — Mapping LID ↔ PN dua arah, query USync, dan util link wa.me.
- **Message Builder** — _halaman ini_
- [API Reference](api-reference.md) — Daftar API publik yang tersedia.
- [Troubleshooting](troubleshooting.md) — Masalah umum, reconnect, session, rate limit, delivery, quarantine.
- [Lisensi](license.md) — Detail lisensi Apache-2.0 dan kewajiban atribusi.
- [Credits](credits.md) — Kredit dan atribusi proyek.
