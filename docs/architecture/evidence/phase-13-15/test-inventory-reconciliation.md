# Test Inventory Reconciliation — Pre-13.16 Gate

Read-only audit. No production source, Jest configuration, test assertion, or other file was changed.

## 1. AuthStore Conformance Availability

- File exists: `src/__tests__/Utils/auth/auth-store-conformance.test.ts`
- Default Jest discovery includes it: yes.
- Test count in that file: 47.
- Composition: 5 adapters × 9 conformance cases = 45, plus `isolates two stores from two different folders` and `reports a distinct backend name per adapter` = 47.
- Backends covered: file, SQLite mock, Redis mock, MongoDB mock, NekoDB mock.

## 2. Default Runner Configuration

- `jest.config.ts`: roots `<rootDir>/src` and `<rootDir>/WAProto`; `testMatch` is `<rootDir>/src/**/*.test.ts`.
- `npm test`: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testMatch '**/*.test.ts'`.
- `npm run test:integration`: `node --import tsx scripts/check-integration-env.ts --run`, which uses `--testMatch '**/*.integration.ts'`.
- Default discovered files: 79.
- Integration files: 5 (`*.integration.ts`), excluded from the default runner by extension.

## 3. Reconciliation

- The 47 AuthStore conformance tests are part of the default Jest suite.
- They are included in the 79 default suites / 1393 default tests.
- They are not counted again in the native integration category.
- Native/conformance integration results are separate runner executions:
  - SQLite native: 14 tests.
  - SQLite CAS: 7 tests.
  - Redis native: 7 tests.
  - AuthStore conformance: 47 tests.
  - Migration integration: 16 passed, 20 skipped.
- Therefore there is no double-counting: default Jest unit/mock tests and native integration tests are disjoint by file extension and runner command.

## 4. Exact Default-Discovered Test Files

- `/root/furina-baileys/src/__tests__/Utils/fase-9.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth/crash-recovery.test.ts`
- `/root/furina-baileys/src/__tests__/proto-tojson-long.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth/auth-store-conformance.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth/nekodb-auth.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/history.test.ts`
- `/root/furina-baileys/src/__tests__/binary/connection-deadlock.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth/managed-auth.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth-utils.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/noise-handler.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth/backup-manager.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth/migration-manager.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/messaging/button-tracker.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/event-buffer.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/crm/broadcast/hourly-rate-limit.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/messaging/fase-10.test.ts`
- `/root/furina-baileys/src/__tests__/binary/reconnection-sync-skip.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/tc-token.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth/sqlite-cas.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/signal.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth/adapter-faults.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth/sqlite-identifiers.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth/compensating-recovery.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/reporting-utils.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/decode-wa-message.test.ts`
- `/root/furina-baileys/src/__tests__/Socket/communities.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/process-message.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth/migration-faults.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth/read-errors.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth/recovery-conflicts.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/messages-media.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/app-state-sync-resilience.test.ts`
- `/root/furina-baileys/src/__tests__/Socket/messages-recv.test.ts`
- `/root/furina-baileys/src/__tests__/Socket/groups.test.ts`
- `/root/furina-baileys/src/__tests__/Socket/identity-change-handling.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth/recovery-regressions.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth/backup-faults.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/messaging/rich-message.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth/owned-resource.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/chat-utils-resilience.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth-integration/disposal-safety.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/generics.test.ts`
- `/root/furina-baileys/src/__tests__/binary/persistence-lifecycle.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/crm/broadcast/lifecycle.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth-integration/stores.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/furina-resolver.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/process-sync-action.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/app-state-version.test.ts`
- `/root/furina-baileys/src/__tests__/Socket/chats.test.ts`
- `/root/furina-baileys/src/__tests__/Socket/messages-send.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/crm/broadcast/channel-guard.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/lt-hash-generator.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/messaging/rich-message-media.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/crm/broadcast/quarantine.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/crm/broadcast/per-minute-quota.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/messaging/fase-8.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/usync-resolver.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/sync-action-utils.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/crm/broadcast/dry-run-health-guard.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/crm/broadcast/channel-normalization.test.ts`
- `/root/furina-baileys/src/__tests__/WAUSync/USyncBusinessProtocol.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/crm/conversation-memory.test.ts`
- `/root/furina-baileys/src/__tests__/Signal/lid-mapping.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/crm/listener-lifecycle.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/crm/broadcast/jids.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/member-labels.test.ts`
- `/root/furina-baileys/src/__tests__/WAUSync/USyncQuery.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/crm/jid-identity.test.ts`
- `/root/furina-baileys/src/__tests__/bigint-validation.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/integrations.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth-integration/readiness.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/offline-node-processor.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/crm/broadcast/delivery-tracker-pending.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/stanza-ack.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/crm/broadcast/health-guard.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/crm/broadcast/delivery-tracker-retrack.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth/storage-faults.test.ts`
- `/root/furina-baileys/src/__tests__/Signal/Group/sender-key-state-regression.test.ts`
- `/root/furina-baileys/src/__tests__/Utils/auth-integration/lifecycle.test.ts`
