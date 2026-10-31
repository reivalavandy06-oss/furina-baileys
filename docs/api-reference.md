API Reference

Daftar API publik yang tersedia.

[Dokumentasi utama](../README.md) · **Navigasi docs:** [beranda](index.md)

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
- `resolver.searchByUsername(username)` — Search user (supports ORI, SMB/business, and LID-only accounts)
- `resolver.fetchUserInfo(jid)` — Fetch user info
- `isGroup(jid)`, `isLID(jid)`, `isNewsletter(jid)` — Type checks

### USync Query

- `new USyncQuery()` — Build a USync query
- `.withUsernameProtocol()` / `.withContactProtocol()` / `.withLIDProtocol()` — Standard username lookup protocols
- `.withBusinessProtocol()` — Fetch WhatsApp Business (SMB) metadata. The parsed entry exposes `{ verifiedName, verifiedLevel, profileTag, pnJid }` under the `business` protocol result.
- `.withBotProfileProtocol()` — Fetch bot/AI profile data
- `parseUSyncQueryResult(result)` — Parse a raw `<usync>` result into `{ list, sideList }`

### Utilities

- `Browsers.ubuntu/macOS/windows/android/baileys/appropriate` — Browser identities
- `FURINA_BUTTON_RULES` — Button validation rules
- `FURINA_CAROUSEL_RULES` — Carousel validation rules
- `DisconnectReason` — Disconnect reason codes
- `detectMessageType(message)` — Detect 96+ message types

---

---

## Navigasi dokumentasi

- [Getting Started](getting-started.md) — Koneksi dasar, pairing, dan quick start.
- [Stability Layer](stability.md) — Pemantau koneksi, backoff eksponensial, dan stealth mode.
- [Broadcast CRM](broadcast-crm.md) — Broadcast personal, grup, dan kanal dengan segmentasi dan anti-ban.
- [Message Detection](message-detection.md) — Mengenali 97 tipe pesan WhatsApp.
- [Anti-BAN Protection](antiban.md) — Perlindungan anti-ban: timing manusia, rate limiter, dan health monitor.
- [Furina Resolver](resolver.md) — Mapping LID ↔ PN dua arah, query USync, dan util link wa.me.
- [Message Builder](message-builder.md) — Button interaktif, carousel, MessageBuilder, dan button tracker.
- **API Reference** — _halaman ini_
- [Troubleshooting](troubleshooting.md) — Masalah umum, reconnect, session, rate limit, delivery, quarantine.
- [Lisensi](license.md) — Detail lisensi Apache-2.0 dan kewajiban atribusi.
- [Credits](credits.md) — Kredit dan atribusi proyek.
