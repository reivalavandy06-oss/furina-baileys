Message Detection

Mengenali 97 tipe pesan WhatsApp.

[Dokumentasi utama](../README.md) · **Navigasi docs:** [beranda](index.md)

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

---

## Navigasi dokumentasi

- [Getting Started](getting-started.md) — Koneksi dasar, pairing, dan quick start.
- [Stability Layer](stability.md) — Pemantau koneksi, backoff eksponensial, dan stealth mode.
- [Broadcast CRM](broadcast-crm.md) — Broadcast personal, grup, dan kanal dengan segmentasi dan anti-ban.
- **Message Detection** — _halaman ini_
- [Anti-BAN Protection](antiban.md) — Perlindungan anti-ban: timing manusia, rate limiter, dan health monitor.
- [Furina Resolver](resolver.md) — Mapping LID ↔ PN dua arah, query USync, dan util link wa.me.
- [Message Builder](message-builder.md) — Button interaktif, carousel, MessageBuilder, dan button tracker.
- [API Reference](api-reference.md) — Daftar API publik yang tersedia.
- [Troubleshooting](troubleshooting.md) — Masalah umum, reconnect, session, rate limit, delivery, quarantine.
- [Lisensi](license.md) — Detail lisensi Apache-2.0 dan kewajiban atribusi.
- [Credits](credits.md) — Kredit dan atribusi proyek.
