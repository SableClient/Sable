import type { MatrixClient } from '$types/matrix-sdk';
import { describe, expect, it, vi } from 'vitest';

import {
  extractCircumfixProxyTagsFromKey,
  parsePerMessageProfileProxyAssociation,
  migratePmpProxyAssociation,
  type PerMessageProfileProxyAssociationV2,
  type PerMessageProfileProxyAssociationV1,
  proxyNeedsMigration,
  createProxyKey,
  setCurrentlyUsedPerMessageProfileIdForAccount,
  setCurrentlyUsedPerMessageProfileIdForRoom,
} from './usePerMessageProfile';

describe('migratePerMessageProfileProxyAssociation', () => {
  it('turns a key into a prefix', () => {
    const key = 'j;text';
    const migrated = extractCircumfixProxyTagsFromKey(key);

    expect(migrated).toStrictEqual({ prefix: 'j;', suffix: undefined });
  });
  it('turns a key into a suffix', () => {
    const key = 'text-J';
    const migrated = extractCircumfixProxyTagsFromKey(key);

    expect(migrated).toStrictEqual({ prefix: undefined, suffix: '-J' });
  });
  it('turns a key into a circumfix', () => {
    const key = '[text]';
    const migrated = extractCircumfixProxyTagsFromKey(key);

    expect(migrated).toStrictEqual({ prefix: '[', suffix: ']' });
  });
  it('testing whitespace in proxy tags', () => {
    const key = 'J: text -J';
    const migrated = extractCircumfixProxyTagsFromKey(key);

    expect(migrated).toStrictEqual({ prefix: 'J: ', suffix: ' -J' });
  });
  it('atypical proxy tag format 1', () => {
    const key = '_text -j';
    const migrated = extractCircumfixProxyTagsFromKey(key);

    expect(migrated).toStrictEqual({ prefix: '_', suffix: ' -j' });
  });

  it('noop migration', () => {
    const v2: PerMessageProfileProxyAssociationV2 = {
      profileId: 'foo',
      prefix: '[',
      suffix: ']',
    };
    const migrated = migratePmpProxyAssociation('[text]', v2);

    expect(migrated).toStrictEqual(v2);
  });

  it('simple migration', () => {
    const v1: PerMessageProfileProxyAssociationV1 = {
      profileId: 'foo',
      regexString: 'bar',
    };
    const migrated = migratePmpProxyAssociation('[text]', v1);

    expect(migrated).toStrictEqual({
      profileId: 'foo',
      prefix: '[',
      suffix: ']',
    });
  });

  it('needsMigration positive test', () => {
    const v1: PerMessageProfileProxyAssociationV1 = {
      profileId: 'foo',
      regexString: 'bar',
    };
    const checked = proxyNeedsMigration(v1);

    expect(checked).toBe(true);
  });

  it('needsMigration negative test', () => {
    const v2: PerMessageProfileProxyAssociationV2 = {
      profileId: 'foo',
      prefix: '[',
      suffix: ']',
    };
    const checked = proxyNeedsMigration(v2);

    expect(checked).toBe(false);
  });

  it('create prefix proxy key', () => {
    const key = createProxyKey('j;', undefined);
    expect(key).toBe('j;text');
  });
  it('create suffix proxy key', () => {
    const key = createProxyKey(undefined, '-J');
    expect(key).toBe('text-J');
  });
  it('create circumfix proxy key', () => {
    const key = createProxyKey('[', ']');
    expect(key).toBe('[text]');
  });
  it('check proxy key does not do falsy stuff', () => {
    const key = createProxyKey('false', '0');
    expect(key).toBe('falsetext0');
  });
});

describe('parsePerMessageProfileProxyAssociation', () => {
  it('parses a regex string with flags (RegExp#toString form)', () => {
    const assoc = {
      profileId: 'p1',
      regexString: '/^\\[text\\] (.+)$/i',
      setAt: 123,
    };

    const parsed = parsePerMessageProfileProxyAssociation(assoc);
    expect(parsed.profileId).toBe('p1');
    expect(parsed.setAt).toBe(123);
    expect(parsed.regex.test('[text] Hello')).toBe(true);
    expect(parsed.regex.test('[TEXT] hello')).toBe(true); // i flag
  });

  it('parses a regex string without flags', () => {
    const assoc = {
      profileId: 'p1',
      regexString: '/^\\[(.+)\\]$/',
    };

    const parsed = parsePerMessageProfileProxyAssociation(assoc);
    expect(parsed.regex.test('[ok]')).toBe(true);
    expect(parsed.regex.test('[no] trailing')).toBe(false);
  });
});

describe('per-message profile persistence', () => {
  it('serializes room writes and reads the latest account data snapshot', async () => {
    const associations: Record<string, { profileId: string }> = {};
    const writes: unknown[] = [];
    let releaseFirstWrite!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });

    const mx = {
      getAccountData: vi.fn<() => { getContent: () => { associations: typeof associations } }>(
        () => ({ getContent: () => ({ associations }) })
      ),
      setAccountData: vi.fn<
        (_event: unknown, content: { associations: typeof associations }) => Promise<void>
      >(async (_event, content) => {
        writes.push(content);
        if (writes.length === 1) await firstWrite;
        Object.assign(associations, content.associations);
      }),
    } as unknown as MatrixClient;

    const first = setCurrentlyUsedPerMessageProfileIdForRoom(mx, '!room:example.org', 'first');
    const second = setCurrentlyUsedPerMessageProfileIdForRoom(mx, '!room:example.org', 'second');

    await vi.waitFor(() => expect(writes).toHaveLength(1));

    releaseFirstWrite();
    await Promise.all([first, second]);

    expect(writes).toHaveLength(2);
    expect((writes[1] as { associations: typeof associations }).associations).toEqual({
      '!room:example.org': { profileId: 'second' },
    });
  });

  it('continues queued account writes after a rejected write', async () => {
    const writes: string[] = [];
    const mx = {
      setAccountData: vi.fn<
        (_event: unknown, content: { association: { profileId: string } }) => Promise<void>
      >(async (_event, content) => {
        writes.push(content.association.profileId);
        if (writes.length === 1) throw new Error('write failed');
      }),
      deleteAccountData: vi.fn<(...args: unknown[]) => void>(),
    } as unknown as MatrixClient;

    const first = setCurrentlyUsedPerMessageProfileIdForAccount(mx, 'first');
    const second = setCurrentlyUsedPerMessageProfileIdForAccount(mx, 'second');

    await expect(first).rejects.toThrow('write failed');
    await expect(second).resolves.toBeUndefined();
    expect(writes).toEqual(['first', 'second']);
  });
});
