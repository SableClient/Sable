import { describe, expect, it, vi } from 'vitest';

import type { MatrixClient } from '$types/matrix-sdk';
import {
  MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME,
  MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME,
  MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME_V2,
} from '$unstable/prefixes';
import { ProfileCatalog } from './catalog';

function createMatrixClient(accountData: Map<string, unknown>, writable = false) {
  const setAccountData = vi.fn<(eventType: string, content: unknown) => Promise<void>>(
    async (eventType, content) => {
      if (!writable) throw new Error('offline');
      accountData.set(eventType, content);
    }
  );
  const deleteAccountData = vi.fn<(eventType: string) => Promise<void>>(async (eventType) => {
    if (!writable) throw new Error('offline');
    accountData.delete(eventType);
  });
  const mx = {
    getAccountData: vi.fn<(eventType: string) => { getContent: () => unknown } | undefined>(
      (eventType) => {
        const content = accountData.get(eventType);
        return content === undefined ? undefined : { getContent: () => content };
      }
    ),
    setAccountData,
    deleteAccountData,
  } as unknown as MatrixClient;
  return { mx, setAccountData, deleteAccountData };
}

describe('ProfileCatalog', () => {
  it('filters v2 personas with malformed optional trigger variants', async () => {
    const { mx } = createMatrixClient(
      new Map([
        [
          MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME_V2,
          {
            profiles: [
              { id: 'valid', displayname: 'Valid', trigger: { prefix: [] } },
              {
                id: 'suffix',
                displayname: 'Suffix',
                trigger: { prefix: [], 'net.f0rest.suffix': {} },
              },
              {
                id: 'circumfix',
                displayname: 'Circumfix',
                trigger: { prefix: [], 'net.f0rest.circumfix': [{ prefix: '[', suffix: 1 }] },
              },
            ],
          },
        ],
      ])
    );

    await expect(new ProfileCatalog(mx).list({ migrate: false })).resolves.toEqual([
      { id: 'valid', displayname: 'Valid', triggers: [] },
    ]);
  });

  it('reads legacy personas without migration writes when requested', async () => {
    const accountData = new Map<string, unknown>([
      [
        `${MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME}.index`,
        { profileIds: ['legacy'] },
      ],
      [
        `${MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME}.legacy`,
        { id: 'legacy', name: 'Legacy' },
      ],
    ]);
    const { mx } = createMatrixClient(accountData);

    await expect(new ProfileCatalog(mx).list({ migrate: false })).resolves.toMatchObject([
      { id: 'legacy', displayname: 'Legacy' },
    ]);
    expect(mx.setAccountData).not.toHaveBeenCalled();
    expect(mx.deleteAccountData).not.toHaveBeenCalled();
  });

  it('renames selected personas in room and account associations', async () => {
    const accountData = new Map<string, unknown>([
      [
        MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME,
        { profiles: [{ id: 'old', displayname: 'Old', triggers: [] }] },
      ],
      [
        `${MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME}.globalassociation`,
        { association: { profileId: 'old', validUntil: 10 } },
      ],
      [
        `${MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME}.roomassociation`,
        { associations: { '!room:example.org': { profileId: 'old', validUntil: 20 } } },
      ],
    ]);
    const { mx } = createMatrixClient(accountData, true);

    await new ProfileCatalog(mx).rename('old', 'new');

    await expect(new ProfileCatalog(mx).getSelection('account')).resolves.toMatchObject({
      persona: { id: 'new' },
      validUntil: 10,
    });
    await expect(
      new ProfileCatalog(mx).getSelection({ roomId: '!room:example.org' })
    ).resolves.toMatchObject({
      persona: { id: 'new' },
      validUntil: 20,
    });
  });

  it('removes room and account associations for a deleted persona', async () => {
    const accountData = new Map<string, unknown>([
      [
        MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME,
        {
          profiles: [
            { id: 'deleted', displayname: 'Deleted', triggers: [] },
            { id: 'kept', displayname: 'Kept', triggers: [] },
          ],
        },
      ],
      [
        `${MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME}.globalassociation`,
        { association: { profileId: 'deleted' } },
      ],
      [
        `${MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME}.roomassociation`,
        {
          associations: {
            '!deleted:example.org': { profileId: 'deleted' },
            '!kept:example.org': { profileId: 'kept' },
          },
        },
      ],
    ]);
    const { mx } = createMatrixClient(accountData, true);

    await new ProfileCatalog(mx).remove('deleted');

    await expect(new ProfileCatalog(mx).getSelection('account')).resolves.toBeUndefined();
    await expect(
      new ProfileCatalog(mx).getSelection({ roomId: '!deleted:example.org' })
    ).resolves.toBeUndefined();
    await expect(
      new ProfileCatalog(mx).getSelection({ roomId: '!kept:example.org' })
    ).resolves.toMatchObject({ persona: { id: 'kept' } });
    expect(
      accountData.has(
        `${MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME}.globalassociation`
      )
    ).toBe(false);
  });

  it('serializes concurrent catalog writes', async () => {
    const accountData = new Map<string, unknown>();
    const { mx } = createMatrixClient(accountData, true);
    const catalog = new ProfileCatalog(mx);

    await Promise.all([
      catalog.merge({ id: 'first', displayname: 'First', triggers: [] }),
      catalog.merge({ id: 'second', displayname: 'Second', triggers: [] }),
    ]);

    await expect(catalog.list()).resolves.toEqual([
      { id: 'first', displayname: 'First', triggers: [] },
      { id: 'second', displayname: 'Second', triggers: [] },
    ]);
  });

  it('migrates legacy records and cleans up their account data', async () => {
    const accountData = new Map<string, unknown>([
      [
        `${MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME}.index`,
        { profileIds: ['legacy'] },
      ],
      [
        `${MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME}.legacy`,
        { id: 'legacy', name: 'Legacy' },
      ],
    ]);
    const { mx } = createMatrixClient(accountData, true);

    await expect(new ProfileCatalog(mx).list()).resolves.toMatchObject([{ id: 'legacy' }]);
    expect(
      accountData.get(MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME)
    ).toMatchObject({ profiles: [{ id: 'legacy' }] });
    expect(
      accountData.has(`${MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME}.index`)
    ).toBe(false);
    expect(
      accountData.has(`${MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME}.legacy`)
    ).toBe(false);
  });
});
