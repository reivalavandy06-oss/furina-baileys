Anti-BAN Protection

Perlindungan anti-ban: timing manusia, rate limiter, dan health monitor.

[Dokumentasi utama](../README.md) · **Navigasi docs:** [beranda](index.md)

---

## 🛰️ Anti-BAN Protection

Health monitoring, Gaussian jitter delay, sliding-window rate limit, dan jam tidur opt-in.

> [!NOTE]
> Anti-ban layer ini **belum terintegrasi otomatis** ke `makeWASocket`. User panggil manual dari `@vanzzz/furina-baileys`. Integrasi otomatis di roadmap v1.0.7.

### Import

```javascript
const {
  HealthMonitor,
  RateLimiter,
  humanSend,
  getProfile,
  checkSendWindow,
  waitForSendWindow,
} = require('@vanzzz/furina-baileys')
```

### Profile ORI vs Business

```javascript
// ORI: relaxed (60 msg/jam, 600-4000ms typing)
const oriProfile = getProfile('ori')

// Business: stricter (30 msg/jam, 900-5000ms typing)
const bizProfile = getProfile('business')

// Custom override
const customProfile = getProfile('ori', {
  maxPerHour: 40,
  typingMin: 800,
  typingMax: 3000,
  errorThreshold: 4,
})
```

### Profile Reference

| Field | ORI | Business | Deskripsi |
|---|---|---|---|
| `maxPerHour` | 60 | 30 | Max pesan per jam |
| `typingMin` | 600 | 900 | Min typing duration (ms) |
| `typingMax` | 4000 | 5000 | Max typing duration (ms) |
| `cooldownMin` | 1500 | 2500 | Min cooldown after send (ms) |
| `cooldownMax` | 4500 | 6500 | Max cooldown after send (ms) |
| `errorThreshold` | 5 | 3 | Errors before pause |
| `pauseMs` | 600000 | 1800000 | Pause duration (ms) |
| `backoffBase` | 3000 | 5000 | Base reconnect delay (ms) |
| `backoffMax` | 60000 | 120000 | Cap reconnect delay (ms) |
| `errorWindowMs` | 3600000 | 1800000 | Error expiry window (ms) |
| `disconnectThreshold` | 3 | 2 | Disconnects before pause |
| `sleepEnabled` | false | false | Jam tidur opt-in |
| `sleepStart` | 22 | 22 | Jam mulai tidur |
| `sleepEnd` | 6 | 6 | Jam selesai tidur |

### Human Send

Kirim dengan typing simulation + cooldown natural:

```javascript
const profile = getProfile('ori')

await humanSend(sock, jid, { text: 'Halo!' }, {}, profile)
// Urutan: composing → sleep (berdasarkan panjang teks) → sendMessage → cooldown → paused
```

### Health Monitor

Track error/disconnect dan pause otomatis kalau threshold tercapai:

```javascript
const health = new HealthMonitor(profile)

// Record saat error
sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
  if (connection === 'close') {
    health.recordDisconnect()
    const code = lastDisconnect?.error?.output?.statusCode
    if (code) health.recordError(code)
  }
})

// Cek pause
if (health.isPaused()) {
  console.log('Bot di-pause, tunggu...')
  return
}

// Trigger pause (kalau error cukup)
if (health.maybePause()) {
  console.log('Pause triggered')
}

// Backoff untuk reconnect delay
const delay = health.nextBackoff()  // 3s → 6s → 12s → ... capped
setTimeout(start, delay)
```

### Health Persistence

State bisa di-export/import biar nggak reset saat restart:

```javascript
// Save sebelum shutdown
const state = health.exportState()
fs.writeFileSync('health-state.json', JSON.stringify(state))

// Restore saat start
const saved = JSON.parse(fs.readFileSync('health-state.json'))
health.importState(saved)
```

### Rate Limiter

Sliding-window rate cap:

```javascript
const limiter = RateLimiter.fromProfile(profile)
// atau manual: new RateLimiter(10, 60_000) → 10 per 60 detik

await limiter.take()  // Tunggu kalau kuota habis
await sock.sendMessage(jid, { text: 'Hello' })
```

### Send Window (Jam Tidur)

Opt-in — bot nggak kirim di rentang jam tertentu:

```javascript
const profile = getProfile('ori', {
  sleepEnabled: true,
  sleepStart: 22,  // 22:00
  sleepEnd: 6,     // 06:00 besoknya
})

// Cek manual
const check = checkSendWindow(profile)
if (!check.allowed) {
  console.log(`Sleep window aktif, tunggu ${check.waitMs / 60000} menit`)
}

// Atau tunggu otomatis
await waitForSendWindow(profile)  // Return saat di luar jam tidur
```

### Health Stats

```javascript
const stats = health.getStats()
console.log({
  totalErrors: stats.totalErrors,
  totalDisconnects: stats.totalDisconnects,
  totalPauses: stats.totalPauses,
  uptimeMs: stats.uptimeMs,
})
```

### Full Example

```javascript
const {
  makeWASocket,
  useMultiFileAuthState,
  getProfile,
  HealthMonitor,
  RateLimiter,
  humanSend,
  checkSendWindow,
  waitForSendWindow,
} = require('@vanzzz/furina-baileys')

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')
  const sock = makeWASocket({ auth: state })
  sock.ev.on('creds.update', saveCreds)

  const profile = getProfile('ori')
  const health = new HealthMonitor(profile)
  const limiter = RateLimiter.fromProfile(profile)

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      health.recordDisconnect()
      const code = lastDisconnect?.error?.output?.statusCode
      if (code) health.recordError(code)
    }
    if (connection === 'open') {
      health.resetBackoff()
    }
  })

  async function sendSafe(jid, content) {
    if (health.isPaused()) throw new Error('Bot paused')
    if (!checkSendWindow(profile).allowed) {
      await waitForSendWindow(profile)
    }
    await limiter.take()
    return humanSend(sock, jid, content, {}, profile)
  }

  await sendSafe(jid, { text: 'Halo!' })
}

start()
```

---

## Navigasi dokumentasi

- [Getting Started](getting-started.md) — Koneksi dasar, pairing, dan quick start.
- [Stability Layer](stability.md) — Pemantau koneksi, backoff eksponensial, dan stealth mode.
- [Broadcast CRM](broadcast-crm.md) — Broadcast personal, grup, dan kanal dengan segmentasi dan anti-ban.
- [Message Detection](message-detection.md) — Mengenali 97 tipe pesan WhatsApp.
- **Anti-BAN Protection** — _halaman ini_
- [Furina Resolver](resolver.md) — Mapping LID ↔ PN dua arah, query USync, dan util link wa.me.
- [Message Builder](message-builder.md) — Button interaktif, carousel, MessageBuilder, dan button tracker.
- [API Reference](api-reference.md) — Daftar API publik yang tersedia.
- [Troubleshooting](troubleshooting.md) — Masalah umum, reconnect, session, rate limit, delivery, quarantine.
- [Lisensi](license.md) — Detail lisensi Apache-2.0 dan kewajiban atribusi.
- [Credits](credits.md) — Kredit dan atribusi proyek.
