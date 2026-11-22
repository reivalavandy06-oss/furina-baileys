# Changelog

## Unreleased

### Fixed
- SQLite `compareAndSet` now reliably detects conditional mutation results, including structural drivers that return void from `run()`, by reading `changes` from the result or `SELECT changes()` on the same connection.
- Restored the historical `{ state, saveCreds }` runtime shape and default return type for owned SQLite/Mongo/Redis Auth State wrappers; close is available through the additive `closeAuthState(auth)` helper instead of a new wrapper field.
- Corrected documentation for Auth State examples, optional database drivers, SQLite CAS capability detection, and NekoDB connection shutdown.

### Added
- Public `closeAuthState` helper for closing Auth State wrappers whose connection is owned by the library.
- `docs/upgrade-notes.md` for differences between the development branch and the last npm package.
- SQLite CAS regression tests for supported, structural, unsupported, delete, and driver-throw paths.

### Changed
- Node.js engine range is now `^20.19.0 || >=22.12.0`.
- NekoDB internal test-seam exports are removed from the root package barrel while remaining available to internal unit tests.
- `URLGenerationOptions.fetchOpts.headers` now uses a structural, Node-safe header type instead of the DOM-only `HeadersInit` alias; existing `Headers`, `HeadersInit`, tuple-array, and record header values remain accepted.
- `@types/ws` moved from devDependencies to dependencies because published TypeScript declarations reference the `ws` type.

### Fixed
- Public TypeScript declarations no longer require the DOM lib for `URLGenerationOptions` link-preview header options.

## 1.6.0-furina - 2026-11-09

### Features
- Add optional Trakteer & Saweria WebSocket donation listeners.
- Support multi-target JIDs (PC, Group, Channel) for donation notifications.

### Security
- Add peerDependenciesMeta for optional donation packages to prevent CVE bloat.

## 1.5.0-furina - 2026-11-08

Rilis stabil pertama untuk fitur messaging Fase 8 & 9.

### Features
- AI Rich Message lengkap: `RichMessageBuilder`, `ORich`, embedded screens (A2UI), grid image/reels, album Messages, tombol native, LaTeX, product card, dan DSL markdown (`parseRichMarkdown`).
- `parseRichMarkdown`, `sendTable`, `sendAlbum`, `sendStatusMentions` (media), dan `sendAIRichMessage`.
- Global AI Icon: opsi `{ ai: true }` pada `sendMessage` **dan** `relayMessage`, plus `readRichMessage` untuk membaca `botMetadata`.
- Sticker Pack (`sendStickerPack`), PTV, dan Group Status Messages.
- Newsletter bulk follow (`bulkFollowNewsletter`) dan utilitas admin.
- Commerce: `sendPaymentRequest`, `sendProductCatalog`, `fetchCatalog`.
- VoIP Foundation: event `call` dan `rejectCall`.
- Multi-backend Auth Store: `useSQLiteAuthState`, `useMongoDBAuthState`, `useRedisAuthState`, `createFileAuthStore`.
- Username Management: `checkUsername`, `setUsername`, `setUsernamePin`, `getMyUsername`, `deleteUsername`, `findUserByUsername`.
- Message Search Index (`MessageSearchIndex`) — full-text & regex.
- Panorama Profile Picture (`updatePanoramaProfilePicture`).
- HD Media (`hd: true`) untuk gambar/video tanpa rekompresi.
- `MessageScheduler` & `AutoReplyEngine`.
- `AntiSpamFilter` dengan `scanLink` heuristik offline.
- `sendEventInvite` untuk undangan acara.

### Security
- Menghapus dependency deprecated `request`, menaikkan `link-preview-js` ke v5, dan menambal CVE tersisa (`form-data`, `lodash`, `zod`, `undici`, dll.).
- `assertSafeUrl` memvalidasi semua URL pada field media/link (mitigasi CVE-2026-23866).

## 1.5.0-furina-rc.1 - 2026-11-06

### Features
- Multi-backend Auth Store (SQLite, MongoDB, Redis, File).
- Username Management (check, set, find, delete).
- Message Search Index (regex & full-text).
- Panorama Profile Picture updater.
- HD Media support (hd: true).
- Message Scheduler & Auto-Reply Engine.
- Anti-Spam Filter (heuristic offline).

## 1.4.0-furina-rc.1 - 2026-11-06

### Features
- Global AI Icon option in sendMessage.
- Sticker Pack support, PTV, and Group Status Messages.
- Newsletter bulk follow and admin utilities.
- Commerce: Payment Request and Product Catalog.
- VoIP Foundation: Call events and rejectCall.

### Security
- Remove deprecated request, upgrade link-preview-js to v5, and patch remaining CVEs.

## 1.3.0-furina-rc.1 - 2026-11-02

### Features
- Complete AI Rich Message: RichMessageBuilder, ORich, embedded screens (A2UI), 3P widgets, UX primitives, album messages, AI icon, rich buttons, LaTeX/imagine/product cards, unified response V2, and a markdown DSL (`parseRichMarkdown`).
- Helpers: `sendTable`, `sendList`/`sendRichList`, `sendCodeBlock`, `sendLatex`, `sendLatexImage`, `sendMarkdown`, `sendUnifiedResponse`, `sendTableV2`/`sendCodeBlockV2`/`sendLinkV2`, `sendRichHtml`, `sendAlbum`, `sendStatusMentions` (media support), and `sendAIRichMessage`.
- Parser/decoder: `readRichMessage`, `readEmbeddedTabs`, `readEmbeddedSections`, `decodeAIRich`, `getPlainTextFromUnifiedResponse`.

### Security
- Mitigate production CVEs: bump `link-preview-js` to ^4.0.4 (SSRF) and pin `form-data`, `lodash`, `zod`, `undici` via resolutions.
- URL validation (`assertSafeUrl`) for all rich-message media/link fields (CVE-2026-23866 mitigation).

## 1.2.0-furina-rc.2 - 2026-10-31

### Features
- Add USyncBusinessProtocol to fetch business metadata (verifiedName, profileTag, pnJid).
### Fixed
- Improve searchByUsername parsing to support LID-only and SMB accounts.

## 1.2.0-furina-rc.1 - 2026-10-30

### Features
- Enhance searchByUsername to fully support WhatsApp Business (SMB) and LID-only accounts via USync contactType.

## 1.1.3-furina-rc.1 - 2026-10-29

### Security
- Backport CVE-2026-48063 (placeholderResendMessage validation).
- Replace @cacheable/node-cache with lru-cache to mitigate Shai-Hulud supply chain malware risk.
### Fixed
- Update dependencies (ws, protobufjs, pino, music-metadata) to close CVEs.

## 1.1.2-furina-rc.1 - 2026-10-25

- **Fix jids broadcast**: `CRMBroadcastSegment` sekarang punya field `jids?: string[]` (whitelist penerima, AND dengan filter lain, dinormalisasi via `jidNormalizedUser`). `validateSegment` mendeteksi `jids` sebagai filter sehingga tidak lagi memicu warning "TANPA FILTER"
- **Fix usync resolver**: `searchByUsername` memakai engine `executeUSyncQuery` (USyncQuery + USyncUser) alih-alih XML manual; mapping `lid`/`pn` dikoreksi (akun LID-only tidak lagi salah isi `pn`), deteksi akun bisnis hanya via bot profile. `resolveTarget` kini merutekan `@username` lewat usync (bukan branch JID mentah) dan menolak server non-WhatsApp
- **Fix stability reconnect**: perbaikan alur reconnect/sync agar tidak deadlock dan melewati penantian history sync 20s saat data sync sudah ada
- **Fix Lt-Hash**: `lt-hash` dikembalikan ke implementasi pure-JS (pointwise u16 add/sub + hkdf) — menghapus dependensi runtime `whatsapp-rust-bridge` yang ESM-only dan mematahkan tree CJS
- **CI**: ESLint flat config diperbaiki (lint file `.ts`/`.mts`, global ignores untuk `node_modules`/`lib`/dll agar tidak timeout) dan workflow E2E distabilkan (`continue-on-error`)

## 1.1.1-furina

- **Fix broken 1.1.0-furina**: paket terbit dengan `"type": "commonjs"` di root package.json — padahal `lib/WAProto/index.js` (satu salinan yang dipakai bersama oleh tree CJS dan ESM) berisi sintaks ESM. Root `type: "commonjs"` mematikan module-syntax detection Node sehingga `require()` dan `import` dari konsumer sama-sama gagal. Field tersebut dihapus, mengembalikan perilaku paket 1.0.5-furina yang terbukti jalan
- **Fix CJS entry**: `lt-hash` dikembalikan ke implementasi pure-JS (algoritma upstream: pointwise u16 add/sub + hkdf). `whatsapp-rust-bridge` ESM-only (exports map tanpa kondisi `require`) sehingga tree CJS gagal dimuat; sekarang tidak ada lagi import rust-bridge di jalur entry
- **Isi sama dengan 1.1.0-furina**: 24 perbaikan audit — kanonikalisasi JID lintas flow CRM, listener lifecycle (`dispose()`), memory bounded (conversation history, button tracker, pending updates, risk events), rolling hourly limiter, quarantine 403 persist, per-minute quota accounting, delivery tracker buffering, monotonic delivery status, owner check `areJidsSameUser`, guard content kosong, normalisasi channel JID, dry-run tanpa membebani health guard, latch per content window
- **Toolchain**: Yarn 4.9.2 runtime di-commit (`yarnPath`), `yarn.lock` reproducible, publish via GitHub Actions + npm Trusted Publishing (`publish.yml`, `workflow_dispatch`), rename ke `@vanzzz/furina-baileys`, README ringkas untuk npm + dokumentasi panjang di `docs/`
- 1.1.0-furina di-deprecate: jangan dipakai, gunakan 1.1.1-furina

## 1.0.6-furina

- **MessageBuilder rewrite**: full replace dengan quoted-inject di jalur relay, carousel pakai `buildCarouselNodes(jid)`, error prefix `[furina-builder]`
- **Fix node bot private chat**: `buildCarouselNodes(jid)` tambah node `bot` (`biz_bot=1`) — button + carousel sekarang render di WA ORI private chat (verified real device)
- **Fix bug**: `setQuoted()` + button (sebelumnya quote di-drop), `addCard()` tolak kartu tanpa media, `setViewOnce()` hanya image/video, carousel upload gagal reset `hasMediaAttachment`
- **Modular refactor**: 7 file messaging dipindah ke `src/Utils/messaging/` (`types.ts`, `senders.ts`, `carousel.ts`, `message-builder.ts`, `button-tracker.ts`, `button-builders.ts`, `index.ts`)
- **Resolver upgrade**: capture mapping dari `messaging-history.set` + `contacts.upsert` + `contacts.update` + private chat (`remoteJidAlt`), helper `normalizeJid()`, `toWhatsAppLink()`, `fromWhatsAppLink()`, `resolveMany()` chunk 5
- **Known issue**: `viewOnce` outgoing masih silent drop di upstream `7.0.0-rc14` (bug platform, bukan fork). Badge AI muncul di private chat sebagai efek node `bot`
- **Tooling**: migrasi ke npm 12.0.2, `yarn.lock` dihapus, `.gitignore` diperketat (auth_info_business, tests, docs)

## 1.0.5-furina

- **Modular split**: `buttons.ts` dipecah jadi `buttons-types.ts`, `buttons-builders.ts`, `button-tracker.ts`
- **Fitur baru**: `bottomSheet`, `limitedTimeOffer`, auto-inject `has_multiple_buttons`, tipe `call-permission`, tipe `pix`, payload `order` lengkap (`{value, offset}`), `sendProductList`
- **Rename**: `FURINA_BUTTON_LIMITS` → `FURINA_BUTTON_RULES`, `FURINA_CAROUSEL_LIMITS` → `FURINA_CAROUSEL_RULES`
- **Defensif**: `toNativeButton` throw eksplisit untuk tipe tak dikenal
- **Docs**: matriks tested-on-device + penjelasan jujur region/asset-gated (PIX, order, flow, product-list) + workaround seller Indo

## 1.0.4-furina

- Button interaktif native (reply/list/url/call/copy/reminder/location/address/catalog/order/flow)
- Carousel 1–10 kartu + tracker tap
- Stabilitas koneksi & pairing code native

## 1.0.3-furina

- CRM system lengkap (customer tracking, conversation, activity, analytics)
- Broadcast automation (personal/group/channel) dengan anti-ban delays
- Message detection 96+ tipe
- Furina Resolver (LID mapping + USync queries + legacy helpers)
- Anti-BAN protection (Gaussian delay, rate cap, health monitor)
- Custom pairing code dengan kustomisasi kode
- Custom browser identity

## 1.0.0-furina

- Initial fork dari WhiskeySockets/Baileys
- Stability layer (auto-reconnect, backoff, stealth mode)
- Dual CJS/ESM build
