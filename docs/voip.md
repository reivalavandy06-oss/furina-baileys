VoIP (Fondasi Eksperimental)

Deteksi panggilan masuk dan penolakan call. Implementasi media WASM/WebRTC belum disertakan.

[Dokumentasi utama](../README.md) · **Navigasi docs:** [beranda](index.md)

---

## ☎️ VoIP — Fondasi (Eksperimental)

> [!WARNING]
> Ini **fondasi**, bukan implementasi panggilan penuh. Modul ini menyediakan tipe,
> helper penolakan, dan event `call`. Audio/video (WASM + WebRTC) **belum**
> diimplementasikan.

### Event `call`

Socket sudah memancarkan event `call` untuk setiap update panggilan
(`offer`, `ringing`, `accept`, `reject`, `timeout`, `terminate`).

```javascript
sock.ev.on('call', async ([call]) => {
  console.log(call.id, call.from, call.status, call.isVideo)
})
```

### Menolak panggilan

```javascript
const { rejectCall, toActiveCall } = require('@vanzzz/furina-baileys')

sock.ev.on('call', async ([call]) => {
  if (call.status === 'offer') {
    await rejectCall(sock, call.id, call.from)
  }
})
```

`rejectCall(sock, callId, callFrom)` memakai `sock.rejectCall` bila tersedia, lalu
fallback ke stanza `call`/`reject` lewat `sock.query`/`sock.sendNode`.

### VoipClient (stub)

```javascript
const { createVoipClient } = require('@vanzzz/furina-baileys')

const voip = createVoipClient(sock)
console.log(voip.available) // false — media stack tidak tersedia
```

### Implementasi penuh membutuhkan `@roamhq/wrtc`

Panggilan audio/video penuh memerlukan:

- `@roamhq/wrtc` (native WebRTC) — **dependency opsional**, tidak wajib.
- Worker threads untuk pipeline WASM (Noise/media codec).
- Manajemen ICE/DTLS dan `call-offer`/`call-accept` yang lengkap.

Semua itu **sengaja tidak** disertakan di build ini agar library tetap ringan dan
tidak menambah dependensi native wajib.

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
- **VoIP (Fondasi)** — _halaman ini_
- [API Reference](api-reference.md) — Daftar API publik yang tersedia.
- [Troubleshooting](troubleshooting.md) — Masalah umum, reconnect, session, rate limit, delivery, quarantine.
- [Lisensi](license.md) — Detail lisensi Apache-2.0 dan kewajiban atribusi.
- [Credits](credits.md) — Kredit dan atribusi proyek.
