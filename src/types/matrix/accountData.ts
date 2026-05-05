import * as prefix from '$unstable/prefixes';

export const CustomAccountDataEvent = {
  CinnySpaces: prefix.MATRIX_CINNY_UNSTABLE_ACCOUNT_SPACES_PROPERTY_NAME,
  ElementRecentEmoji: prefix.MATRIX_ELEMENT_UNSTABLE_ACCOUNT_RECENT_EMOJIS_PROPERTY_NAME,
  PoniesUserEmotes: prefix.MATRIX_UNSTABLE_ACCOUNT_USER_EMOTES_PROPERTY_NAME,
  PoniesEmoteRooms: prefix.MATRIX_UNSTABLE_ACCOUNT_EMOTE_ROOMS_PROPERTY_NAME,
  SableNicknames: prefix.MATRIX_SABLE_UNSTABLE_ACCOUNT_NICKNAMES_PROPERTY_NAME,
  SablePinStatus: prefix.MATRIX_SABLE_UNSTABLE_ACCOUNT_PIN_STATUS_PROPERTY_NAME,
  SablePerProfileMessageProfiles:
    prefix.MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME,
  SableSettings: prefix.MATRIX_SABLE_UNSTABLE_ACCOUNT_SETTINGS_PROPERTY_NAME,
} as const;
export type CustomAccountDataEvent =
  (typeof CustomAccountDataEvent)[keyof typeof CustomAccountDataEvent];

export type MDirectContent = Record<string, string[]>;

export type SecretStorageDefaultKeyContent = {
  key: string;
};

export type SecretStoragePassphraseContent = {
  algorithm: string;
  salt: string;
  iterations: number;
  bits?: number;
};

export type SecretStorageKeyContent = {
  name?: string;
  algorithm: string;
  iv?: string;
  mac?: string;
  passphrase?: SecretStoragePassphraseContent;
};

export type SecretContent = {
  iv: string;
  ciphertext: string;
  mac: string;
};

/**
 * type to save compatibility information
 */
export type AccountDataCompatVersion = {
  /**
   * a simple version number, for example 1
   */
  version: number;
  /**
   * the date where it was added
   */
  compatDate: string;
  /**
   * version number which is the oldest compatible, this attribute is optional
   */
  incompatBefore?: number;
};

export type SecretAccountData = {
  encrypted: Record<string, SecretContent>;
};
