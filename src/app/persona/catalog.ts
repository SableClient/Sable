import type { AccountDataCompatVersion } from '$types/matrix/accountData';
import type { MatrixClient } from '$types/matrix-sdk';
import { CustomAccountDataEvent } from '$types/matrix/accountData';
import type { ColorSet } from '$hooks/useUserProfile';
import { type PronounSet } from '$utils/pronouns';
import { createKeyedQueue } from '$utils/keyedQueue';
import {
  MATRIX_SABLE_UNSTABLE_MSC4461_TRIGGER_CIRCUMFIX_PROPERTY_NAME,
  MATRIX_SABLE_UNSTABLE_MSC4461_TRIGGER_SUFFIX_PROPERTY_NAME,
  MATRIX_UNSTABLE_COLORS,
  MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME,
  MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME,
} from '$unstable/prefixes';
import type {
  Persona,
  PerMessageProfileMsc4461,
  ProfileTrigger,
  ResolvedPersonaSelection,
} from './index';

const ACCOUNT_DATA_PREFIX = CustomAccountDataEvent.SablePerProfileMessageProfiles;
const enqueueProfilePersistence = createKeyedQueue();

type LegacyProfile = {
  id: string;
  name: string;
  avatarUrl?: string;
  pronouns?: PronounSet[];
  compat?: AccountDataCompatVersion;
  colors?: ColorSet;
};

type LegacyProfileIndex = { profileIds: string[]; compat: AccountDataCompatVersion };

export type PerMessageProfileIndexMsc4461 = {
  type: 'm.per_message_profiles';
  content: { profiles: PerMessageProfileMsc4461[] };
};

export type PersonaCatalogContent = { profiles: Persona[] };
type InvalidPersonaCatalogContent = {
  type: 'm.per_message_profiles';
  content: PersonaCatalogContent;
};

type ProfileAssociation = { profileId: string; validUntil?: number };
type RoomAssociationWrapper = {
  associations: Map<string, ProfileAssociation> | Record<string, ProfileAssociation>;
  compat?: AccountDataCompatVersion;
};
type GlobalAssociationWrapper = {
  association: ProfileAssociation;
  compat?: AccountDataCompatVersion;
};

type ProxyVariation =
  | { prefix: string; suffix: undefined }
  | { prefix: undefined; suffix: string }
  | { prefix: string; suffix: string };

export type PerMessageProfileProxyAssociationV1 = {
  profileId: string;
  regexString: string;
  setAt?: number;
};
export type PerMessageProfileProxyAssociationV2 = {
  profileId: string;
  setAt?: number;
  prefix: string | undefined;
  suffix: string | undefined;
};
export type PerMessageProfileProxyAssociation =
  | PerMessageProfileProxyAssociationV1
  | PerMessageProfileProxyAssociationV2;
export type InternalPerMessageProfileProxyAssociation = {
  profileId: string;
  regex: RegExp;
  setAt?: number;
};
type ProxyAssociationWrapper = {
  associations:
    | Map<string, PerMessageProfileProxyAssociation>
    | Record<string, PerMessageProfileProxyAssociation>;
  compat?: AccountDataCompatVersion;
};

function accountData(mx: MatrixClient, eventType: string) {
  return mx.getAccountData(eventType as Parameters<typeof mx.getAccountData>[0]);
}

function isCircumfix(value: unknown): value is { prefix: string; suffix: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { prefix?: unknown }).prefix === 'string' &&
    typeof (value as { suffix?: unknown }).suffix === 'string'
  );
}

function isPersona(value: unknown): value is Persona {
  const persona = value as {
    id?: unknown;
    displayname?: unknown;
    trigger?: Record<string, unknown>;
  };
  const trigger = persona.trigger;
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof persona.id === 'string' &&
    typeof persona.displayname === 'string' &&
    typeof trigger === 'object' &&
    trigger !== null &&
    Array.isArray(trigger.prefix) &&
    trigger.prefix.every((entry) => typeof entry === 'string') &&
    (trigger[MATRIX_SABLE_UNSTABLE_MSC4461_TRIGGER_SUFFIX_PROPERTY_NAME] === undefined ||
      (Array.isArray(trigger[MATRIX_SABLE_UNSTABLE_MSC4461_TRIGGER_SUFFIX_PROPERTY_NAME]) &&
        trigger[MATRIX_SABLE_UNSTABLE_MSC4461_TRIGGER_SUFFIX_PROPERTY_NAME].every(
          (entry) => typeof entry === 'string'
        ))) &&
    (trigger[MATRIX_SABLE_UNSTABLE_MSC4461_TRIGGER_CIRCUMFIX_PROPERTY_NAME] === undefined ||
      (Array.isArray(trigger[MATRIX_SABLE_UNSTABLE_MSC4461_TRIGGER_CIRCUMFIX_PROPERTY_NAME]) &&
        trigger[MATRIX_SABLE_UNSTABLE_MSC4461_TRIGGER_CIRCUMFIX_PROPERTY_NAME].every(isCircumfix)))
  );
}

function isCatalogContent(value: unknown): value is PersonaCatalogContent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'profiles' in value &&
    Array.isArray(value.profiles)
  );
}

function readCatalog(mx: MatrixClient): { profiles: Persona[]; nested: boolean } | undefined {
  const content = accountData(
    mx,
    MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME
  )?.getContent();
  if (isCatalogContent(content))
    return { profiles: content.profiles.filter(isPersona), nested: false };

  const nested = content as InvalidPersonaCatalogContent | undefined;
  if (isCatalogContent(nested?.content)) {
    return {
      profiles: nested.content.profiles.filter(isPersona),
      nested: nested.type === 'm.per_message_profiles',
    };
  }
  return undefined;
}

async function saveCatalog(mx: MatrixClient, profiles: Persona[]) {
  await mx.setAccountData(
    MATRIX_UNSTABLE_MSC4461_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME as Parameters<
      typeof mx.setAccountData
    >[0],
    { profiles } as Parameters<typeof mx.setAccountData>[1]
  );
}

function isLegacyProfile(value: unknown): value is LegacyProfile {
  const profile = value as { id?: unknown; name?: unknown };
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof profile.id === 'string' &&
    typeof profile.name === 'string'
  );
}

function proxyAssociationMap(wrapper?: ProxyAssociationWrapper) {
  if (!wrapper?.associations) return new Map<string, PerMessageProfileProxyAssociation>();
  return wrapper.associations instanceof Map
    ? wrapper.associations
    : new Map(Object.entries(wrapper.associations));
}

function associationMap(wrapper?: RoomAssociationWrapper) {
  if (!wrapper?.associations) return new Map<string, ProfileAssociation>();
  return wrapper.associations instanceof Map
    ? wrapper.associations
    : new Map(Object.entries(wrapper.associations));
}

export function extractCircumfixProxyTagsFromKey(proxyId: string): ProxyVariation | null {
  const [prefix, suffix] = proxyId.split('text');
  if (!prefix && !suffix) return null;
  if (prefix && !suffix) return { prefix, suffix: undefined };
  if (!prefix && suffix) return { prefix: undefined, suffix };
  return { prefix: prefix!, suffix: suffix! };
}

export function createProxyKey(prefix: string | undefined, suffix: string | undefined) {
  return `${prefix || ''}text${suffix || ''}`;
}

export function proxyNeedsMigration(assoc: PerMessageProfileProxyAssociation) {
  return (assoc as PerMessageProfileProxyAssociationV1).regexString !== undefined;
}

export function migratePmpProxyAssociation(
  proxyId: string,
  assoc: PerMessageProfileProxyAssociation
): PerMessageProfileProxyAssociationV2 | null {
  if ((assoc as PerMessageProfileProxyAssociationV1).regexString) {
    const fixes = extractCircumfixProxyTagsFromKey(proxyId);
    return fixes
      ? { profileId: assoc.profileId, ...(assoc.setAt && { setAt: assoc.setAt }), ...fixes }
      : null;
  }
  return assoc as PerMessageProfileProxyAssociationV2;
}

export function parsePerMessageProfileProxyAssociation(
  assoc: PerMessageProfileProxyAssociationV1
): InternalPerMessageProfileProxyAssociation {
  const match = assoc.regexString.match(/^\/([\s\S]*)\/([gimsuy]*)$/);
  return {
    profileId: assoc.profileId,
    regex: new RegExp(match?.[1] ?? assoc.regexString, match?.[2] ?? ''),
    setAt: assoc.setAt,
  };
}

export function convertPmpToMsc4461(mx: MatrixClient, profile: LegacyProfile): Persona {
  const trigger: ProfileTrigger = {
    prefix: [],
    [MATRIX_SABLE_UNSTABLE_MSC4461_TRIGGER_SUFFIX_PROPERTY_NAME]: [],
    [MATRIX_SABLE_UNSTABLE_MSC4461_TRIGGER_CIRCUMFIX_PROPERTY_NAME]: [],
  };
  proxyAssociationMap(
    accountData(mx, `${ACCOUNT_DATA_PREFIX}.proxyassociation`)?.getContent() as
      | ProxyAssociationWrapper
      | undefined
  )
    .entries()
    .filter(([, association]) => association.profileId === profile.id)
    .forEach(([key, association]) => {
      const migrated = migratePmpProxyAssociation(key, association);
      if (!migrated) return;
      if (migrated.prefix && !migrated.suffix) trigger.prefix.push(migrated.prefix);
      else if (!migrated.prefix && migrated.suffix)
        trigger[MATRIX_SABLE_UNSTABLE_MSC4461_TRIGGER_SUFFIX_PROPERTY_NAME]!.push(migrated.suffix);
      else if (migrated.prefix && migrated.suffix)
        trigger[MATRIX_SABLE_UNSTABLE_MSC4461_TRIGGER_CIRCUMFIX_PROPERTY_NAME]!.push({
          prefix: migrated.prefix,
          suffix: migrated.suffix,
        });
    });
  const persona: Persona = {
    id: profile.id,
    displayname: profile.name,
    avatar_url: profile.avatarUrl,
    [MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME]: profile.pronouns,
    [MATRIX_UNSTABLE_COLORS]: profile.colors,
    trigger,
  };
  if (!profile.avatarUrl) delete persona.avatar_url;
  if (!profile.pronouns?.length) delete persona[MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME];
  if (!profile.colors) delete persona[MATRIX_UNSTABLE_COLORS];
  return persona;
}

export class ProfileCatalog {
  constructor(private readonly mx: MatrixClient) {}

  private async load(migrate: boolean): Promise<Persona[]> {
    const catalog = readCatalog(this.mx);
    if (catalog) {
      if (migrate && catalog.nested) await saveCatalog(this.mx, catalog.profiles);
      return catalog.profiles;
    }

    const index = accountData(this.mx, `${ACCOUNT_DATA_PREFIX}.index`);
    if (!index) return [];
    const profileIds = (index.getContent() as LegacyProfileIndex | undefined)?.profileIds;
    const ids = Array.isArray(profileIds)
      ? profileIds.filter((id): id is string => typeof id === 'string')
      : [];
    const profiles = ids
      .map((id) => accountData(this.mx, `${ACCOUNT_DATA_PREFIX}.${id}`)?.getContent())
      .filter(isLegacyProfile)
      .map((profile) => convertPmpToMsc4461(this.mx, profile));

    if (migrate) {
      await saveCatalog(this.mx, profiles);
      await this.mx.deleteAccountData(
        `${ACCOUNT_DATA_PREFIX}.index` as Parameters<typeof this.mx.deleteAccountData>[0]
      );
      await Promise.all(
        ids.map((id) =>
          this.mx.deleteAccountData(
            `${ACCOUNT_DATA_PREFIX}.${id}` as Parameters<typeof this.mx.deleteAccountData>[0]
          )
        )
      );
    }
    return profiles;
  }

  async list({ migrate = true }: { migrate?: boolean } = {}): Promise<Persona[]> {
    if (!migrate) return this.load(false);
    return enqueueProfilePersistence('catalog', () => this.load(true));
  }

  async get(id: string): Promise<Persona | undefined> {
    return (await this.list({ migrate: false })).find((persona) => persona.id === id);
  }

  async merge(persona: Persona): Promise<void> {
    await enqueueProfilePersistence('catalog', async () => {
      const personas = await this.load(true);
      const index = personas.findIndex((existing) => existing.id === persona.id);
      await saveCatalog(
        this.mx,
        index === -1
          ? [...personas, persona]
          : personas.map((existing) =>
              existing.id === persona.id ? { ...existing, ...persona } : existing
            )
      );
    });
  }

  async remove(id: string): Promise<void> {
    await enqueueProfilePersistence('catalog', async () => {
      await this.dropRoomAssociations(id);
      await this.dropGlobalAssociation(id);
      await saveCatalog(
        this.mx,
        (await this.load(true)).filter((persona) => persona.id !== id)
      );
    });
  }

  async rename(oldId: string, newId: string): Promise<void> {
    await enqueueProfilePersistence('catalog', async () => {
      const personas = await this.load(true);
      if (!personas.some((persona) => persona.id === oldId)) throw new Error('Profile not found');
      await saveCatalog(
        this.mx,
        personas.map((persona) => (persona.id === oldId ? { ...persona, id: newId } : persona))
      );
      await this.replaceAssociations(oldId, newId);
    });
  }

  async overwrite(profiles: Persona[]): Promise<void> {
    await enqueueProfilePersistence('catalog', async () => {
      await saveCatalog(this.mx, profiles);
    });
  }

  async getSelection(
    scope: 'account' | { roomId: string }
  ): Promise<ResolvedPersonaSelection | undefined> {
    const association =
      scope === 'account'
        ? (
            accountData(this.mx, `${ACCOUNT_DATA_PREFIX}.globalassociation`)?.getContent() as
              | GlobalAssociationWrapper
              | undefined
          )?.association
        : associationMap(
            accountData(this.mx, `${ACCOUNT_DATA_PREFIX}.roomassociation`)?.getContent() as
              | RoomAssociationWrapper
              | undefined
          ).get(scope.roomId);
    if (!association) return undefined;
    const persona = await this.get(association.profileId);
    return persona ? { persona, validUntil: association.validUntil } : undefined;
  }

  async setSelection(
    scope: 'account' | { roomId: string },
    profileId: string | undefined,
    validUntil?: number,
    reset?: boolean
  ) {
    const key = scope === 'account' ? 'globalassociation' : 'roomassociation';
    return enqueueProfilePersistence(key, async () => {
      const eventType = `${ACCOUNT_DATA_PREFIX}.${key}`;
      if (reset) {
        if (scope === 'account')
          await this.mx.deleteAccountData(
            eventType as Parameters<typeof this.mx.deleteAccountData>[0]
          );
        else {
          const associations = associationMap(
            accountData(this.mx, eventType)?.getContent() as RoomAssociationWrapper | undefined
          );
          associations.delete(scope.roomId);
          await this.mx.setAccountData(
            eventType as Parameters<typeof this.mx.setAccountData>[0],
            { associations: Object.fromEntries(associations) } as Parameters<
              typeof this.mx.setAccountData
            >[1]
          );
        }
        return;
      }
      if (!profileId) throw new Error("profile Id is empty, yet it isn't a reset");
      if (scope === 'account') {
        await this.mx.setAccountData(
          eventType as Parameters<typeof this.mx.setAccountData>[0],
          { association: { profileId, validUntil } } as Parameters<typeof this.mx.setAccountData>[1]
        );
      } else {
        const associations = associationMap(
          accountData(this.mx, eventType)?.getContent() as RoomAssociationWrapper | undefined
        );
        associations.set(scope.roomId, { profileId, validUntil });
        await this.mx.setAccountData(
          eventType as Parameters<typeof this.mx.setAccountData>[0],
          { associations: Object.fromEntries(associations) } as Parameters<
            typeof this.mx.setAccountData
          >[1]
        );
      }
    });
  }

  private async dropRoomAssociations(profileId: string) {
    await enqueueProfilePersistence('roomassociation', async () => {
      const eventType = `${ACCOUNT_DATA_PREFIX}.roomassociation`;
      const content = accountData(this.mx, eventType)?.getContent() as
        | RoomAssociationWrapper
        | undefined;
      if (!content) return;
      const associations = associationMap(content);
      let changed = false;
      for (const [roomId, association] of associations) {
        if (association?.profileId === profileId) {
          associations.delete(roomId);
          changed = true;
        }
      }
      if (changed) {
        await this.mx.setAccountData(
          eventType as Parameters<typeof this.mx.setAccountData>[0],
          { ...content, associations: Object.fromEntries(associations) } as Parameters<
            typeof this.mx.setAccountData
          >[1]
        );
      }
    });
  }

  private async replaceAssociations(oldId: string, newId: string) {
    await Promise.all([
      this.replaceRoomAssociations(oldId, newId),
      this.replaceGlobalAssociation(oldId, newId),
    ]);
  }

  private async replaceRoomAssociations(oldId: string, newId: string) {
    await enqueueProfilePersistence('roomassociation', async () => {
      const eventType = `${ACCOUNT_DATA_PREFIX}.roomassociation`;
      const content = accountData(this.mx, eventType)?.getContent() as
        | RoomAssociationWrapper
        | undefined;
      if (!content) return;
      const associations = associationMap(content);
      let changed = false;
      for (const association of associations.values()) {
        if (association?.profileId === oldId) {
          association.profileId = newId;
          changed = true;
        }
      }
      if (changed) {
        await this.mx.setAccountData(
          eventType as Parameters<typeof this.mx.setAccountData>[0],
          { ...content, associations: Object.fromEntries(associations) } as Parameters<
            typeof this.mx.setAccountData
          >[1]
        );
      }
    });
  }

  private async replaceGlobalAssociation(oldId: string, newId: string) {
    await enqueueProfilePersistence('globalassociation', async () => {
      const eventType = `${ACCOUNT_DATA_PREFIX}.globalassociation`;
      const content = accountData(this.mx, eventType)?.getContent() as
        | GlobalAssociationWrapper
        | undefined;
      if (content?.association?.profileId !== oldId) return;
      await this.mx.setAccountData(
        eventType as Parameters<MatrixClient['setAccountData']>[0],
        {
          ...content,
          association: { ...content.association, profileId: newId },
        } as Parameters<MatrixClient['setAccountData']>[1]
      );
    });
  }

  private async dropGlobalAssociation(profileId: string) {
    await enqueueProfilePersistence('globalassociation', async () => {
      const eventType = `${ACCOUNT_DATA_PREFIX}.globalassociation`;
      const content = accountData(this.mx, eventType)?.getContent() as
        | GlobalAssociationWrapper
        | undefined;
      if (content?.association?.profileId !== profileId) return;
      await this.mx.deleteAccountData(
        eventType as Parameters<MatrixClient['deleteAccountData']>[0]
      );
    });
  }
}

export async function getAllProxiesForPMP(
  mx: MatrixClient,
  profileId: string
): Promise<PerMessageProfileProxyAssociationV2[]> {
  return [
    ...proxyAssociationMap(
      accountData(mx, `${ACCOUNT_DATA_PREFIX}.proxyassociation`)?.getContent() as
        | ProxyAssociationWrapper
        | undefined
    ).entries(),
  ]
    .filter(([, association]) => association.profileId === profileId)
    .flatMap(([key, association]) => {
      const migrated = migratePmpProxyAssociation(key, association);
      return migrated ? [migrated] : [];
    });
}
