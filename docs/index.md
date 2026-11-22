# Dokumentasi Furina-Baileys

Dokumentasi lengkap `@vanzzz/furina-baileys`. README di root repo berisi ringkasan dan quick start — untuk detail, masuk ke halaman di bawah.

## Mulai di sini

| Halaman | Isi |
|---|---|
[Getting Started](getting-started.md) | Koneksi dasar, pairing device, quick start |
[Anti-BAN Protection](antiban.md) | Timing manusia, rate limiter, health monitor |
[Stability Layer](stability.md) | Pemantau koneksi, backoff, stealth mode |
[Broadcast CRM](broadcast-crm.md) | Segmentasi customer, template, kanal newsletter |
[Message Builder](message-builder.md) | Button interaktif, carousel, MessageBuilder |
[AI Rich Message](ai-rich-message.md) | Teks kaya, code/tabel, embedded screens, album, tombol, DSL markdown |
[VoIP (Fondasi)](voip.md) | Deteksi panggilan masuk dan penolakan call (eksperimental) |
[Commerce](commerce.md) | Payment request, katalog produk, dan fetch catalog bisnis |
[Multi-Backend Auth Store](auth-stores.md) | File/SQLite/MongoDB/Redis/NekoDB lewat kontrak `AuthStore` |
[Utilities](utilities.md) | Username Manager, Search Index, Scheduler, Auto-Reply, Anti-Spam, HD Media |
[Event Invites](events.md) | Undangan acara (event) untuk chat/grup |
[Integrasi Trakteer](integrations/trakteer.md) | Listener WebSocket donasi Trakteer (opsional) |
[Integrasi Saweria](integrations/saweria.md) | Listener WebSocket donasi Saweria (opsional) |
[Furina Resolver](resolver.md) | Mapping LID ↔ PN, USync, link utils |

## Referensi

| Halaman | Isi |
|---|---|
[Message Detection](message-detection.md) | Mengenali 97 tipe pesan |
[API Reference](api-reference.md) | Daftar API publik |
[Architecture Audit](architecture-audit.md) | Fitur reliabilitas yang sudah ada, gap, risiko, dan roadmap per file |
[Storage Safety Audit — Fase 13.3](architecture/storage-safety-audit.md) | Audit identifier SQLite, konsistensi migrasi, disposal, isolasi harness, dan rencana Fase 13.4 |
[Lifecycle & Crash-Recovery Audit — Fase 13.5](lifecycle-crash-recovery-audit.md) | Crash/retry migrasi, concurrent writes, hanging cleanup, ownership DB, Socket/PreKey, dan rencana Fase 13.6 |
[Lifecycle & Persistence Remediation — Fase 13.6](lifecycle-persistence-remediation.md) | Missing vs read error, konflik rollback, ownership DB, disposal berlabel, timer PreKey, dan keputusan tanpa journal |
[API Compatibility Audit — Fase 13.7](architecture/api-compatibility-audit.md) | Baseline rilis, kompatibilitas Auth Store/custom adapter, CJS/ESM/types, error/lifecycle, package integrity, dan kesiapan rilis |
[Test Integrasi Auth Store](testing/auth-store-integration.md) | Suite backend nyata (opt-in), isolasi namespace, dan status cakupan |
[Troubleshooting](troubleshooting.md) | Masalah umum dan solusinya |
[License](license.md) | Apache-2.0 dan kewajiban atribusi |
[Credits](credits.md) | Kredit proyek |

---

Kembali ke [README utama](../README.md).
