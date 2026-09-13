# Changelog

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
