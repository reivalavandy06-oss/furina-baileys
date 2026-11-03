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

### AI Rich Message (`rich-message.ts`)

**Builders**

- `RichMessageBuilder` — `addText`, `addCodeBlock`, `addTable`, `addList`, `addLatex`, `addLatexInlineImage`, `addImage`, `addInlineImage`, `addGridImage`, `addReels`, `addVideo`, `addMap`, `addLink`, `addSuggestions`, `addImagine`, `addProductItem`, `addFooterAction`, `addDivider`, `addSpacer`, `addMetadataText`, `addCitation`, `addInlineLink`, `addTaskSection`, `addThinkingSection`, `addProgressSection`, `addImageSection`, `addLatexSection`, `addDividerSection`, `addSpacerSection`, `addSection`, `addViewModel`, `addRawPrimitive`, `addHStack`, `addVStack`, `addActionRow`, `addMarkdown`, `setUnifiedResponse`, `setAiIcon`, `wrapInBotForwarded`, `build`
- `ORich extends RichMessageBuilder` — `addSource`, `addProduct`, `addPost`, `addMetadata`, `addTip`, `addWidget` (with `kind` for 3P sub-types), `addFooterAction`, `addSuggest`, `addButton`, `getButtons`, `embeddedScreen`, `embeddedTab`, `addFOABloksSection`, `addMetaSubsQuotaUpsell`, `setAiIcon`, `addHStack`, `addVStack`, `addSection`

**Senders**

- `sendRichMessage(sock, jid, builder, options?)`
- `sendORichMessage(sock, jid, orich, options?)`
- `sendTable`, `sendRichList` (`sendList` → rich list), `sendCodeBlock`, `sendLatex`, `sendLatexImage`, `sendLatexInlineImage`, `sendMarkdown`
- `sendUnifiedResponse`, `sendTableV2`, `sendCodeBlockV2`, `sendLinkV2`, `sendRichHtml`
- `sendAlbum`, `sendStatusMentions`, `sendAIRichMessage`

**Builders / helpers**

- `buildAlbumMessage(medias, caption?, groupMessageId?)` → `{ albumMessage, albumMediaGroupId }`
- `buildAIRichMessage(options)`, `generateUnifiedContent(payload)`, `generateRichHtmlContent(html)`
- `buildButtonsContent(buttons)`, `toNativeFlowButton(button)`, `buildLatexImageUrl(formula, dpi?)`
- `toBase64Primitive(item)`

**Parser / decoder**

- `readRichMessage(message)` → `ParsedRichMessage | null`
- `readEmbeddedTabs(screen)`, `readEmbeddedSections(screen)`
- `decodeAIRich(message)` → JSON object | null
- `getPlainTextFromUnifiedResponse(payload)` → string
- `captureUnifiedResponse(source)` → JSON string

**Markdown DSL & security**

- `parseRichMarkdown(markdown)` → `ORich`
- `inlineMarkdownToPlain(text)`
- `tokenizeCode(code, language)` → `CodeToken[]`
- `assertSafeUrl(url)` / `isSafeUrl(url)` — only `http:`/`https:` allowed
- `CODE_HIGHLIGHT_TO_PROTO`, `ORICH_WIDGET_TYPENAMES`, `UX_PRIMITIVE_TYPENAMES`

### Messaging Extras (Fase 8)

- `sendStickerPack(sock, jid, { name, publisher, stickers, cover?, description? }, options?)` — sticker pack (auto-split >60, jeda 2s)
- `sendGroupStatus(sock, groupJid, content, options?)` — group status (teks/gambar/video/audio/stiker)
- `bulkFollowNewsletter(sock, jids, options?)` — follow banyak newsletter dengan jeda aman
- `newsletterAdminUtils(sock)` — `getAdminList`, `demoteAdmin`, `promoteAdmin` (unsupported)
- `sendPaymentRequest(sock, jid, { amount, currency, note, sticker? }, options?)` — payment request
- `sendProductCatalog(sock, jid, { title, products }, options?)` — product/catalog message
- `fetchCatalog(sock, jid?)` — ambil katalog bisnis

### VoIP (Fondasi Eksperimental)

- `rejectCall(sock, callId, callFrom)` — tolak panggilan masuk
- `buildRejectCallStanza(callId, callFrom, from)` — stanza `call`/`reject`
- `toActiveCall(call)` — normalisasi event `call`
- `createVoipClient(sock)` → `VoipClient` (stub; media butuh `@roamhq/wrtc`)
- Event: `sock.ev.on('call', ([call]) => …)`

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
- [AI Rich Message](ai-rich-message.md) — Teks kaya, code/tabel, embedded screens, album, tombol, dan DSL markdown.
- [VoIP (Fondasi)](voip.md) — Deteksi panggilan masuk dan penolakan call (eksperimental).
- [Commerce](commerce.md) — Payment request, katalog produk, dan fetch catalog bisnis.
- **API Reference** — _halaman ini_
- [Troubleshooting](troubleshooting.md) — Masalah umum, reconnect, session, rate limit, delivery, quarantine.
- [Lisensi](license.md) — Detail lisensi Apache-2.0 dan kewajiban atribusi.
- [Credits](credits.md) — Kredit dan atribusi proyek.
