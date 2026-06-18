import * as prefix from '$unstable/prefixes';

export const CustomAccountDataEvent = {
  CinnySpaces: prefix.MATRIX_CINNY_UNSTABLE_ACCOUNT_SPACES_PROPERTY_NAME,
  ElementRecentEmoji: prefix.MATRIX_ELEMENT_UNSTABLE_ACCOUNT_RECENT_EMOJIS_PROPERTY_NAME,
  PoniesUserEmotes: prefix.MATRIX_UNSTABLE_ACCOUNT_USER_EMOTES_PROPERTY_NAME,
  PoniesEmoteRooms: prefix.MATRIX_UNSTABLE_ACCOUNT_EMOTE_ROOMS_PROPERTY_NAME,
  SecretStorageDefaultKey: 'm.secret_storage.default_key',
  CrossSigningMaster: 'm.cross_signing.master',
  CrossSigningSelf: 'm.cross_signing.self',
  CrossSigningUser: 'm.cross_signing.user',
  MegolmBackupV1: 'm.megolm_backup.v1',
  BookmarksIndex: 'org.matrix.msc4438.bookmarks.index',
  BookmarkItemPrefix: 'org.matrix.msc4438.bookmark.',
  SableNicknames: prefix.MATRIX_SABLE_UNSTABLE_ACCOUNT_NICKNAMES_PROPERTY_NAME,
  SablePinStatus: prefix.MATRIX_SABLE_UNSTABLE_ACCOUNT_PIN_STATUS_PROPERTY_NAME,
  SableBookmarksReminders: prefix.MATRIX_SABLE_UNSTABLE_ACCOUNT_BOOKMARKS_REMINDERS_PROPERTY_NAME,
  SablePresence: prefix.MATRIX_SABLE_UNSTABLE_ACCOUNT_PRESENCE_PROPERTY_NAME,
  SablePerProfileMessageProfiles:
    prefix.MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME,
  SableSettings: prefix.MATRIX_SABLE_UNSTABLE_ACCOUNT_SETTINGS_PROPERTY_NAME,
  SableNotificationDeviceLease:
    prefix.MATRIX_SABLE_UNSTABLE_ACCOUNT_NOTIFICATION_DEVICE_LEASE_PROPERTY_NAME,
  SableDismissedInvites: prefix.MATRIX_SABLE_UNSTABLE_DISMISSED_INVITES,
  SableAddedServers: prefix.MATRIX_SABLE_UNSTABLE_ACCOUNT_ADDED_SERVERS_PROPERTY_NAME,
} as const;
export type CustomAccountDataEvent =
  (typeof CustomAccountDataEvent)[keyof typeof CustomAccountDataEvent];

export type MDirectContent = Record<string, string[]>;

export type AddedServersContent = {
  servers: string[];
};

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
/** A single bookmark reminder stored in account data. */
export type BookmarkReminder = {
  /** Matches the key used in the MSC4438 bookmarks index. */
  bookmarkId: string;
  /** Matrix event ID of the bookmarked message. */
  eventId: string;
  /** Matrix room ID where the bookmarked message lives. */
  roomId: string;
  /** Unix timestamp (ms) when the reminder should fire. */
  remindAt: number;
  /** Matrix user ID who set the reminder — used for notification routing. */
  userId: string;
  /** Optional note shown in the notification body. */
  note?: string;
};

export type BookmarksRemindersContent = {
  reminders: BookmarkReminder[];
};

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
