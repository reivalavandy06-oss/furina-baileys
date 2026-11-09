Integrasi Trakteer

Listener WebSocket donasi Trakteer (opsional) dengan dukungan multi-target JID.

[Dokumentasi utama](../../README.md) · **Navigasi docs:** [beranda](../index.md)

---

## 🔌 Integrasi Trakteer (Opsional)

Fitur ini **opt-in**: paket `trakteerjs` **tidak** ikut terpasang secara default.
Install sendiri sebelum memakai:

```bash
npm install trakteerjs
```

> [!WARNING]
> **Keamanan — tanggung jawab Anda.** `trakteerjs` adalah paket pihak ketiga
> (peer dependency opsional) dan **tidak di-audit** oleh Furina-Baileys.
> Lakukan `npm audit` mandiri untuk paket ini dan tinjau kodenya sebelum
> dipakai di produksi.

### Mengambil Channel ID, Stream Key, dan Hash

| Nilai | Lokasi |
|---|---|
| **Channel ID / Page ID** | [trakteer.id/manage/my-page/settings](https://trakteer.id/manage/my-page/settings) — gunakan **page ID**, bukan username |
| **Stream Key** (`trstream-…`) | [trakteer.id/manage/stream-settings](https://trakteer.id/manage/stream-settings) |
| **Hash** | [trakteer.id/manage/stream-settings/new-tip](https://trakteer.id/manage/stream-settings/new-tip) — ambil dari URL |

> Catatan: di opsi fungsi, **`channelId` adalah page ID** Trakteer.

### Penggunaan dasar

```javascript
const { listenTrakteerDonations } = require('@vanzzz/furina-baileys')

const listener = await listenTrakteerDonations(sock, {
  channelId: 'page_xxx',          // page ID Trakteer
  streamKey: 'trstream-xxxx',
  hash: 'xxxxxxxx',
  targetJid: '6281234567890@s.whatsapp.net'
})

// nanti
await listener.close()
```

### Multi-target (Grup, Channel, PC)

`targetJid` menerima **satu string** atau **array JID**. Setiap donasi dikirim ke
**semua** tujuan:

```javascript
const listener = await listenTrakteerDonations(sock, {
  channelId: 'page_xxx',
  streamKey: 'trstream-xxxx',
  hash: 'xxxxxxxx',
  targetJid: [
    '120363xxxxxxxx@g.us',        // grup
    '120363yyyyyyyy@newsletter',  // channel (newsletter)
    '6281234567890@s.whatsapp.net' // personal chat
  ]
})
```

Setiap JID dinormalisasi dan di-*de-duplicate* otomatis. Bila satu tujuan gagal,
tujuan lain tetap diproses.

### Kustomisasi pesan

```javascript
await listenTrakteerDonations(sock, {
  channelId: 'page_xxx',
  streamKey: 'trstream-xxxx',
  hash: 'xxxxxxxx',
  targetJid: ['120363xxxxxxxx@g.us'],

  // opsi A: formatMessage mengubah teks default
  formatMessage: (d) => ({
    text: `Donasi ${d.price} dari ${d.supporter_name}!\n"${d.supporter_message ?? ''}"`
  }),

  // opsi B: onDonation mengambil alih sepenuhnya
  // onDonation: async (donation, ctx) => {
  //   await ctx.sendMessage({ text: `ada donasi dari ${donation.supporter_name}` })
  //   // return konten -> otomatis di-broadcast ke semua targetJid
  // }
})
```

- Jika `onDonation` diisi: pesan default **tidak** dikirim. Hook bisa memanggil
  `ctx.sendMessage(content)` (otomatis ke semua target) dan/atau mengembalikan
  konten.
- `close()` memutus koneksi dan aman dipanggil berulang kali.

---

## Navigasi dokumentasi

- [Getting Started](../getting-started.md) — Koneksi dasar, pairing, dan quick start.
- [Message Builder](../message-builder.md) — Button, carousel, dan `MessageBuilder`.
- [AI Rich Message](../ai-rich-message.md) — Pesan AI kaya format.
- [Event Invites](../events.md) — Undangan acara.
- [Utilities](../utilities.md) — Scheduler, Auto-Reply, Anti-Spam, dll.
- [Integrasi Trakteer](../integrations/trakteer.md) — _halaman ini_
- [Integrasi Saweria](../integrations/saweria.md) — Listener donasi Saweria.
- [API Reference](../api-reference.md) — Daftar API publik.

---

Kembali ke [beranda docs](../index.md).
