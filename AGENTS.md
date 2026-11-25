TASK — MODERNIZE AGENTS.md FOR FURINA BAILEYS

Project: "@vanzzz/furina-baileys"

Task type: Repository instructions modernization.

Primary objective:
Create a new, accurate, maintainable "AGENTS.md" that reflects the project's current architecture, engineering standards, security rules, and development history.

This is a documentation and repository-guidance task only.

Do not modify production code.

---

1. PROJECT CONTEXT

Furina Baileys is a fork of Baileys published as:

"@vanzzz/furina-baileys"

It is a TypeScript WhatsApp Web protocol library, not the FURINA-CHAN bot application.

The project includes upstream Baileys functionality and additional systems such as:

- CRM and broadcast management.
- Connection stability management.
- Antiban utilities.
- Interactive messaging and button builders.
- LID and PN identity resolution.
- Auth Store adapters.
- Authentication backup and restore.
- Cross-backend migration.
- Storage recovery and consistency mechanisms.
- Signal PreKey lifecycle handling.

The library is dual CJS/ESM and is consumed by downstream WhatsApp bot developers.

The new instructions must reflect that this is a public library where backward compatibility, data integrity, and predictable behavior are critical.

Do not confuse this repository with "FURINA-CHAN" or another WhatsApp bot project.

2. FIRST: INSPECT THE CURRENT REPOSITORY

Before writing the new document, inspect:

- Existing "AGENTS.md".
- "CODE_OF_CONDUCT.md", especially its AI policy.
- "SECURITY.md".
- "package.json".
- ".yarnrc.yml".
- ".yarn/releases/".
- "tsconfig.json".
- Build configuration.
- "src/index.ts".
- "src/Types/".
- "src/Utils/auth-store.ts".
- "src/Utils/auth-utils.ts".
- "src/Utils/auth/".
- Signal and PreKey implementation.
- Socket lifecycle implementation.
- Existing test structure.
- "docs/index.md".
- Current architecture and reliability audit documents.
- Publishing workflows.

Verify recent Git history and the actual current branch and HEAD.

Inspect the latest Fase 13.7 audit result if available.

Do not assume that the previously reported API signatures remain unchanged without checking the source.

Do not invent files, exports, functions, or configuration options.

3. NEW AGENTS.md STRUCTURE

Write a comprehensive but maintainable document using the following sections.

A. Project Identity

Explain:

- What Furina Baileys is.
- What it extends from upstream.
- Its npm package name.
- Its dual CJS/ESM architecture.
- Its supported Node.js version.
- Its primary downstream developer use cases.

Explicitly distinguish this library from the FURINA-CHAN bot project.

B. Mandatory Agent Workflow

Every coding agent must:

1. Read "AGENTS.md".
2. Read applicable security and conduct policies.
3. Inspect relevant source code before changes.
4. Inspect corresponding tests.
5. Check current Git status.
6. Verify public API impact.
7. Prepare a minimal implementation plan for complex changes.
8. Implement only the requested scope.
9. Run appropriate validation.
10. Report actual results.

Never invent source behavior.

Never infer an API solely from its name.

When uncertain, inspect the actual implementation and tests.

C. Repository Architecture

Document the actual current repository layout.

Include:

- "src/Socket/"
- "src/Signal/"
- "src/WABinary/"
- "src/WAUSync/"
- "src/Types/"
- "src/Utils/"
- "src/__tests__/"
- "WAProto/"
- "docs/"
- "Example/"

Update this list based on the actual repository.

Do not preserve outdated paths or claim folders exist without checking.

Document which modules are protocol-sensitive, storage-sensitive, or public API-sensitive.

D. Setup and Package Manager

Verify and document:

- Minimum Node.js version.
- Actual committed Yarn release.
- Canonical installation command.
- TypeScript and lint commands.
- Test commands.
- Build commands.
- Package validation commands.

The repository uses Yarn as its canonical package manager.

Do not replace Yarn with npm installation instructions.

"npm pack --dry-run" is permitted for package validation.

Do not introduce a second lockfile.

Do not change the root "package.json" "type" field.

Verify the current Yarn version rather than copying an old version from this document.

E. Coding Standards

Preserve project conventions:

- Strict TypeScript.
- Tabs.
- Single quotes.
- No semicolons.
- No new "any" usage.
- Proper type-only imports.
- Named exports where appropriate.
- Minimal, focused changes.
- No mass formatting.
- Structured Pino-style logging.
- Existing Boom error conventions for protocol/HTTP-style errors.
- Plain Error for ordinary internal failures.
- Existing JID helper functions.
- Typed BinaryNode accessors.

Preserve existing conventions when modifying legacy modules.

Do not refactor unrelated code.

F. Public API and Compatibility Rules

This section is extremely important.

"src/Types/**", "src/index.ts", package exports, and generated declarations define the public surface.

Treat public API changes as compatibility-sensitive.

Before changing an API, inspect:

- Existing consumers.
- Runtime exports.
- TypeScript declarations.
- CJS output.
- ESM output.
- Existing documentation.
- Custom adapter implementations.

Do not break existing consumers merely to simplify internal code.

Prefer additive changes.

Optional capabilities must remain optional when backward compatibility requires it.

Do not force existing custom implementations to add methods that were not previously required.

Any unavoidable breaking change must be documented and explicitly identified.

G. Auth Store Architecture

Document the actual current Auth Store architecture.

Verify these APIs against source:

- "useSQLiteAuthState()"
- "useRedisAuthState()"
- "useMongoDBAuthState()"
- "useNekoDBAuth()"
- "makeAuthStateFromStore()"
- "createSQLiteAuthStore()"
- "createRedisAuthStore()"
- "createMongoAuthStore()"
- "createNekoDBAuthStore()"
- "migrateAuthState()"
- Backup and Restore APIs.

Explain the distinction between:

1. Auth-state convenience wrappers.
2. Raw Auth Store factories.
3. Library-owned connections.
4. Borrowed user-owned connections.

Document the actual "close()" behavior and connection ownership rules.

Do not claim that every wrapper owns its connection.

Storage reliability invariants

Include the following principles, verifying them against current source:

- Missing data must remain distinguishable from storage read failures.
- Corrupted credentials must never silently initialize a replacement session.
- BufferJSON serialization must remain compatible.
- Signal keys and credentials must remain associated with the correct session.
- Failed writes must not leave unpersisted values presented as confirmed cache state.
- Migration failures must never be reported as success.
- Destination partial state must be reported honestly.
- Source authentication state must not be destructively modified by failed migration.
- Rollback must not blindly overwrite legitimate concurrent updates.
- Optional compare-and-set capabilities must not become mandatory without an approved API change.
- Backend-specific guarantees must be clearly distinguished.

IMPORTANT:

Migration rollback is best-effort recovery unless the actual backend implementation guarantees stronger semantics.

Do not describe generic cross-backend migration as atomic.

Crash recovery is not automatic merely because in-memory rollback exists.

Do not claim durable resume or journal-based recovery unless it has actually been implemented and tested.

H. Socket and Signal Lifecycle

Document the important invariants around:

- "creds.update".
- "saveCreds()".
- Signal Key Store writes.
- PreKey upload.
- Pending operations.
- Reconnection.
- Socket disposal.
- Resource cleanup.

Do not assume:

- "sock.end()" waits for application-owned persistence.
- A timeout cancels the underlying asynchronous operation.
- A process-local mutex protects multiple processes.
- A pending PreKey operation is complete merely because its caller timed out.

Do not change Signal cryptographic algorithms, session formats, or WhatsApp protocol behavior without specific evidence and explicit scope.

I. Database and Resource Lifecycle

Document:

- Resource ownership.
- Borrowed versus owned clients.
- Idempotent cleanup.
- Error propagation.
- Disposal ordering.
- Pending asynchronous operations.
- Timeout limitations.

Never close a user-owned shared connection unexpectedly.

Never claim a resource is closed while its underlying disposal Promise is still pending.

Keep cleanup behavior observable and preserve original error causes.

J. Testing Standards

Document all test categories:

1. Unit tests.
2. Deterministic fault-injection tests.
3. Subprocess crash-recovery tests.
4. Optional real-backend integration tests.
5. Protocol regression tests.
6. CJS/ESM smoke tests.
7. TypeScript declaration tests.
8. Packaging tests.

Use the actual current Jest configuration.

"*.integration.ts" must remain excluded from normal unit tests if that is still the repository's intended configuration.

Real integration tests must require explicitly isolated backend infrastructure.

Unavailable backends must be reported as NOT RUN, never PASS.

Never automatically install Redis, SQLite drivers, NekoDB, or other services without authorization.

Document the low-RAM serial test command accurately.

Lint warnings from the existing baseline are not automatically new errors.

K. Security Rules

Maintain and strengthen existing rules.

Never:

- Read or print ".env".
- Expose credentials.
- Expose Signal keys.
- Commit authentication sessions.
- Log private message content unnecessarily.
- Access production databases during testing.
- Run destructive database cleanup against user resources.
- Disable TLS or authentication to make tests easier.
- Modify generated protobuf files manually.

Protect:

- "auth_info/".
- Session files.
- Database files.
- SQLite WAL and SHM files.
- User backups.
- Temporary authentication data.

Preserve the dual-use restrictions already documented in the old AGENTS.md.

Do not contribute features whose primary purpose is spam, scraping, stalking, or evading WhatsApp anti-abuse systems.

L. Protocol and Generated Code

Preserve existing rules:

- Read real source and test fixtures before changing protocol behavior.
- Do not invent WhatsApp binary-node structures.
- Use typed accessors.
- Do not hand-edit generated "WAProto" files.
- Regenerate protobufs using the repository's official generator.
- Document relevant protocol triggers and compatibility risks.

M. Publishing and Release Safety

Preserve critical existing publishing restrictions:

- GitHub Actions + npm Trusted Publishing is the intended publishing path.
- Version, README, and CHANGELOG must remain synchronized.
- Use a fresh-install smoke test for CJS and ESM.
- "npm publish" runs build lifecycle scripts.
- Never push "v*" tags while the hazardous upstream "publish-release.yml" workflow remains active.
- Never publish or release without explicit user authorization.
- Do not change package exports or module layout casually.
- Do not modify dependency resolutions without security and compatibility review.

Verify the actual workflow files and current publishing setup.

Do not blindly assume old workflow descriptions are still accurate.

N. Git and Commit Rules

Use Conventional Commits.

Never:

- Change Git identity.
- Add automated Co-Authored-By trailers.
- Push without authorization.
- Publish without authorization.
- Create release tags without authorization.
- Include session files, ".env", or database data.

Preserve unrelated user changes.

Never reset, stash, rebase, or force-push unless explicitly authorized.

The existing AI disclosure policy in "CODE_OF_CONDUCT.md" still applies to PR descriptions where relevant.

O. Documentation Policy

For user-facing changes, update:

- README short documentation.
- The relevant long-form "docs/*.md".
- "docs/index.md" where appropriate.
- CHANGELOG when required by release policy.

Do not leave outdated API examples.

Do not claim crash safety, atomicity, or backend verification without evidence.

Avoid duplicating the full historical phase reports inside "AGENTS.md".

Instead, link to the relevant architecture and reliability audit documents.

P. Historical Engineering Milestones

Add a concise historical context section based on verified Git history.

Include the major milestones from:

- Auth Store enhancement.
- NekoDB integration.
- Fase 12 architecture audit.
- Fase 13 fault injection.
- Fase 13.1 production fixes.
- Fase 13.2 integration harness.
- Fase 13.3 storage safety audit.
- Fase 13.4 storage reliability remediation.
- Fase 13.5 lifecycle audit.
- Fase 13.6 lifecycle and persistence fixes.
- Fase 13.7 API compatibility audit, if completed and verified.

For each milestone:

- Verify commit existence.
- Verify affected documentation.
- Briefly describe what was delivered.
- Distinguish implemented functionality from outstanding limitations.

Do not invent commit hashes.

Do not assume that a phase is complete merely because a prior chat mentioned it.

Historical details should remain concise.

4. CURRENT STATUS MUST NOT BECOME STALE

Do not hardcode a permanent current HEAD, branch, test count, or active phase into AGENTS.md.

Instead, instruct future agents to inspect:

- "git status".
- "git log".
- Actual test results.
- Latest audit documents.
- Actual backend availability.

If a historical test baseline is included, label it as historical, not as the guaranteed current count.

The previous reported Fase 13.6 result was:

- 78 suites.
- 1,365 tests.
- 0 failed.
- 0 skipped.

Verify whether a newer result exists before including this information.

5. DOCUMENTATION REFERENCES

Discover the actual current documents and link relevant material:

- Architecture audit.
- Storage safety audit.
- Lifecycle crash-recovery audit.
- Lifecycle persistence remediation.
- Integration test documentation.
- API compatibility audit, if present.

Do not invent document paths.

If documents do not exist, omit their links and report the missing references.

6. QUALITY REQUIREMENTS FOR NEW AGENTS.md

The new file must be:

- Clear.
- Technically accurate.
- Easy for coding agents to follow.
- Written in understandable English, consistent with the existing document.
- Organized into practical sections.
- Free from contradictory instructions.
- Not excessively repetitive.
- Focused on stable engineering rules.

Prefer explicit instructions over vague statements.

For critical constraints, explain why they matter.

Do not turn every historical bug fix into a permanent implementation rule unless it protects a general invariant.

Keep the document reasonably maintainable.

Avoid copying entire audit reports into AGENTS.md.

7. VALIDATION

After writing the new file:

1. Review the complete AGENTS.md.
2. Check every file path mentioned.
3. Check every command against actual package scripts.
4. Check every exported API name against source.
5. Check Node and Yarn requirements against repository configuration.
6. Check links to documentation.
7. Check for conflicting rules.
8. Run "git diff --check".
9. Verify only "AGENTS.md" changed.

Do not change production code, tests, package.json, yarn.lock, workflows, or any other documentation in this task.

If another file requires modification, report it separately instead of changing it.

Do not create a commit.

Do not push or publish.

8. FINAL REPORT

Report:

- What changed from the old AGENTS.md.
- Stale instructions removed or corrected.
- New Auth Store rules.
- New lifecycle and persistence rules.
- New API compatibility rules.
- Security improvements.
- Verified historical milestones.
- References to current documentation.
- Any uncertain facts.
- Validation results.
- Complete Git diff summary.

Explicitly confirm:

- No production source changed.
- No tests changed.
- No dependency changed.
- No package configuration changed.
- No secrets accessed.
- No commit, push, merge, or release performed.

FINAL DIRECTIVE:

AGENTS.md must become the reliable starting point for future AI coding agents working on Furina Baileys.

It must reflect the actual repository, protect existing consumers, preserve protocol and authentication invariants, and prevent agents from repeating previously discovered mistakes.

Accuracy is more important than document length.
