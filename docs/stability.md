Stability Layer

Pemantau koneksi, backoff eksponensial, dan stealth mode.

[Dokumentasi utama](../README.md) · **Navigasi docs:** [beranda](index.md)

---

## 🛡️ Stability Layer

Connection monitoring dengan structured logging, backoff calculator, dan stealth mode. Aktif by default, akses via `sock.stability`.

> [!IMPORTANT]
> Library ini **tidak auto-reconnect**. Stability layer cuma ngasih: stats, backoff delay calculator, dan saran kapan harus reconnect. User tetap yang panggil `makeWASocket` ulang.

### Access Stability

```javascript
const sock = makeWASocket({ auth: state })
const stability = sock.stability
const stats = stability.getStats()

console.log({
  totalErrors: stats.totalErrors,
  reconnectAttempts: stats.reconnectAttempts,
  isPaused: stats.isPaused,
  pausedUntil: stats.pausedUntil,
})
```

### Opt-Out & Custom Config

```javascript
// Matiin stability layer
const sock = makeWASocket({ auth: state, stability: false })

// Custom config
const sock = makeWASocket({
  auth: state,
  stability: {
    maxRetries: 10,
    baseReconnectDelay: 5000,
    autoPauseAfter: 5,
    stealthMode: true,
    logLevel: 'info',
    onLog: (level, msg) => console.log(`[stability][${level}]`, msg),
  },
})
```

### StabilityConfig Reference

| Field | Default | Deskripsi |
|---|---|---|
| `autoRecovery` | `true` | Cek apakah disconnect recoverable |
| `maxRetries` | `5` | Max reconnect attempt sebelum pause |
| `baseReconnectDelay` | `3000` | Base delay backoff (ms) |
| `maxReconnectDelay` | `30000` | Cap delay backoff (ms) |
| `jitter` | `500` | Random jitter tambahan (ms) |
| `autoPauseAfter` | `3` | Auto-pause setelah N error beruntun |
| `autoPauseDuration` | `600000` | Durasi pause (ms) |
| `stealthMode` | `true` | Random jitter biar nggak detectable |
| `logLevel` | `'error'` | `silent`/`error`/`warn`/`info`/`debug` |
| `onLog` | — | Custom log handler |

### Manual Reconnect Pattern

Karena library nggak auto-reconnect, ini pattern yang disarankan:

```javascript
async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')
  const sock = makeWASocket({ auth: state })
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const stats = sock.stability?.getStats()

      if (code === DisconnectReason.loggedOut) {
        console.log('Logged out. Pairing ulang.')
        return
      }

      const delay = stats?.isPaused
        ? (stats.pausedUntil - Date.now())
        : 3000

      console.log(`Reconnect in ${delay / 1000}s`)
      setTimeout(start, delay)
    }

    if (connection === 'open') {
      console.log('✅ Connected')
    }
  })
}
```

### Manual Reset

```javascript
sock.stability.resetReconnectCounters()
```

### Sub-Handlers

```javascript
sock.stability.getSessionHandler()   // Session recovery
sock.stability.getCryptoHandler()    // Crypto error handling
sock.stability.getProtocolHandler()  // Protocol error handling
sock.stability.getMessageHandler()   // Duplicate message detection
```

### Runtime Log Level

```javascript
sock.stability.setLogLevel('debug')
sock.stability.setLogLevel('silent')
```

---

## Navigasi dokumentasi

- [Getting Started](getting-started.md) — Koneksi dasar, pairing, dan quick start.
- **Stability Layer** — _halaman ini_
- [Broadcast CRM](broadcast-crm.md) — Broadcast personal, grup, dan kanal dengan segmentasi dan anti-ban.
- [Message Detection](message-detection.md) — Mengenali 97 tipe pesan WhatsApp.
- [Anti-BAN Protection](antiban.md) — Perlindungan anti-ban: timing manusia, rate limiter, dan health monitor.
- [Furina Resolver](resolver.md) — Mapping LID ↔ PN dua arah, query USync, dan util link wa.me.
- [Message Builder](message-builder.md) — Button interaktif, carousel, MessageBuilder, dan button tracker.
- [API Reference](api-reference.md) — Daftar API publik yang tersedia.
- [Troubleshooting](troubleshooting.md) — Masalah umum, reconnect, session, rate limit, delivery, quarantine.
- [Lisensi](license.md) — Detail lisensi Apache-2.0 dan kewajiban atribusi.
- [Credits](credits.md) — Kredit dan atribusi proyek.
