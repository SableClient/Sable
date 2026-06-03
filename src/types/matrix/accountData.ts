export enum CustomAccountDataEvent {
  CinnySpaces = 'in.cinny.spaces',

  ElementRecentEmoji = 'io.element.recent_emoji',

  PoniesUserEmotes = 'im.ponies.user_emotes',
  PoniesEmoteRooms = 'im.ponies.emote_rooms',

  SecretStorageDefaultKey = 'm.secret_storage.default_key',

  CrossSigningMaster = 'm.cross_signing.master',
  CrossSigningSelf = 'm.cross_signing.self',
  CrossSigningUser = 'm.cross_signing.user',
  MegolmBackupV1 = 'm.megolm_backup.v1',

  // MSC4438 Message Bookmarks (unstable prefix)
  BookmarksIndex = 'org.matrix.msc4438.bookmarks.index',
  /** Prefix for per-bookmark item events; append the bookmark ID to get the full event type. */
  BookmarkItemPrefix = 'org.matrix.msc4438.bookmark.',

  // Sable account data
  SableNicknames = 'moe.sable.app.nicknames',
  SablePinStatus = 'moe.sable.app.pins_read_marker',
  SableBookmarksReminders = 'moe.sable.bookmarks.reminders',
  SablePresence = 'moe.sable.app.presence',

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
