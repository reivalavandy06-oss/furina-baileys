Troubleshooting

Masalah umum, reconnect, session, rate limit, delivery, quarantine.

[Dokumentasi utama](../README.md) · **Navigasi docs:** [beranda](index.md)

---

## 🐛 Troubleshooting

### Connection Issues

**Problem:** Connection closed immediately
```javascript
// Check reason
sock.ev.on('connection.update', (update) => {
  const { connection, lastDisconnect } = update
  if (connection === 'close') {
    console.log('Reason:', lastDisconnect?.error?.output?.statusCode)
    // 401 = logged out, need to re-pair
    // 503 = temporary, will auto-reconnect
  }
})
```

**Problem:** Pairing code not working
- Pastikan nomor format internasional (6281234567890)
- Tunggu 30 detik setelah request
- Cek koneksi internet

### Button Issues

**Problem:** Button tidak muncul di HP
- Cek apakah button region-gated (PIX, order, flow, product-list)
- Pastikan akun business untuk button business
- Cek `FURINA_BUTTON_RULES` — violation = throw

**Problem:** Button tap tidak ke-catch
```javascript
// Pastikan parse button response
sock.ev.on('messages.upsert', ({ messages }) => {
  for (const m of messages) {
    const btn = parseButtonResponse(m)
    if (btn) console.log('Tap:', btn)
  }
})
```

### CRM Issues

**Problem:** Storage tidak persist
- Gunakan custom storage implementation (database)
- `InMemoryStorage` hilang saat restart

**Problem:** Broadcast tidak terkirim
- Cek health score (`antiban.on('health-change')`)
- Pastikan tidak auto-paused
- Cek rate cap

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
- [API Reference](api-reference.md) — Daftar API publik yang tersedia.
- **Troubleshooting** — _halaman ini_
- [Lisensi](license.md) — Detail lisensi Apache-2.0 dan kewajiban atribusi.
- [Credits](credits.md) — Kredit dan atribusi proyek.
