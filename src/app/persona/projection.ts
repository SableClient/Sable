import {
  MATRIX_UNSTABLE_COLORS,
  MATRIX_UNSTABLE_PROFILE_PKIT_IMPORT_PROPERTY_NAME,
  MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME,
} from '$unstable/prefixes';
import type { PerMessageProfileBeeperFormat, Persona } from './index';
import chroma from 'chroma-js';
import { ThemeKind } from '$hooks/useTheme';
import { accessibleColor } from '$plugins/color';
import { parsePronounsInput } from '$app/utils/pronouns';
import type { PerMessageProfilePluralkitFormat } from './pluralkit';

export function convertPerMessageProfileToBeeperFormat(
  profile: Persona,
  has_fallback: boolean
): PerMessageProfileBeeperFormat {
  const beeperPMP: PerMessageProfileBeeperFormat = {
    id: profile.id,
    displayname: profile.displayname,
    avatar_url: profile.avatar_url,
    [MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME]:
      profile[MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME],
    [MATRIX_UNSTABLE_COLORS]: profile[MATRIX_UNSTABLE_COLORS],
    has_fallback,
  };
  if (!profile.displayname || profile.displayname.trim().length === 0) delete beeperPMP.displayname;
  if (!profile.avatar_url) delete beeperPMP.avatar_url;
  if (
    !profile[MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME] ||
    profile[MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME]?.length === 0
  )
    delete beeperPMP[MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME];
  if (!profile[MATRIX_UNSTABLE_COLORS]) delete beeperPMP[MATRIX_UNSTABLE_COLORS];
  if (!has_fallback) delete beeperPMP.has_fallback;
  return beeperPMP;
}

export function convertBeeperFormatToOurPerMessageProfile(
  beeperProfile: PerMessageProfileBeeperFormat
): Persona {
  return {
    id: beeperProfile.id,
    displayname: beeperProfile.displayname ?? '',
    avatar_url: beeperProfile.avatar_url,
    [MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME]:
      beeperProfile[MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME],
    [MATRIX_UNSTABLE_COLORS]: beeperProfile[MATRIX_UNSTABLE_COLORS],
    triggers: [],
  };
}

/** Projects a stored persona to the fields that may be sent with a message. */
export function projectPersona(persona: Persona): PerMessageProfileBeeperFormat {
  return convertPerMessageProfileToBeeperFormat(persona, false);
}

export function convertPluralkitFormatToOurPerMessageProfile(
  pkitProfile: PerMessageProfilePluralkitFormat,
  pkitAvatarUrl?: string
): Persona {
  // parse colors
  const color = { [MATRIX_UNSTABLE_COLORS]: {} };
  if (pkitProfile.color && chroma.valid(pkitProfile.color)) {
    const lightness = chroma(pkitProfile.color).lab()[0];
    const should_be_on_dark = lightness > 50;
    if (should_be_on_dark) {
      color[MATRIX_UNSTABLE_COLORS] = {
        on_dark: '#' + pkitProfile.color,
        on_light: accessibleColor(ThemeKind.Light, pkitProfile.color),
      };
    } else {
      color[MATRIX_UNSTABLE_COLORS] = {
        on_dark: accessibleColor(ThemeKind.Dark, pkitProfile.color),
        on_light: '#' + pkitProfile.color,
      };
    }
  }

  // parse proxy tags
  const triggers = pkitProfile.proxy_tags?.map(({ prefix, suffix }) => ({
    prefix: prefix ?? undefined,
    suffix: suffix ?? undefined,
  }));

  const profile: Persona = {
    id: pkitProfile.name,
    displayname: pkitProfile.display_name ?? pkitProfile.name,
    avatar_url: pkitAvatarUrl,
    triggers,
    [MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME]: parsePronounsInput(pkitProfile.pronouns),
    [MATRIX_UNSTABLE_PROFILE_PKIT_IMPORT_PROPERTY_NAME]: {
      id: pkitProfile.id,
      uuid: pkitProfile.uuid,
      description: pkitProfile.description,
      avatar_url: pkitProfile.avatar_url,
    },
    ...color,
  };

  if (!profile.avatar_url) delete profile.avatar_url;
  if (
    !profile[MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME] ||
    profile[MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME].length === 0
  )
    delete profile[MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME];
  if (
    !profile[MATRIX_UNSTABLE_COLORS] ||
    !profile[MATRIX_UNSTABLE_COLORS].on_dark ||
    !profile[MATRIX_UNSTABLE_COLORS].on_light
  )
    delete profile[MATRIX_UNSTABLE_COLORS];
  if (!profile[MATRIX_UNSTABLE_PROFILE_PKIT_IMPORT_PROPERTY_NAME]?.avatar_url)
    delete profile[MATRIX_UNSTABLE_PROFILE_PKIT_IMPORT_PROPERTY_NAME]?.avatar_url;
  if (!profile[MATRIX_UNSTABLE_PROFILE_PKIT_IMPORT_PROPERTY_NAME]?.description)
    delete profile[MATRIX_UNSTABLE_PROFILE_PKIT_IMPORT_PROPERTY_NAME]?.description;
  if (!profile[MATRIX_UNSTABLE_PROFILE_PKIT_IMPORT_PROPERTY_NAME]?.uuid)
    delete profile[MATRIX_UNSTABLE_PROFILE_PKIT_IMPORT_PROPERTY_NAME]?.uuid;
  return profile;
}

export function stripPerMessageProfilePlainBody(formatted_body: string, profile?: Persona): string {
  if (profile) return formatted_body.replace(`${profile.displayname}: `, '');
  return formatted_body.replace(/^.*?: /, '');
}

export function stripPerMessageProfileFormattedBody(formatted_body: string): string {
  return formatted_body.replace(/^<strong\s+data-mx-profile-fallback[^>]*>.*?<\/strong>/, '');
}
