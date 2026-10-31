Furina Resolver

Mapping LID ↔ PN dua arah, query USync, dan util link wa.me.

[Dokumentasi utama](../README.md) · **Navigasi docs:** [beranda](index.md)

---

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

### Business & Username Search (ORI / SMB / LID)

`resolveTarget('@username')` (dan `searchByUsername`) kini mendukung **akun WhatsApp biasa (ORI) maupun akun bisnis (SMB)**, serta akun yang hanya ter-address lewat **LID**. Untuk akun bisnis, hasilnya juga membawa metadata bisnis seperti `verifiedName`, `verifiedLevel`, dan `profileTag` dari protokol USync `business`.

```javascript
const user = await resolver.searchByUsername('username')
console.log(user?.isBusiness) // true untuk akun bisnis
console.log(user?.verifiedName) // nama bisnis terverifikasi (jika ada)
console.log(user?.verifiedLevel) // 'high' | 'low' (jika ada)
console.log(user?.pn) // PN hasil pemetaan untuk akun LID-only (jika ada)
```

> [!WARNING]
> Fitur ini membutuhkan akun pengirim dengan status 'Community/Contact-tier'. Jika akun baru/kena limit, hasilnya bisa NULL.

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

---

## Navigasi dokumentasi

- [Getting Started](getting-started.md) — Koneksi dasar, pairing, dan quick start.
- [Stability Layer](stability.md) — Pemantau koneksi, backoff eksponensial, dan stealth mode.
- [Broadcast CRM](broadcast-crm.md) — Broadcast personal, grup, dan kanal dengan segmentasi dan anti-ban.
- [Message Detection](message-detection.md) — Mengenali 97 tipe pesan WhatsApp.
- [Anti-BAN Protection](antiban.md) — Perlindungan anti-ban: timing manusia, rate limiter, dan health monitor.
- **Furina Resolver** — _halaman ini_
- [Message Builder](message-builder.md) — Button interaktif, carousel, MessageBuilder, dan button tracker.
- [API Reference](api-reference.md) — Daftar API publik yang tersedia.
- [Troubleshooting](troubleshooting.md) — Masalah umum, reconnect, session, rate limit, delivery, quarantine.
- [Lisensi](license.md) — Detail lisensi Apache-2.0 dan kewajiban atribusi.
- [Credits](credits.md) — Kredit dan atribusi proyek.
