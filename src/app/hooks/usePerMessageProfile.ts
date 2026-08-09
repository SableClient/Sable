import type { MatrixClient } from '$types/matrix-sdk';
import {
  convertBeeperFormatToOurPerMessageProfile,
  convertPerMessageProfileToBeeperFormat,
  projectPersona,
  stripPerMessageProfileFormattedBody,
  stripPerMessageProfilePlainBody,
} from '$app/persona/projection';
import { resolvePersonaProxy } from '$app/persona/proxy';
import { resolvePersona } from '$app/persona/selection';
import { ProfileCatalog } from '$app/persona/catalog';
import type { PerMessageProfileMsc4461, Persona } from '$app/persona';

// Compatibility exports for existing callers while persona persistence lives in the catalog.
export * from '$app/persona/catalog';
export {
  convertBeeperFormatToOurPerMessageProfile,
  convertPerMessageProfileToBeeperFormat,
  projectPersona,
  resolvePersona,
  resolvePersonaProxy,
  stripPerMessageProfileFormattedBody,
  stripPerMessageProfilePlainBody,
};
export type {
  PerMessageProfileBeeperFormat,
  PerMessageProfileMsc4461,
  Persona,
  ProfileTrigger,
  ResolvedPersonaSelection,
} from '$app/persona';

export async function getPerMessageProfileById(
  mx: MatrixClient,
  id: string
): Promise<Persona | undefined> {
  return new ProfileCatalog(mx).get(id);
}

export async function getAllPerMessageProfiles(mx: MatrixClient): Promise<Persona[]> {
  return new ProfileCatalog(mx).list();
}

export async function addOrUpdatePerMessageProfile(
  mx: MatrixClient,
  profile: PerMessageProfileMsc4461
) {
  await new ProfileCatalog(mx).merge(profile);
}

export async function deletePerMessageProfile(mx: MatrixClient, id: string) {
  await new ProfileCatalog(mx).remove(id);
}

export async function renamePerMessageProfile(mx: MatrixClient, oldId: string, newId: string) {
  await new ProfileCatalog(mx).rename(oldId, newId);
}

export async function setCurrentlyUsedPerMessageProfileIdForRoom(
  mx: MatrixClient,
  roomId: string,
  profileId: string | undefined,
  validUntil?: number,
  reset?: boolean
) {
  return new ProfileCatalog(mx).setSelection({ roomId }, profileId, validUntil, reset);
}

export async function setCurrentlyUsedPerMessageProfileIdForAccount(
  mx: MatrixClient,
  profileId: string | undefined,
  validUntil?: number,
  reset?: boolean
) {
  return new ProfileCatalog(mx).setSelection('account', profileId, validUntil, reset);
}

export async function getCurrentlyUsedPerMessageProfileForRoom(
  mx: MatrixClient,
  roomId: string
): Promise<PerMessageProfileMsc4461 | undefined> {
  return (await new ProfileCatalog(mx).getSelection({ roomId }))?.persona;
}

export async function getCurrentlyUsedPerMessageProfileForAccount(
  mx: MatrixClient
): Promise<PerMessageProfileMsc4461 | undefined> {
  return (await new ProfileCatalog(mx).getSelection('account'))?.persona;
}
