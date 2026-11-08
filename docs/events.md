Event Invites

Mengirim undangan acara (event) ke chat atau grup.

[Dokumentasi utama](../README.md) · **Navigasi docs:** [beranda](index.md)

---

## 📅 Event Invites

```javascript
const { sendEventInvite } = require('@vanzzz/furina-baileys')

await sendEventInvite(sock, '120363xxxx@g.us', {
  eventId: 'EVT_2026_001',           // dipakai sebagai messageId
  eventTitle: 'Rapat Tim Sprint 12',
  description: 'Review backlog & estimasi',
  startTime: new Date('2026-12-01T10:00:00Z'),
  endTime: new Date('2026-12-01T11:00:00Z'),
  jpegThumbnail: thumbnailBase64,    // opsional
  extraGuestsAllowed: true,
  joinLink: 'https://call.whatsapp.com/v/xxxx'
})
```

### Opsi

| Opsi | Tipe | Keterangan |
|---|---|---|
| `eventTitle` | `string` | **Wajib.** Nama acara |
| `startTime` | `Date \\| number` | **Wajib.** Waktu mulai (auto konversi ke unix seconds) |
| `eventId` | `string?` | Id stabil; dipakai sebagai `messageId` |
| `description` | `string?` | Deskripsi acara |
| `endTime` | `Date \\| number?` | Waktu selesai |
| `joinLink` | `string?` | Link panggilan grup |
| `location` | `LocationMessage?` | Lokasi acara |
| `jpegThumbnail` | `string \\| Buffer?` | Thumbnail (lihat catatan) |
| `extraGuestsAllowed` | `boolean?` | Izinkan tamu tambahan |
| `messageSecret` | `Uint8Array?` | 32-byte secret enkripsi |

Tanpa `eventId`, id pesan digenerate otomatis.

### Catatan protokol (penting)

Bundle proto di repo ini **tidak memiliki `eventInviteMessage`**. Payload acara
memenuhi `eventMessage` (`name`, `description`, `startTime`, `joinLink`,
`location`, …) — field yang benar-benar ada, dan yang dipakai helper ini.

Karena `eventMessage` juga **tidak punya field thumbnail**, `jpegThumbnail`
dibawa pada node `<meta>` beserta penanda `context_source="event_invitation"`:

```
<message type="event">
  <eventMessage>…</eventMessage>
  <meta context_source="event_invitation" jpeg_thumbnail="…"/>
</message>
```

> [!WARNING]
> **NEEDS VERIFICATION** — atribut tepat pada node `<meta>` acara (termasuk
> `jpeg_thumbnail`) belum diverifikasi terhadap akun WhatsApp live. Struktur
> `eventMessage` sendiri sudah sesuai proto. Uji di akun sandbox sebelum produksi.

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
- [Multi-Backend Auth Store](auth-stores.md) — File/SQLite/Mongo/Redis melalui satu kontrak `AuthStore`.
- [Utilities](utilities.md) — Username Manager, Search Index, Scheduler, Auto-Reply, Anti-Spam, dan HD Media.
- **Event Invites** — _halaman ini_
- [API Reference](api-reference.md) — Daftar API publik yang tersedia.
- [Troubleshooting](troubleshooting.md) — Masalah umum, reconnect, session, rate limit, delivery, quarantine.
- [Lisensi](license.md) — Detail lisensi Apache-2.0 dan kewajiban atribusi.
- [Credits](credits.md) — Kredit dan atribusi proyek.
