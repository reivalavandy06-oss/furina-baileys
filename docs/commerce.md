Commerce (Payment & Product)

Payment request, katalog produk, dan pengambilan katalog bisnis.

[Dokumentasi utama](../README.md) · **Navigasi docs:** [beranda](index.md)

---

## 🛒 Commerce

Helper commerce membentuk payload `requestPaymentMessage` dan `productMessage`
dari proto lokal. Alur bisnis sisi server (capture pembayaran, mutasi katalog)
**belum diverifikasi** terhadap akun bisnis live.

> [!WARNING]
> **NEEDS VERIFICATION** — pembayaran & katalog bergantung pada API bisnis
> WhatsApp yang bisa berubah. Uji di akun bisnis sandbox sebelum produksi.

### Payment Request

```javascript
const { sendPaymentRequest } = require('@vanzzz/furina-baileys')

await sendPaymentRequest(sock, '6281234567890@s.whatsapp.net', {
  amount: 25000,
  currency: 'IDR',
  note: 'Pembayaran pesanan #123',
})
```

Dengan stiker sebagai catatan:

```javascript
await sendPaymentRequest(sock, jid, {
  amount: 25000,
  currency: 'IDR',
  sticker: './sticker.webp',
})
```

| Opsi | Tipe | Keterangan |
|---|---|---|
| `amount` | `number \\| string` | Jumlah (unit minor/`amount1000`) |
| `currency` | `string` | Kode ISO 4217, mis. `IDR` |
| `note` | `string?` | Catatan teks |
| `sticker` | `Buffer \\| string?` | Stiker sebagai catatan media |

Menghasilkan `requestPaymentMessage` dengan `amount1000`, `currencyCodeIso4217`,
`requestFrom`, dan `noteMessage`.

### Product Catalog

```javascript
const { sendProductCatalog } = require('@vanzzz/furina-baileys')

await sendProductCatalog(sock, jid, {
  title: 'Toko Furina',
  description: 'Produk pilihan',
  products: [
    { title: 'Kopi', price: 25000, currency: 'IDR', imageUrl: 'https://cdn/p.png' },
  ],
})
```

Menghasilkan `productMessage` dengan `product` (snapshot), `catalog`, `body`,
dan `footer`. `imageUrl` diunggah via pipeline media yang sama dengan pesan biasa.

### Fetch Catalog

```javascript
const { fetchCatalog } = require('@vanzzz/furina-baileys')

const catalog = await fetchCatalog(sock, '6281234567890@s.whatsapp.net')
console.log(catalog)
```

`fetchCatalog` mendelegasikan ke `sock.getCatalog` bila tersedia; jika tidak,
ia menjalankan query `w:biz:catalog` langsung.

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
- **Commerce** — _halaman ini_
- [API Reference](api-reference.md) — Daftar API publik yang tersedia.
- [Troubleshooting](troubleshooting.md) — Masalah umum, reconnect, session, rate limit, delivery, quarantine.
- [Lisensi](license.md) — Detail lisensi Apache-2.0 dan kewajiban atribusi.
- [Credits](credits.md) — Kredit dan atribusi proyek.
