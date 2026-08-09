import { uploadContent } from '$app/utils/matrix';
import type { MatrixClient, MatrixError } from '$types/matrix-sdk';
import { getParsedPronouns } from '$utils/pronouns';
import type { ProfileCatalog } from './catalog';
import { convertPluralkitFormatToOurPerMessageProfile } from './projection';

/** Used for PluralKit import */
export type PerMessageProfilePluralkitFormat = {
  id: string;
  uuid?: string;
  name: string;
  display_name?: string;
  color?: string;
  pronouns?: string;
  avatar_url?: string;
  description?: string;
  proxy_tags?: { prefix: string | null; suffix: string | null }[];
};

export async function fetchPkitAvatar(mx: MatrixClient, url: string): Promise<string> {
  const req = await fetch(url);
  if (!req.ok) throw new Error(`Fetch request to ${url} failed with code ${req.status}.`);

  const content = await req.blob();
  const uploadFile = new File([content], 'filename');

  return new Promise((resolve, reject) => {
    uploadContent(mx, uploadFile, {
      onSuccess: resolve,
      onError: function (error: MatrixError): void {
        reject(error);
      },
    });
  });
}

export type PkImportOptions = {
  extractPronouns?: boolean;
};

export async function mergePluralkitProfile(
  mx: MatrixClient,
  catalog: ProfileCatalog,
  pkPersona: PerMessageProfilePluralkitFormat,
  options?: PkImportOptions
): Promise<void> {
  const personas = await catalog.list({ migrate: false });

  // extract pronouns before converting to our Persona format
  if (options?.extractPronouns && !!pkPersona.display_name) {
    const { cleanedDisplayName, inlinePronoun } = getParsedPronouns(pkPersona.display_name, true);

    if (inlinePronoun) {
      pkPersona.display_name = cleanedDisplayName;
      pkPersona.pronouns = inlinePronoun;
    }
  }
  const newPersona = convertPluralkitFormatToOurPerMessageProfile(pkPersona);

  // look for an old pluralkit profile
  const matchingPersonaIndex = personas.findIndex(
    ({ ['net.f0rest.pkimport']: record }) =>
      (!!pkPersona.uuid && record?.uuid == pkPersona.uuid) || record?.id == pkPersona.id
  );
  const oldPersona = matchingPersonaIndex !== -1 ? personas[matchingPersonaIndex] : null;

  if (pkPersona.avatar_url) {
    // check if we can reuse the old avatar url (check pk avatar urls)
    if (
      oldPersona &&
      oldPersona.avatar_url &&
      oldPersona['net.f0rest.pkimport']?.avatar_url &&
      oldPersona['net.f0rest.pkimport']?.avatar_url === pkPersona.avatar_url
    ) {
      newPersona.avatar_url = oldPersona.avatar_url;
    } else {
      newPersona.avatar_url = await fetchPkitAvatar(mx, pkPersona.avatar_url);
    }
  }

  // if we find a pluralkit match but the id has changed, rename before merge
  if (oldPersona && oldPersona.id !== newPersona.id)
    await catalog.rename(oldPersona.id, newPersona.id);
  await catalog.merge(newPersona);
}

export async function importPluralkitMembers(
  mx: MatrixClient,
  catalog: ProfileCatalog,
  pkitPersonas: PerMessageProfilePluralkitFormat[],
  options?: PkImportOptions
): Promise<void> {
  for (const pkPersona of pkitPersonas) {
    // i don't want to deal with the potential for race conditions,
    // and i'm fine with an import being slow
    //
    // oxlint-disable-next-line no-await-in-loop
    await mergePluralkitProfile(mx, catalog, pkPersona, options);
  }
}
