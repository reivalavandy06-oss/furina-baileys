Integrasi Saweria

Listener WebSocket donasi Saweria (opsional) dengan dukungan multi-target JID.

[Dokumentasi utama](../../README.md) · **Navigasi docs:** [beranda](../index.md)

---

## 🔌 Integrasi Saweria (Opsional)

Fitur ini **opt-in**: paket `saweria` **tidak** ikut terpasang secara default.
Install sendiri sebelum memakai:

```bash
npm install saweria
```

> [!IMPORTANT]
> Diperlukan **`saweria` v2**. `saweria@1.x` hanyalah wrapper HTTP tanpa
> WebSocket/event donasi, sehingga tidak bisa dipakai untuk listener ini.
> Versi peer dependency yang dipatok adalah `^2.0.0`.

> [!WARNING]
> **Keamanan — tanggung jawab Anda.** `saweria` adalah paket pihak ketiga
> (peer dependency opsional) dan **tidak di-audit** oleh Furina-Baileys.
> Lakukan `npm audit` mandiri untuk paket ini dan tinjau kodenya sebelum
> dipakai di produksi.

### Mengambil Stream Key

| Nilai | Lokasi |
|---|---|
| **Stream Key** | Dashboard Saweria → menu **Stream Key / Donasi** (bagian integrasi OBS/alerts) |

Stream key ini yang dipakai `setStreamKey()` untuk membuka koneksi WebSocket
donasi.

### Penggunaan dasar

```javascript
const { listenSaweriaDonations } = require('@vanzzz/furina-baileys')

const listener = await listenSaweriaDonations(sock, {
  streamKey: 'xxxxxxxx-xxxx-xxxx',
  targetJid: '6281234567890@s.whatsapp.net'
})

// nanti
await listener.close()
```

### Multi-target (Grup, Channel, PC)

```javascript
const listener = await listenSaweriaDonations(sock, {
  streamKey: 'xxxxxxxx-xxxx-xxxx',
  targetJid: [
    '120363xxxxxxxx@g.us',         // grup
    '120363yyyyyyyy@newsletter',   // channel (newsletter)
    '6281234567890@s.whatsapp.net' // personal chat
  ]
})
```

Event `donations` mengirim **array** donasi; tiap donasi diteruskan ke **semua**
JID tujuan. Satu tujuan gagal tidak menghentikan yang lain.

### Kustomisasi pesan

```javascript
await listenSaweriaDonations(sock, {
  streamKey: 'xxxxxxxx-xxxx-xxxx',
  targetJid: ['120363xxxxxxxx@g.us'],

  // opsi A: formatMessage mengubah teks default
  formatMessage: (d) => ({
    text: `Donasi Rp ${d.amount.toLocaleString('id-ID')} dari ${d.donator}`
  }),

  // opsi B: onDonation mengambil alih sepenuhnya
  // onDonation: async (donation, ctx) => {
  //   await ctx.sendMessage({ text: `ada donasi dari ${donation.donator}` })
  // }
})
```

- Jika `onDonation` diisi: pesan default **tidak** dikirim.
- `close()` menutup WebSocket dan aman dipanggil berulang kali.

---

## Navigasi dokumentasi

- [Getting Started](../getting-started.md) — Koneksi dasar, pairing, dan quick start.
- [Message Builder](../message-builder.md) — Button, carousel, dan `MessageBuilder`.
- [AI Rich Message](../ai-rich-message.md) — Pesan AI kaya format.
- [Event Invites](../events.md) — Undangan acara.
- [Utilities](../utilities.md) — Scheduler, Auto-Reply, Anti-Spam, dll.
- [Integrasi Trakteer](../integrations/trakteer.md) — Listener donasi Trakteer.
- [Integrasi Saweria](../integrations/saweria.md) — _halaman ini_
- [API Reference](../api-reference.md) — Daftar API publik.

---

Kembali ke [beranda docs](../index.md).
