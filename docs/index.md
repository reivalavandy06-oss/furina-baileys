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
[Post-Remediation Audit — Fase 13.9](architecture/phase-13-9-post-remediation-audit.md) | Verifikasi ulang remediasi API/lifecycle, paket, dan baseline native backend |
[Native Backend Integration — Fase 13.10](architecture/phase-13-10-native-backend-integration.md) | Status driver/service native, lint cleanup, dan batas bukti integrasi |
[Node Compatibility Matrix — Fase 13.11](architecture/phase-13-11-node-compatibility-matrix.md) | Kompatibilitas Node 20/22/24/26 dan rekomendasi kebijakan dukungan |
[Auth Store Integration Readiness — Fase 13.12](architecture/phase-13-12-auth-store-integration-readiness.md) | SQLite native, suite MongoDB, CI service container, consumer Node 24/26, dan release gate |
[AuthStore Contract Remediation — Fase 13.13](architecture/phase-13-13-authstore-contract-remediation.md) | Audit dan perbaikan kontrak `remove()` pada SQLite, Redis, dan MongoDB |
[Native Backend Verification — Fase 13.14](architecture/phase-13-14-native-backend-verification.md) | Redis native, MongoDB blocked, NekoDB decision, CI validation, dan findings |
[Redis & Migration Remediation — Fase 13.15](architecture/phase-13-15-redis-migration-remediation.md) | Redis empty-operation fix, SCAN clear, SQLite-to-Redis migration reliability, dan regression gate |
[MongoDB & NekoDB Native Verification — Fase 13.16](architecture/phase-13-16-mongodb-nekodb-native-verification.md) | MongoDB blocked, NekoDB blocked, migration matrix, and native baseline |
[CI-Native Reliability Completion — Fase 13.17](architecture/phase-13-17-ci-native-reliability.md) | GitHub Actions-compatible CI, MongoDB/NekoDB blockers, migration matrix, reliability results, and release gate |
[Upgrade Notes](upgrade-notes.md) | Perubahan branch pengembangan: Node minimum, wrapper lifecycle, CAS SQLite, error storage, migrasi non-atomic, dan ownership |
[Test Integrasi Auth Store](testing/auth-store-integration.md) | Suite backend nyata (opt-in), isolasi namespace, dan status cakupan |
[Troubleshooting](troubleshooting.md) | Masalah umum dan solusinya |
[License](license.md) | Apache-2.0 dan kewajiban atribusi |
[Credits](credits.md) | Kredit proyek |

---

Kembali ke [README utama](../README.md).
