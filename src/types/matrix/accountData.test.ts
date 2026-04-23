import { describe, expect, it } from 'vitest';
import { EventType, type AccountDataEvents } from '$types/matrix-sdk';

const LEGACY_STANDARD_ACCOUNT_DATA_EVENT_KEYS = {
  PushRules: EventType.PushRules,
  Direct: EventType.Direct,
  IgnoredUserList: EventType.IgnoredUserList,
  SecretStorageDefaultKey: 'm.secret_storage.default_key',
  CrossSigningMaster: 'm.cross_signing.master',
  CrossSigningSelf: 'm.cross_signing.self_signing',
  CrossSigningUser: 'm.cross_signing.user_signing',
  MegolmBackupV1: 'm.megolm_backup.v1',
} as const satisfies Record<string, keyof AccountDataEvents>;

describe('Matrix SDK account data keys', () => {
  it('keeps the old standard account-data keys available from the SDK', () => {
    expect(LEGACY_STANDARD_ACCOUNT_DATA_EVENT_KEYS).toStrictEqual({
      PushRules: 'm.push_rules',
      Direct: 'm.direct',
      IgnoredUserList: 'm.ignored_user_list',
      SecretStorageDefaultKey: 'm.secret_storage.default_key',
      CrossSigningMaster: 'm.cross_signing.master',
      CrossSigningSelf: 'm.cross_signing.self_signing',
      CrossSigningUser: 'm.cross_signing.user_signing',
      MegolmBackupV1: 'm.megolm_backup.v1',
    });
  });
});
