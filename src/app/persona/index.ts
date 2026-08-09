import type { AccountDataCompatVersion } from '$types/matrix/accountData';
import type { PronounSet } from '$utils/pronouns';
import type {
  MATRIX_SABLE_UNSTABLE_MSC4461_TRIGGER_CIRCUMFIX_PROPERTY_NAME,
  MATRIX_SABLE_UNSTABLE_MSC4461_TRIGGER_SUFFIX_PROPERTY_NAME,
  MATRIX_UNSTABLE_COLORS,
  MATRIX_UNSTABLE_PROFILE_PKIT_IMPORT_PROPERTY_NAME,
  MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME,
} from '$unstable/prefixes';
import type { ColorSet } from '$hooks/useUserProfile';

export type ProfileTrigger = {
  prefix: string[];
  [MATRIX_SABLE_UNSTABLE_MSC4461_TRIGGER_SUFFIX_PROPERTY_NAME]?: string[];
  [MATRIX_SABLE_UNSTABLE_MSC4461_TRIGGER_CIRCUMFIX_PROPERTY_NAME]?: {
    prefix: string;
    suffix: string;
  }[];
};

export type PkitImport = {
  id: string;
  uuid?: string;
  description?: string;
  avatar_url?: string;
};

export type PerMessageProfileMsc4461 = {
  id: string;
  displayname: string;
  avatar_url?: string;
  [MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME]?: PronounSet[];
  [MATRIX_UNSTABLE_COLORS]?: ColorSet;
  [MATRIX_UNSTABLE_PROFILE_PKIT_IMPORT_PROPERTY_NAME]?: PkitImport;
  trigger: ProfileTrigger;
  compat?: AccountDataCompatVersion;
};

/** A reusable profile stored in the MSC4461 account-data catalog. */
export type Persona = PerMessageProfileMsc4461;

export type PerMessageProfileBeeperFormat = {
  id: string;
  displayname?: string;
  avatar_url?: string;
  [MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME]?: PronounSet[];
  [MATRIX_UNSTABLE_COLORS]?: ColorSet;
  has_fallback?: boolean;
};

export type ResolvedPersonaSelection = {
  persona: Persona;
  validUntil?: number;
};
