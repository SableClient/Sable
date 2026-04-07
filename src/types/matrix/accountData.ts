export enum AccountDataEvent {
  // Cinny and Matrix Account data
  PushRules = 'm.push_rules',
  Direct = 'm.direct',
  IgnoredUserList = 'm.ignored_user_list',

  CinnySpaces = 'in.cinny.spaces',

  ElementRecentEmoji = 'io.element.recent_emoji',

  PoniesUserEmotes = 'im.ponies.user_emotes',
  PoniesEmoteRooms = 'im.ponies.emote_rooms',

  SecretStorageDefaultKey = 'm.secret_storage.default_key',

  CrossSigningMaster = 'm.cross_signing.master',
  CrossSigningSelf = 'm.cross_signing.self',
  CrossSigningUser = 'm.cross_signing.user',
  MegolmBackupV1 = 'm.megolm_backup.v1',

  // Sable account data
  SableNicknames = 'moe.sable.app.nicknames',
  SablePinStatus = 'moe.sable.app.pins_read_marker',

  // because of a mistake hasn't been renamed in time
  SablePerProfileMessageProfiles = 'fyi.cisnt.permessageprofile',
  SableSettings = 'moe.sable.app.settings',
}

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
