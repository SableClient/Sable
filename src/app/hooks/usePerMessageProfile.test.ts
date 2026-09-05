import { describe, expect, it, vi } from 'vitest';

import type { MatrixClient } from '$types/matrix-sdk';
import {
  MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME,
  MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME,
  MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME_V2,
} from '$unstable/prefixes';
import {
  addOrUpdatePerMessageProfile,
  deletePerMessageProfile,
  getAllPerMessageProfiles,
  renamePerMessageProfile,
  type PerMessageProfileMsc4461,
} from './usePerMessageProfile';
import type { PersonaCatalogContent, PersonaV2 } from '$app/persona/catalog';
import { projectPersona } from '$app/persona/projection';
import { resolvePersonaProxy } from '$app/persona/proxy';
import { resolvePersona } from '$app/persona/selection';

function createMatrixClient(profiles: PerMessageProfileMsc4461[] = []) {
  const accountData = new Map<string, unknown>();
  accountData.set(MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME, {
    profiles,
  } satisfies PersonaCatalogContent);

  const setAccountData = vi.fn<(eventType: string, content: unknown) => Promise<void>>(
    async (eventType, content) => {
      accountData.set(eventType, content);
    }
  );
  const mx = {
    getAccountData: vi.fn<(eventType: string) => { getContent: () => unknown } | undefined>(
      (eventType) => {
        const content = accountData.get(eventType);
        return content === undefined ? undefined : { getContent: () => content };
      }
    ),
    setAccountData,
    deleteAccountData: vi.fn<(eventType: string) => Promise<void>>(async (eventType) => {
      accountData.delete(eventType);
    }),
  } as unknown as MatrixClient;

  return { accountData, mx, setAccountData };
}

const profile = (id: string): PerMessageProfileMsc4461 => ({
  id,
  displayname: `Profile ${id}`,
  triggers: [],
});

const profileV2 = (id: string): PersonaV2 => ({
  id,
  displayname: `Profile ${id}`,
  trigger: {
    prefix: [],
  },
});

describe('profile persistence', () => {
  it('normalizes the previously nested MSC4461 account-data payload', async () => {
    const { accountData, mx } = createMatrixClient();
    accountData.delete(MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME);
    accountData.set(MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME_V2, {
      type: 'm.per_message_profiles',
      content: { profiles: [profileV2('first')] },
    });

    await expect(getAllPerMessageProfiles(mx)).resolves.toEqual([profile('first')]);
    expect(
      accountData.get(MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME)
    ).toEqual({
      profiles: [profile('first')],
    });
  });

  it('migrates legacy profile records into the MSC4461 catalog', async () => {
    const { accountData, mx } = createMatrixClient();
    accountData.delete(MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME);
    accountData.set(`${MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME}.index`, {
      profileIds: ['legacy'],
    });
    accountData.set(`${MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME}.legacy`, {
      id: 'legacy',
      name: 'Legacy',
      avatarUrl: 'mxc://example.org/avatar',
    });

    await expect(getAllPerMessageProfiles(mx)).resolves.toEqual([
      {
        id: 'legacy',
        displayname: 'Legacy',
        avatar_url: 'mxc://example.org/avatar',
        triggers: [],
      },
    ]);
    expect(
      accountData.get(`${MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME}.index`)
    ).toBeUndefined();
    expect(
      accountData.get(`${MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME}.legacy`)
    ).toBeUndefined();
  });

  it('migrates MSC4461 catalog from v2 to v3', async () => {
    const { accountData, mx } = createMatrixClient();
    accountData.delete(MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME);
    accountData.set(MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME_V2, {
      profiles: [
        {
          id: 'v2id',
          displayname: 'V2 Persona',
          'com.example.unknown-third-party': 'foobar',
          trigger: {
            prefix: ['a: '],
            'net.f0rest.suffix': [' :b'],
            'net.f0rest.circumfix': [{ prefix: '[', suffix: ']' }],
          },
        },
      ],
    });

    const catalog = {
      profiles: [
        {
          id: 'v2id',
          displayname: 'V2 Persona',
          'com.example.unknown-third-party': 'foobar',
          triggers: [{ prefix: '[', suffix: ']' }, { prefix: 'a: ' }, { suffix: ' :b' }],
        },
      ],
    };

    await expect(getAllPerMessageProfiles(mx)).resolves.toEqual(catalog.profiles);
    expect(
      accountData.get(MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME)
    ).toEqual(catalog);
    expect(
      accountData.get(MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME_V2)
    ).toBeUndefined();
  });

  it('cleans up an empty legacy index', async () => {
    const { accountData, mx } = createMatrixClient();
    accountData.delete(MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME);
    accountData.set(`${MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME}.index`, {
      profileIds: [],
    });

    await expect(getAllPerMessageProfiles(mx)).resolves.toEqual([]);
    expect(
      accountData.get(`${MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME}.index`)
    ).toBeUndefined();
    expect(
      accountData.get(MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME)
    ).toEqual({
      profiles: [],
    });
  });

  it('filters malformed legacy profile entries', async () => {
    const { accountData, mx } = createMatrixClient();
    accountData.delete(MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME);
    accountData.set(MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME_V2, {
      profiles: [profileV2('valid'), { id: 'missing-trigger', displayname: 'Invalid' }],
    });
    await expect(getAllPerMessageProfiles(mx)).resolves.toEqual([profile('valid')]);
  });

  it('filters malformed catalog v2 profile entries', async () => {
    const { accountData, mx } = createMatrixClient();
    accountData.delete(MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME);
    accountData.set(`${MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME}.index`, {
      profileIds: ['valid', 'invalid', 1],
    });
    accountData.set(`${MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME}.valid`, {
      id: 'valid',
      name: 'Valid',
    });
    accountData.set(`${MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME}.invalid`, {
      id: 'invalid',
    });
    await expect(getAllPerMessageProfiles(mx)).resolves.toEqual([
      {
        id: 'valid',
        displayname: 'Valid',
        triggers: [],
      },
    ]);
  });

  it('creates and updates profiles', async () => {
    const original = profile('first');
    const { mx } = createMatrixClient([original]);
    const replacement = { ...original, displayname: 'Replacement' };

    await addOrUpdatePerMessageProfile(mx, replacement);
    await addOrUpdatePerMessageProfile(mx, profile('second'));

    await expect(getAllPerMessageProfiles(mx)).resolves.toEqual([replacement, profile('second')]);
    expect(original.displayname).toBe('Profile first');
  });

  it('awaits account-data writes', async () => {
    let completeWrite!: () => void;
    const mx = {
      getAccountData: vi.fn<() => undefined>(() => undefined),
      setAccountData: vi.fn<() => Promise<void>>(
        () =>
          new Promise<void>((resolve) => {
            completeWrite = resolve;
          })
      ),
    } as unknown as MatrixClient;
    const saving = addOrUpdatePerMessageProfile(mx, profile('profile-id'));
    let saved = false;
    void saving.then(() => {
      saved = true;
    });

    await vi.waitFor(() => expect(completeWrite).toBeTypeOf('function'));
    expect(saved).toBe(false);

    completeWrite();
    await saving;
  });

  it('serializes concurrent catalog updates against the latest snapshot', async () => {
    const { accountData, mx, setAccountData } = createMatrixClient();
    let releaseFirstWrite!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    let writes = 0;
    setAccountData.mockImplementation(async (eventType, content) => {
      writes += 1;
      if (writes === 1) await firstWrite;
      accountData.set(eventType, content);
    });

    const first = addOrUpdatePerMessageProfile(mx, profile('first'));
    const second = addOrUpdatePerMessageProfile(mx, profile('second'));

    await vi.waitFor(() => expect(writes).toBe(1));
    releaseFirstWrite();
    await Promise.all([first, second]);

    await expect(getAllPerMessageProfiles(mx)).resolves.toEqual([
      profile('first'),
      profile('second'),
    ]);
  });

  it('deletes profiles', async () => {
    const { mx } = createMatrixClient([profile('first'), profile('second')]);

    await deletePerMessageProfile(mx, 'first');

    await expect(getAllPerMessageProfiles(mx)).resolves.toEqual([profile('second')]);
  });

  it('renames profiles', async () => {
    const { mx } = createMatrixClient([profile('old-id')]);

    await renamePerMessageProfile(mx, 'old-id', 'new-id');

    await expect(getAllPerMessageProfiles(mx)).resolves.toEqual([
      { ...profile('old-id'), id: 'new-id' },
    ]);
  });
});

describe('persona resolution', () => {
  const personas = [
    { ...profile('first'), triggers: [{ prefix: 'first: ' }] },
    { ...profile('second'), triggers: [{ prefix: 'second: ' }] },
  ];

  it('applies precedence and ignores expired selections', () => {
    expect(
      resolvePersona({
        proxy: personas[0],
        latched: personas[1],
        room: { persona: personas[1]! },
        account: { persona: personas[1]! },
        now: 1,
      })
    ).toBe(personas[0]);
    expect(
      resolvePersona({
        room: { persona: personas[0]!, validUntil: 1 },
        account: { persona: personas[1]! },
        now: 1,
      })
    ).toBe(personas[1]);
  });

  it('uses the first matching case-sensitive prefix and strips it', () => {
    expect(resolvePersonaProxy(personas, 'second: hello')).toEqual({
      persona: personas[1],
      body: 'hello',
    });
    expect(resolvePersonaProxy(personas, 'Second: hello')).toBeUndefined();
  });

  it('strips suffix and circumfix triggers', () => {
    const suffix = { ...personas[0]!, triggers: [{ suffix: ' -a' }] };
    const circumfix = {
      ...personas[1]!,
      triggers: [{ prefix: '[', suffix: ']' }],
    };

    expect(resolvePersonaProxy([suffix], 'hello -a')).toEqual({ persona: suffix, body: 'hello' });
    expect(resolvePersonaProxy([circumfix], '[hello]')).toEqual({
      persona: circumfix,
      body: 'hello',
    });
  });

  it('projects only message-safe persona fields', () => {
    expect(projectPersona(personas[0]!)).toEqual({
      id: 'first',
      displayname: 'Profile first',
    });
  });
});
