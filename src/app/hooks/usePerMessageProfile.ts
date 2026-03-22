import { PronounSet } from '$utils/pronouns';
import { MatrixClient } from 'matrix-js-sdk';

const ACCOUNT_DATA_PREFIX = 'fyi.cisnt.permessageprofile';

/**
 * a per message profile
 */
export type PerMessageProfile = {
  /**
   * a unique id for this profile, can be generated using something like nanoid.
   * This is used to identify the profile when applying it to a message, and also used as the key when storing the profile in account data.
   */
  id: string;
  /**
   * the display name to use for messages using this profile.
   * This is required because otherwise the profile would have no effect on the message.
   */
  name: string;
  /**
   * the avatar url to use for messages using this profile.
   */
  avatarUrl?: string;
  /**
   * a per message profile can also include pronouns
   * @see PronounSet for the format of the pronouns, and how to parse them from a string input
   */
  pronouns?: PronounSet[];
};

/**
 * the format used by Beeper for per message profiles
 * This is the format that Beeper expects when applying a profile to a message before sending it
 */
export type PerMessageProfileBeeperFormat = {
  /**
   * the unique id for this profile, which is used to identify the profile when applying it to a message, and also used as the key when storing the profile in account data.
   */
  id: string;
  /**
   * the display name to use for messages using this profile. This is required because otherwise the profile would have no effect on the message.
   */
  displayname: string;
  /**
   * the avatar url to use for messages using this profile.
   * Beeper expects this to be a mxc url.
   */
  avatar_url?: string;
  /**
   * using the unstable prefix for pronouns, under which it is also stored in profiles
   */
  'io.fsky.nyx.pronouns'?: PronounSet[];
  has_fallback: boolean;
};

/**
 * converts a per message profile from our format to the format used by Beeper, which is used when applying the profile to a message before sending it.
 * We have out own format because we want to have more control over the data and how it's stored in account data.
 * @export
 * @param {PerMessageProfile} profile the per message profile in our format
 * @return {*}  {PerMessageProfileBeeperFormat} the per message profile in Beeper's format, which can be applied to a message before sending it
 */
export function convertPerMessageProfileToBeeperFormat(
  profile: PerMessageProfile
): PerMessageProfileBeeperFormat {
  return {
    id: profile.id,
    displayname: profile.name,
    avatar_url: profile.avatarUrl,
    'io.fsky.nyx.pronouns': profile.pronouns,
    has_fallback: true,
  };
}

/**
 * converts a per message profile from Beeper's format to our format, which is used when storing the profile in account data and using it in the app.
 * We have our own format because we want to have more control over the data and how it's stored in account data.
 *
 * @export
 * @param {PerMessageProfileBeeperFormat} beeperProfile the per message profile in Beeper's format
 * @return {*}  {PerMessageProfile} the per message profile in our format, which can be stored in account data and used in the app
 */
export function convertBeeperFormatToOurPerMessageProfile(
  beeperProfile: PerMessageProfileBeeperFormat
): PerMessageProfile {
  return {
    id: beeperProfile.id,
    name: beeperProfile.displayname,
    avatarUrl: beeperProfile.avatar_url,
    pronouns: beeperProfile['io.fsky.nyx.pronouns'],
  };
}

type PerMessageProfileIndex = {
  /**
   * a list of all profile ids, used to list all profiles when the user wants to manage them.
   */
  profileIds: string[];
};

/**
 * how we will store room associations in the account data :3
 */
type PerMessageProfileRoomAssociation = {
  profileId: string;
  validUntil?: number;
};

/**
 * the shape of the account data for room associations, which is a wrapper around a list of associations.
 * This is used to store the associations in account data, and allows us to easily add additional fields in the future if needed without breaking the existing data structure.
 */
type PerMessageProfileRoomAssociationWrapper = {
  /**
   * Key-Value pairs of room ids and profile ids, used to apply a profile to all messages in a room without having to set the profile for each message individually.
   * The key is the room id, and the value is the profile id. The profile id can then be used to fetch the profile data when applying the profile to a message before sending it.
   *
   * @type {Map<string, PerMessageProfileRoomAssociation>}
   */
  associations:
    | Map<string, PerMessageProfileRoomAssociation>
    | Record<string, PerMessageProfileRoomAssociation>;
};

// Helper to always get a Map from wrapper
function getAssociationsMap(
  wrapper?: PerMessageProfileRoomAssociationWrapper
): Map<string, PerMessageProfileRoomAssociation> {
  if (!wrapper?.associations) return new Map();
  if (wrapper.associations instanceof Map) return wrapper.associations;
  return new Map(Object.entries(wrapper.associations));
}

// Helper to always get a plain object from a Map
function associationsMapToObject(
  map: Map<string, PerMessageProfileRoomAssociation>
): Record<string, PerMessageProfileRoomAssociation> {
  return Object.fromEntries(map);
}

export async function getPerMessageProfileById(
  mx: MatrixClient,
  id: string
): Promise<PerMessageProfile | undefined> {
  const profile = mx.getAccountData(`${ACCOUNT_DATA_PREFIX}.${id}` as any);
  return profile ? (profile.getContent() as unknown as PerMessageProfile) : undefined;
}

export async function getAllPerMessageProfiles(mx: MatrixClient): Promise<PerMessageProfile[]> {
  const profileData = mx.getAccountData(`${ACCOUNT_DATA_PREFIX}.index` as any);
  const profileIds = (profileData?.getContent() as PerMessageProfileIndex)?.profileIds || [];
  const profiles = await Promise.all(profileIds.map((id) => getPerMessageProfileById(mx, id)));
  return profiles.filter((profile): profile is PerMessageProfile => profile !== undefined);
}

export function addOrUpdatePerMessageProfile(mx: MatrixClient, profile: PerMessageProfile) {
  const profileListIndex = mx.getAccountData(`${ACCOUNT_DATA_PREFIX}.index` as any);
  if (profileListIndex?.getContent()?.profileIds.includes(profile.id)) {
    // profile already exists, just update it
    return mx.setAccountData(`${ACCOUNT_DATA_PREFIX}.${profile.id}` as any, profile as any);
  }
  // profile doesn't exist, add it to the index and then add the profile data
  const newProfileIds = [...(profileListIndex?.getContent()?.profileIds || []), profile.id];
  return Promise.all([
    mx.setAccountData(`${ACCOUNT_DATA_PREFIX}.index` as any, { profileIds: newProfileIds } as any),
    mx.setAccountData(`${ACCOUNT_DATA_PREFIX}.${profile.id}` as any, profile as any),
  ]);
}

/**
 * remove a id from the index of profile ids, used when deleting a profile to
 * remove the id from the list of profiles, so it doesn't show up in the list of profiles to manage anymore.
 * The actual profile data is also removed when deleting a profile, but this function is only responsible
 * for removing the id from the index.
 * @param mx the matrix client
 * @param id the id to drop from the index
 */
async function dropIdFromIndex(mx: MatrixClient, id: string) {
  const profileListIndex = mx.getAccountData(`${ACCOUNT_DATA_PREFIX}.index` as any);
  const profileIds = profileListIndex?.getContent()?.profileIds || [];
  const newProfileIds = profileIds.filter((profileId: string) => profileId !== id);
  await mx.setAccountData(
    `${ACCOUNT_DATA_PREFIX}.index` as any,
    { profileIds: newProfileIds } as any
  );
}

async function getRoomsUsingProfile(mx: MatrixClient, profileId: string): Promise<string[]> {
  const accountData = mx.getAccountData(`${ACCOUNT_DATA_PREFIX}.roomassociation` as any);
  const content: PerMessageProfileRoomAssociationWrapper | undefined = accountData?.getContent();
  const associations = getAssociationsMap(content);
  const roomsUsingProfile: string[] = [];
  Array.from(associations.entries()).forEach(([roomId, assoc]) => {
    if (assoc?.profileId === profileId) roomsUsingProfile.push(roomId);
  });
  return roomsUsingProfile;
}

/**
 * sets the per message profile to be used for messages in a room. This is done by setting account data with a list of room associations, which is then checked when sending a message to apply the profile to the message if the room matches an association. The associations can also have an optional expiration time, after which they will be ignored and removed.
 * @param mx matrix client
 * @param roomId the room id your querying for
 * @param profileId the profile id you are querying for
 * @param validUntil the timestamp until the pmp association is valid
 * @param reset if true, the association for the room will be removed, if false and profileId is undefined, the association will be set to undefined but not removed, meaning it will still be visible in the list of associations but won't have any effect. This is useful for resetting the association without losing the information of which profile was associated before.
 * @returns promose that resolves when the association has been set
 */
export async function setCurrentlyUsedPerMessageProfileIdForRoom(
  mx: MatrixClient,
  roomId: string,
  profileId: string | undefined,
  validUntil?: number,
  reset?: boolean
) {
  const accountData = mx.getAccountData(`${ACCOUNT_DATA_PREFIX}.roomassociation` as any);
  const content: PerMessageProfileRoomAssociationWrapper | undefined = accountData?.getContent();
  const associations = getAssociationsMap(content);

  if (reset) {
    associations.delete(roomId);
    mx.setAccountData(
      `${ACCOUNT_DATA_PREFIX}.roomassociation` as any,
      { associations: associationsMapToObject(associations) } as any
    );
    return;
  }
  if (!profileId) {
    throw new Error("profile Id is empty, yet it isn't a reset");
  }
  associations.set(roomId, { profileId, validUntil });
  mx.setAccountData(
    `${ACCOUNT_DATA_PREFIX}.roomassociation` as any,
    { associations: associationsMapToObject(associations) } as any
  );
}

/**
 * drops all room associations for a profile, used when deleting a profile to make sure there are no dangling associations left that point to a non existing profile, which could cause issues when trying to apply the profile to a message in a room that still has an association for the deleted profile.
 *
 * @param {MatrixClient} mx the matrix client
 * @param {string} id the id of the profile to drop associations for
 */
async function dropPerMessageProfileRoomAssociations(mx: MatrixClient, id: string) {
  const accountData = mx.getAccountData(`${ACCOUNT_DATA_PREFIX}.roomassociation` as any);
  const content: PerMessageProfileRoomAssociationWrapper | undefined = accountData?.getContent();
  if (!content) return;
  const associations = getAssociationsMap(content);
  const roomsUsingProfile = await getRoomsUsingProfile(mx, id);
  if (roomsUsingProfile.length === 0) return;
  roomsUsingProfile.forEach((roomId) => {
    associations.delete(roomId);
  });
  await mx.setAccountData(
    `${ACCOUNT_DATA_PREFIX}.roomassociation` as any,
    { associations: associationsMapToObject(associations) } as any
  );
}

/**
 * deletes a per message profile by its id
 * @param mx the matrix client
 * @param id the id of the profile to delete
 */
export async function deletePerMessageProfile(mx: MatrixClient, id: string) {
  await dropPerMessageProfileRoomAssociations(mx, id);
  await mx.setAccountData(`${ACCOUNT_DATA_PREFIX}.${id}` as any, {});
  await dropIdFromIndex(mx, id);
}

/**
 * move a profile from one id to another, used when renaming a profile to change the id.
 * This is done by creating a new profile with the new id and the same data as the old profile, and then deleting the old profile.
 * @param mx the matrix client
 * @param oldId the id the profile is currently saved under
 * @param newId the id it will be moved to
 */
export async function renamePerMessageProfile(mx: MatrixClient, oldId: string, newId: string) {
  const profile = await getPerMessageProfileById(mx, oldId);
  if (!profile) {
    throw new Error('Profile not found');
  }
  const newProfile = { ...profile, id: newId };
  await addOrUpdatePerMessageProfile(mx, newProfile);
  await deletePerMessageProfile(mx, oldId);
}

export async function getListOfRoomsUsingProfile(
  mx: MatrixClient,
  profileId: string
): Promise<string[]> {
  return getRoomsUsingProfile(mx, profileId);
}

/**
 * gets the per message profile to be used for messages in a room
 * @param mx matrix client
 * @param roomId the room id you are querying for
 * @returns the profile to be used
 */
export async function getCurrentlyUsedPerMessageProfileForRoom(
  mx: MatrixClient,
  roomId: string
): Promise<PerMessageProfile | undefined> {
  const accountData = mx.getAccountData(`${ACCOUNT_DATA_PREFIX}.roomassociation` as any);
  const content: PerMessageProfileRoomAssociationWrapper | undefined = accountData?.getContent();
  const associations = getAssociationsMap(content);
  const profileId = associations.get(roomId)?.profileId;
  const pmp = profileId ? await getPerMessageProfileById(mx, profileId) : undefined;
  return profileId ? pmp : undefined;
}
