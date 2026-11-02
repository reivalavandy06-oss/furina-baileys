AI Rich Message

Pesan AI kaya format: teks, code, tabel, embedded screens (A2UI), album, tombol native, dan DSL markdown.

[Dokumentasi utama](../README.md) · **Navigasi docs:** [beranda](index.md)

---

## ✨ AI Rich Message

AI Rich Message memakai proto `richResponseMessage` (dibungkus `botForwardedMessage`) untuk
mengirim konten terstruktur: teks kaya, code, tabel, gambar, LaTeX, peta, reels, grid image,
embedded screens, dan tombol native.

```javascript
const {
  RichMessageBuilder,
  sendRichMessage,
  readRichMessage,
} = require('@vanzzz/furina-baileys')
```

### RichMessageBuilder

Builder fluent untuk menyusun `richResponseMessage`. Semua method mengembalikan `this`.

```javascript
const builder = new RichMessageBuilder()
  .addText('Ringkasan hasil')
  .addCodeBlock('const a = 1', 'javascript')
  .addTable(['Nama', 'Nilai'], [['A', '1'], ['B', '2']])
  .addList(['Poin satu', 'Poin dua'])
  .addLatex('E = mc^2')
  .addImage('https://cdn.example/img.png', 'caption')
  .addMap(-6.2, 106.8, 10)
  .addLink('https://example.com', 'Contoh')
  .addSuggestions(['Jelaskan lebih lanjut'])

await sendRichMessage(sock, '6281234567890@s.whatsapp.net', builder)
```

Method penting:

| Method | Keterangan |
|---|---|
| `addText(text)` / `addList(items)` | Teks / daftar berbutir |
| `addCodeBlock(code, lang)` | Code block dengan syntax highlight |
| `addTable(headers, rows)` | Tabel |
| `addLatex(formula)` / `addLatexInlineImage(formula)` | LaTeX (+ gambar render CodeCogs) |
| `addImage(url, caption)` / `addInlineImage(url, caption?)` | Gambar inline |
| `addGridImage(urls)` | Grid gambar |
| `addReels(items)` / `addVideo(url, caption?)` | Reels / video |
| `addMap(lat, lng, zoom)` | Peta |
| `addLink(url, title)` | Link |
| `addSuggestions(items)` | Suggested prompts (`botMetadata`) |
| `addImagine(prompt)` | `GenAIImaginePrimitive` |
| `addProductItem({ title, price, imageUrl, url })` | Kartu produk |
| `addDivider()` / `addSpacer(h)` / `addMetadataText(t)` | UX primitives |
| `addSection(section)` / `addViewModel(vm)` | Escape hatch V2 |
| `setUnifiedResponse(payload)` / `setAiIcon(url?)` | Payload V2 / ikon AI |
| `addMarkdown(md)` | Parser markdown bawaan |
| `build()` | Hasilkan `proto.IMessage` |

> [!NOTE]
> Semua field URL (`addImage`, `addReels`, `addLink`, `addVideo`, `addCitation`, …) divalidasi
> lewat `assertSafeUrl` — hanya `http:`/`https:` yang diizinkan (mitigasi CVE-2026-23866).

### ORich (rich + sources / widgets / buttons / screens)

`ORich` memperluas `RichMessageBuilder` dengan sumber sitasi, produk, post, widget 3P,
footer action, embedded screens (A2UI), dan tombol native.

```javascript
const { ORich, sendORichMessage } = require('@vanzzz/furina-baileys')

const rich = new ORich()
  .addText('Jawaban')
  .addSource({ title: 'Wikipedia', url: 'https://id.wikipedia.org', citationNumber: 1 })
  .addProduct({ title: 'Kopi', price: 25000, currency: 'IDR', url: 'https://shop/1' })
  .addWidget({ title: 'Cuaca', url: 'https://w/x', kind: 'toast' })
  .addButton({ type: 'url', id: 'open', text: 'Buka', url: 'https://example.com' })
  .addButton({ type: 'reply', id: 'yes', text: 'Ya' })

// Tombol dikirim sebagai pesan native-flow terpisah (quoted ke rich message).
await sendORichMessage(sock, jid, rich)
```

Embedded screens (A2UI):

```javascript
const screen = new ORich().embeddedScreen({
  title: 'Pesanan',
  tabs: [
    { id: 't1', tabHeader: 'Detail', sections: [{ type: 'GenAIMarkdownTextUXPrimitive', text: 'Isi tab' }] },
    { id: 't2', tabHeader: 'Status', sections: [{ type: 'GenAITaskPrimitive', taskId: 'x', title: 'Dikirim' }] },
  ],
})
```

### DSL Markdown (`parseRichMarkdown`)

Parser mengubah markdown + direktif `:::` menjadi `ORich` siap kirim.

```javascript
const { parseRichMarkdown, sendRichMessage } = require('@vanzzz/furina-baileys')

const markdown = `
# Judul

Paragraf dengan **bold**, *italic*, dan \`inline code\`.

\`\`\`js
const a = 1
\`\`\`

| A | B |
| --- | --- |
| 1 | 2 |

- satu
- dua

:::suggest
- Jelaskan lagi
- Contoh lain
:::

:::product title="Kopi" price="25000" url="https://shop/1"
:::
`

await sendRichMessage(sock, jid, parseRichMarkdown(markdown))
```

Direktif yang didukung: `suggest`, `product`, `reels`, `post`, `tip`, `widget`, `footerAction`.

### Helper siap pakai

| Helper | Keterangan |
|---|---|
| `sendTable(sock, jid, title, headers, rows, quoted?, opts?)` | Tabel |
| `sendRichList(sock, jid, title, items, quoted?, opts?)` | Daftar (nama rich; `sendList` = list interaktif lama) |
| `sendCodeBlock(sock, jid, code, language, quoted?, opts?)` | Code block |
| `sendLatex(sock, jid, formula, …)` / `sendLatexInlineImage(…)` | LaTeX |
| `sendMarkdown(sock, jid, md, …)` | Markdown |
| `sendUnifiedResponse(sock, jid, payload, …)` | Payload V2 |
| `sendTableV2` / `sendCodeBlockV2` / `sendLinkV2` | V2 + typed primitives |
| `sendRichHtml(sock, jid, html, …)` | Mini-app HTML |
| `sendAlbum(sock, jid, medias, caption?, opts?)` | Album (gambar/video) |
| `sendStatusMentions(sock, content, jids, opts?)` | Status + mention (dukungan media) |
| `sendAIRichMessage(sock, jid, { sections, text, nativeFlow, submessages }, opts?)` | Envelope `botForwardedMessage` |

### Album Messages

```javascript
const { sendAlbum } = require('@vanzzz/furina-baileys')

// Semua media memakai albumMediaGroupId yang sama agar digabung jadi satu album.
await sendAlbum(sock, jid, ['https://cdn/1.jpg', 'https://cdn/2.jpg'], 'Caption album')
```

`buildAlbumMessage(medias, caption?, groupMessageId?)` tersedia untuk membangun envelope secara manual.

### Membaca pesan masuk

```javascript
const { readRichMessage, decodeAIRich, getPlainTextFromUnifiedResponse } = require('@vanzzz/furina-baileys')

const parsed = readRichMessage(message)
// { blocks, text, suggestions, aiIcon, album, buttons, citations, inlineLinks, unified, … }

const unified = decodeAIRich(message)          // objek JSON dari unifiedResponse (atau null)
const plain = getPlainTextFromUnifiedResponse(unified) // teks polos
```

### Keamanan URL

`assertSafeUrl(url)` (dan `isSafeUrl`) menolak `javascript:`, `data:`, `file:`, URL tanpa protokol,
serta karakter kontrol/whitespace. Gunakan ini juga untuk URL kustom sebelum menyusun rich message.

---

## Navigasi dokumentasi

- [Getting Started](getting-started.md) — Koneksi dasar, pairing, dan quick start.
- [Stability Layer](stability.md) — Pemantau koneksi, backoff eksponensial, dan stealth mode.
- [Broadcast CRM](broadcast-crm.md) — Broadcast personal, grup, dan kanal dengan segmentasi dan anti-ban.
- [Message Detection](message-detection.md) — Mengenali 97 tipe pesan WhatsApp.
- [Anti-BAN Protection](antiban.md) — Perlindungan anti-ban: timing manusia, rate limiter, dan health monitor.
- [Furina Resolver](resolver.md) — Mapping LID ↔ PN dua arah, query USync, dan util link wa.me.
- [Message Builder](message-builder.md) — Button interaktif, carousel, MessageBuilder, dan button tracker.
- **AI Rich Message** — _halaman ini_
- [API Reference](api-reference.md) — Daftar API publik yang tersedia.
- [Troubleshooting](troubleshooting.md) — Masalah umum, reconnect, session, rate limit, delivery, quarantine.
- [Lisensi](license.md) — Detail lisensi Apache-2.0 dan kewajiban atribusi.
- [Credits](credits.md) — Kredit dan atribusi proyek.
