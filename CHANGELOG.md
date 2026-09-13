# Changelog

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
