<div align="center">

![Furina-Baileys](Media/furina-thumb.jpg)

# 💍 FURINA-BAILEYS

WhatsApp Web API library with CRM, broadcast automation, and anti-ban protection. Built on top of [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys).

`v1.0.4-furina` · TypeScript · Dual CJS/ESM · 🎬 [Demo Video](Media/furina-demo.mp4)

> [!CAUTION]
> Baileys 7.0.0 introduced breaking changes. Check the [migration guide](https://whiskey.so/migrate-latest) before upgrading.

</div>

---

## What Makes This Different

Most WhatsApp libraries give you raw socket access and leave the rest to you. Furina-Baileys adds production features that take weeks to build:

- **CRM system** — track customers, conversations, activity, analytics
- **Broadcast automation** — send to people, groups, or channels with anti-ban delays
- **Message detection** — recognize 96+ message types including view-once and reactions
- **Stability layer** — auto-reconnect, exponential backoff, stealth mode for reconnects

You still get full Baileys API access. This just handles the boring stuff so you can focus on your bot logic.

---

## Quick Start

Install the library:

```bash
npm install furina-baileys
```

Basic connection:

```javascript
import makeWASocket, { useMultiFileAuthState } from 'furina-baileys'

const { state, saveCreds } = await useMultiFileAuthState('auth_info')
const sock = makeWASocket({ auth: state })

sock.ev.on('creds.update', saveCreds)
sock.ev.on('connection.update', (update) => {
  const { connection } = update
  if (connection === 'open') console.log('Connected to WhatsApp')
})
```

Broadcast with anti-ban protection:

```javascript
import { CRMBroadcastManager, InMemoryStorage } from 'furina-baileys'

const storage = new InMemoryStorage()
await storage.init()

const bc = new CRMBroadcastManager(sock, storage)

// Personal broadcast to VIP customers
await bc.send({ tags: ['vip'] }, '{Halo|Hai} {nama}! Ada promo baru nih 📡')

// Group broadcast with delay
await bc.sendToGroups(['120363xxx@g.us'], '{Halo|Hai} semua!')

// Channel broadcast with role check
await bc.sendToChannels(['https://whatsapp.com/channel/XXX'], 'Update bot terbaru!')
```

---

## Documentation

### Furina Features

| Feature | Description | Docs |
|---------|-------------|------|
| 🛰️ Stability | Auto-reconnect, backoff, stealth mode | [Setup Guide](docs/SETUP.md) |
| 🗂️ CRM | Customer tracking, activity, analytics | [CRM System](docs/CRM.md) |
| 🔍 Detection | 96 message types + view-once stub | [Message Detection](docs/MESSAGE-DETECTION.md) |
| 📨 Broadcast Personal | Segment, spintax, personalization | [Personal Broadcast](docs/BROADCAST-PERSONAL.md) |
| 👥 Broadcast Group | Multi-group, community categories | [Group Broadcast](docs/BROADCAST-GROUP.md) |
| 📢 Broadcast Channel | Role guard, registry, link→JID | [Channel Broadcast](docs/BROADCAST-CHANNEL.md) |
| 🛡️ Anti-BAN | Gaussian delay, rate cap, health monitor | [Anti-BAN Guide](docs/ANTI-BAN.md) |

### Upstream Baileys API

Core WhatsApp API documentation moved to `docs/` folder for easier navigation:

| Topic | Docs |
|-------|------|
| Connection, pairing, auth, events | [Connecting](docs/UPSTREAM-CONNECT.md) |
| Messages, media, modify/edit | [Messages](docs/UPSTREAM-MESSAGES.md) |
| Chats, presence, profile | [Chats](docs/UPSTREAM-CHATS.md) |
| Groups & privacy settings | [Groups](docs/UPSTREAM-GROUPS.md) |
| Broadcast lists & stories | [Broadcast](docs/UPSTREAM-BROADCAST.md) |
| Custom functionality, websockets | [Custom](docs/UPSTREAM-CUSTOM.md) |

Official guide: https://baileys.wiki

---

## Responsible Usage

This library is for legitimate automation. Misuse (spam, scams, bulk messaging without consent) is the user's responsibility, not the developer's.

**Guidelines:**
1. Send only to **opt-in lists** (people who gave permission)
2. Respect **opt-out requests** (STOP, BERHENTI, unsubscribe)
3. **Warm up** new numbers gradually over 7 days
4. Monitor **health score** and respect auto-pause triggers
5. Avoid blasting to cold/unknown contact lists

The upstream Baileys maintainers don't condone usage that violates WhatsApp ToS. Use responsibly — your number is your responsibility.

---

## Credits

- **Furina** (Genshin Impact character) — inspiration for project name and visual identity
- **Art & demo content** — created by Avandy
- **Upstream foundation** — [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys)

---

## License & Attribution

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
