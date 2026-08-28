import { describe, expect, it, vi } from 'vitest';

import type { MatrixClient } from '$types/matrix-sdk';
import {
  MATRIX_UNSTABLE_COLORS,
  MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME,
  MATRIX_UNSTABLE_PROFILE_PKIT_IMPORT_PROPERTY_NAME,
} from '$unstable/prefixes';
import { ProfileCatalog } from './catalog';
import { importPluralkitMembers } from './pluralkit';

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

describe('PluralkitImport', () => {
  it('noop import', async () => {
    const { mx } = createMatrixClient(
      new Map([
        [
          MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME,
          {
            profiles: [],
          },
        ],
      ]),
      true
    );

    const catalog = new ProfileCatalog(mx);
    await expect(importPluralkitMembers(mx, catalog, [])).resolves.not.toThrow();
    await expect(catalog.list({ migrate: false })).resolves.toEqual([]);
  });

  it('basic import', async () => {
    const { mx } = createMatrixClient(
      new Map([
        [
          MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME,
          {
            profiles: [],
          },
        ],
      ]),
      true
    );

    const pkData = [
      {
        id: '0',
        name: 'foo',
        uuid: 'f00b4r',
        display_name: 'Foo Bar',
        proxy_tags: [
          {
            prefix: 'Foo:',
            suffix: null,
          },
        ],
      },
    ];

    const catalog = new ProfileCatalog(mx);
    await expect(importPluralkitMembers(mx, catalog, pkData)).resolves.not.toThrow();
    await expect(catalog.list({ migrate: false })).resolves.toEqual([
      {
        id: 'foo',
        displayname: 'Foo Bar',
        triggers: [
          {
            prefix: 'Foo:',
          },
        ],
        [MATRIX_UNSTABLE_PROFILE_PKIT_IMPORT_PROPERTY_NAME]: { id: '0', uuid: 'f00b4r' },
      },
    ]);
  });
  it('basic import w prev data', async () => {
    const { mx } = createMatrixClient(
      new Map([
        [
          MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME,
          {
            profiles: [{ id: 'valid', displayname: 'Valid', triggers: [] }],
          },
        ],
      ]),
      true
    );

    const pkData = [
      {
        id: '0',
        name: 'foo',
        uuid: 'f00b4r',
        display_name: 'Foo Bar',
        proxy_tags: [
          {
            prefix: 'Foo:',
            suffix: null,
          },
        ],
      },
    ];

    const catalog = new ProfileCatalog(mx);
    await expect(importPluralkitMembers(mx, catalog, pkData)).resolves.not.toThrow();
    await expect(catalog.list()).resolves.toEqual([
      { id: 'valid', displayname: 'Valid', triggers: [] },
      {
        id: 'foo',
        displayname: 'Foo Bar',
        triggers: [
          {
            prefix: 'Foo:',
          },
        ],
        [MATRIX_UNSTABLE_PROFILE_PKIT_IMPORT_PROPERTY_NAME]: { id: '0', uuid: 'f00b4r' },
      },
    ]);
  });

  it('basic update-kind import', async () => {
    const { mx } = createMatrixClient(
      new Map([
        [
          MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME,
          {
            profiles: [
              {
                id: 'foo',
                displayname: 'Foo Bar',
                triggers: [
                  {
                    prefix: 'Foo:',
                  },
                ],
                [MATRIX_UNSTABLE_COLORS]: {
                  on_dark: '#ffffff',
                  on_light: '#000000',
                },
                [MATRIX_UNSTABLE_PROFILE_PKIT_IMPORT_PROPERTY_NAME]: { id: '0', uuid: 'f00b4r' },
              },
            ],
          },
        ],
      ]),
      true
    );

    const pkData = [
      {
        id: '0',
        name: 'bar',
        uuid: 'f00b4r',
        display_name: 'Bar Bar',
        proxy_tags: [
          {
            prefix: 'Foo:',
            suffix: null,
          },
        ],
      },
    ];

    const catalog = new ProfileCatalog(mx);
    await expect(importPluralkitMembers(mx, catalog, pkData)).resolves.not.toThrow();
    await expect(catalog.list()).resolves.toEqual([
      {
        id: 'bar',
        displayname: 'Bar Bar',
        triggers: [
          {
            prefix: 'Foo:',
          },
        ],
        [MATRIX_UNSTABLE_COLORS]: {
          on_dark: '#ffffff',
          on_light: '#000000',
        },
        [MATRIX_UNSTABLE_PROFILE_PKIT_IMPORT_PROPERTY_NAME]: { id: '0', uuid: 'f00b4r' },
      },
    ]);
  });
});
