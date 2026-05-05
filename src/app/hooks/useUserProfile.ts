import { useEffect, useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { selectAtom } from 'jotai/utils';
import type { Room } from '$types/matrix-sdk';
import { EventTimeline, EventType } from '$types/matrix-sdk';

import colorMXID from '$utils/colorMXID';
import { profilesCacheAtom } from '$state/userRoomProfile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom, shouldApplyUserHeroCards } from '$state/settings';
import type { MSC1767Text } from '$types/matrix/common';
import { areColorsTooSimilar, shadeColor } from '$utils/shadeColor';
import type { PronounSet } from '$utils/pronouns';
import { useMatrixClient } from './useMatrixClient';
import { ThemeKind, useActiveTheme } from './useTheme';
import { CustomStateEvent } from '$types/matrix/room';
import * as prefix from '$unstable/prefixes';

const inFlightProfiles = new Map<string, Promise<Record<string, unknown>>>();

export type MSC4440Bio = {
  'm.text': Array<MSC1767Text>;
};

export type UserProfile = {
  avatarUrl?: string;
  displayName?: string;
  pronouns?: PronounSet[];
  timezone?: string;
  bio?: string;
  status?: string;
  bannerUrl?: string;
  nameColor?: string;
  nameColorDark?: string;
  nameColorLight?: string;
  heroColorScheme?: Record<string, string>;
  isCat?: boolean;
  hasCats?: boolean;
  extended?: Record<string, unknown>;
  _fetched?: boolean;
};

const normalizeInfo = (info: Record<string, unknown>): UserProfile => {
  const msc4440Bio = info[prefix.MATRIX_UNSTABLE_PROFILE_BIOGRAPHY_PROPERTY_NAME] as
    | MSC4440Bio
    | undefined;
  const knownKeys = new Set([
    'avatar_url',
    'displayname',
    prefix.MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME,
    prefix.MATRIX_STABLE_PROFILE_TIMEZONE_PROPERTY_NAME,
    prefix.MATRIX_UNSTABLE_PROFILE_TIMEZONE_PROPERTY_NAME,
    prefix.MATRIX_SABLE_UNSTABLE_PROFILE_BIOGRAPHY_PROPERTY_NAME,
    prefix.MATRIX_COMMET_UNSTABLE_PROFILE_BIO_PROPERTY_NAME,
    prefix.MATRIX_UNSTABLE_PROFILE_BIOGRAPHY_PROPERTY_NAME,
    prefix.MATRIX_UNSTABLE_PROFILE_BANNER_PROPERTY_NAME,
    prefix.MATRIX_COMMET_UNSTABLE_PROFILE_STATUS_PROPERTY_NAME,
    prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_PROPERTY_NAME,
    prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_LIGHT_PROPERTY_NAME,
    prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_DARK_PROPERTY_NAME,
    prefix.MATRIX_COMMET_UNSTABLE_PROFILE_COLOR_SCHEME_PROPERTY_NAME,
    prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_HAS_CAT_PROPERTY_NAME,
    prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_IS_CAT_PROPERTY_NAME,
  ]);

  const extended: Record<string, unknown> = {};
  Object.entries(info).forEach(([key, value]) => {
    if (!knownKeys.has(key)) {
      extended[key] = value;
    }
  });

  return {
    avatarUrl: info.avatar_url as string | undefined,
    displayName: info.displayname as string | undefined,
    pronouns: info[prefix.MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME] as
      | PronounSet[]
      | undefined,
    timezone: (info[prefix.MATRIX_UNSTABLE_PROFILE_TIMEZONE_PROPERTY_NAME] ||
      info[prefix.MATRIX_STABLE_PROFILE_TIMEZONE_PROPERTY_NAME]) as string | undefined,
    bio:
      msc4440Bio?.['m.text']?.[0]?.body ||
      (info[prefix.MATRIX_SABLE_UNSTABLE_PROFILE_BIOGRAPHY_PROPERTY_NAME] as string | undefined) ||
      (info[prefix.MATRIX_COMMET_UNSTABLE_PROFILE_BIO_PROPERTY_NAME] as string | undefined),
    status: info[prefix.MATRIX_COMMET_UNSTABLE_PROFILE_STATUS_PROPERTY_NAME] as string | undefined,
    bannerUrl: info[prefix.MATRIX_UNSTABLE_PROFILE_BANNER_PROPERTY_NAME] as string | undefined,
    nameColor: info[prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_PROPERTY_NAME] as string | undefined,
    nameColorDark: info[prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_DARK_PROPERTY_NAME] as
      | string
      | undefined,
    nameColorLight: info[prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_LIGHT_PROPERTY_NAME] as
      | string
      | undefined,
    heroColorScheme: info[prefix.MATRIX_COMMET_UNSTABLE_PROFILE_COLOR_SCHEME_PROPERTY_NAME] as
      | Record<string, string>
      | undefined,
    isCat: info[prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_IS_CAT_PROPERTY_NAME] === true,
    hasCats: info[prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_HAS_CAT_PROPERTY_NAME] === true,
    extended,
    _fetched: true,
  };
};

const isValidHex = (c: unknown): string | undefined => {
  if (typeof c !== 'string') return undefined;
  // silly tuwunel smh
  const cleaned = c.replaceAll(/["']/g, '').trim();
  // Strictly allow only 3 or 6 digit hex codes, aka no opacity
  return /^#([0-9A-F]{3}|[0-9A-F]{6})$/i.test(cleaned) ? cleaned : undefined;
};
const sanitizeFont = (f: string) => f.replaceAll(/[;{}<>]/g, '').slice(0, 32);

export const useUserProfile = (
  userId: string,
  room?: Room,
  initialProfile?: Partial<UserProfile>
): UserProfile & {
  resolvedColor?: string;
  resolvedFont?: string;
  resolvedPronouns?: PronounSet[];
  heroColor?: string;
  heroNameColor?: string;
  heroBrightness?: string;
} => {
  const mx = useMatrixClient();
  const [legacyUsernameColor] = useSetting(settingsAtom, 'legacyUsernameColor');
  const [renderGlobalColors] = useSetting(settingsAtom, 'renderGlobalNameColors');
  const [renderRoomColors] = useSetting(settingsAtom, 'renderRoomColors');
  const [renderRoomFonts] = useSetting(settingsAtom, 'renderRoomFonts');
  const [renderUserCardsMode] = useSetting(settingsAtom, 'renderUserCards');
  const themeKind = useActiveTheme().kind;

  const userSelector = useMemo(() => selectAtom(profilesCacheAtom, (db) => db[userId]), [userId]);

  const cached = useAtomValue(userSelector);
  const setGlobalProfiles = useSetAtom(profilesCacheAtom);

  const hasOnlyFetchedMarker =
    cached?._fetched === true && Object.keys(cached ?? {}).every((key) => key === '_fetched');
  const needsFetch =
    !!userId && userId !== 'undefined' && (!cached?._fetched || hasOnlyFetchedMarker);

  useEffect(() => {
    if (!needsFetch) return undefined;

    let fetchPromise = inFlightProfiles.get(userId);

    if (!fetchPromise) {
      fetchPromise = mx.getProfileInfo(userId).finally(() => {
        inFlightProfiles.delete(userId);
      });
      inFlightProfiles.set(userId, fetchPromise);
    }

    let isMounted = true;

    fetchPromise
      .then((info: Record<string, unknown>) => {
        if (!isMounted) return;
        const normalized = normalizeInfo(info);
        setGlobalProfiles((prev) => ({
          ...prev,
          [userId]: { ...prev[userId], ...normalized },
        }));
      })
      .catch(() => {
        if (!isMounted) return;
        setGlobalProfiles((prev) => ({
          ...prev,
          [userId]: { ...prev[userId], _fetched: true },
        }));
      });

    return () => {
      isMounted = false;
    };
  }, [userId, needsFetch, mx, setGlobalProfiles]);

  return useMemo(() => {
    const data = cached ?? {
      displayName: initialProfile?.displayName ?? mx.getUser(userId)?.displayName,
      avatarUrl: initialProfile?.avatarUrl ?? mx.getUser(userId)?.avatarUrl,
      ...initialProfile,
    };

    let localColor;
    let localFont;
    let localPronouns;
    let spaceColor;
    let spaceFont;
    let spacePronouns;

    if (room && (renderRoomColors || renderRoomFonts)) {
      const state = room.getLiveTimeline().getState(EventTimeline.FORWARDS);

      if (renderRoomColors) {
        const localEvent = state?.getStateEvents(CustomStateEvent.RoomCosmeticsColor, userId);
        localColor = (Array.isArray(localEvent) ? localEvent[0] : localEvent)?.getContent()?.color;
      }

      if (renderRoomFonts) {
        const localFontEvent = state?.getStateEvents(CustomStateEvent.RoomCosmeticsFont, userId);
        localFont = (
          Array.isArray(localFontEvent) ? localFontEvent[0] : localFontEvent
        )?.getContent()?.font;
      }
      const localPronounEvent = state?.getStateEvents(
        CustomStateEvent.RoomCosmeticsPronouns as string,
        userId
      );
      localPronouns = (
        Array.isArray(localPronounEvent) ? localPronounEvent[0] : localPronounEvent
      )?.getContent()?.pronouns;

      const parents = state?.getStateEvents(EventType.SpaceParent);
      if (parents && parents.length > 0) {
        const parent = parents[0];
        const parentSpace = parent ? mx.getRoom(parent.getStateKey()) : undefined;
        const pState = parentSpace?.getLiveTimeline().getState(EventTimeline.FORWARDS);

        if (renderRoomColors) {
          const spaceEvent = pState?.getStateEvents(CustomStateEvent.RoomCosmeticsColor, userId);
          spaceColor = (Array.isArray(spaceEvent) ? spaceEvent[0] : spaceEvent)?.getContent()
            ?.color;
        }

        if (renderRoomFonts) {
          const spaceFontEvent = pState?.getStateEvents(CustomStateEvent.RoomCosmeticsFont, userId);
          spaceFont = (
            Array.isArray(spaceFontEvent) ? spaceFontEvent[0] : spaceFontEvent
          )?.getContent()?.font;
        }

        const spacePronounEvent = pState?.getStateEvents(
          CustomStateEvent.RoomCosmeticsPronouns as string,
          userId
        );
        spacePronouns = (
          Array.isArray(spacePronounEvent) ? spacePronounEvent[0] : spacePronounEvent
        )?.getContent()?.pronouns;
      }
    }

    const validGlobalVal = isValidHex(data?.nameColor);
    const validGlobalValDark = isValidHex(data?.nameColorDark);
    const validGlobalValLight = isValidHex(data?.nameColorLight);

    const validGlobalGeneral =
      (renderGlobalColors || userId === mx.getUserId()) && !!validGlobalVal
        ? validGlobalVal
        : undefined;
    const validGlobalDark =
      (renderGlobalColors || userId === mx.getUserId()) &&
      themeKind === ThemeKind.Dark &&
      !!validGlobalValDark
        ? validGlobalValDark
        : undefined;
    const validGlobalLight =
      (renderGlobalColors || userId === mx.getUserId()) &&
      themeKind === ThemeKind.Light &&
      !!validGlobalValLight
        ? validGlobalValLight
        : undefined;
    const validGlobal = validGlobalDark ?? validGlobalLight ?? validGlobalGeneral;
    const validLocal = localColor && isValidHex(localColor) ? localColor : undefined;
    const validSpace = spaceColor && isValidHex(spaceColor) ? spaceColor : undefined;

    const resolvedColor =
      validLocal ||
      validSpace ||
      validGlobal ||
      (legacyUsernameColor ? colorMXID(userId) : undefined);

    const rawFont = localFont || spaceFont;
    let resolvedFont;
    if (rawFont) {
      const clean = sanitizeFont(rawFont);
      resolvedFont = clean.includes(' ')
        ? `"${clean}", var(--font-secondary)`
        : `${clean}, var(--font-secondary)`;
    }

    const resolvedPronouns = localPronouns || spacePronouns || data?.pronouns;

    const rawHeroBrightness = data?.heroColorScheme?.brightness;
    const heroCardsAllowed = shouldApplyUserHeroCards(renderUserCardsMode, rawHeroBrightness);
    const validHeroColor = heroCardsAllowed ? isValidHex(data?.heroColorScheme?.color) : undefined;
    const heroBrightness = heroCardsAllowed ? rawHeroBrightness : undefined;
    const testUserHeroColor = shadeColor(validHeroColor, heroBrightness === 'dark' ? -80 : 80);

    const heroNameColor = heroCardsAllowed
      ? ((renderGlobalColors || userId === mx.getUserId()) &&
          heroBrightness === 'light' &&
          !areColorsTooSimilar(testUserHeroColor, validGlobalValLight) &&
          validGlobalValLight) ||
        (heroBrightness === 'dark' &&
          !areColorsTooSimilar(testUserHeroColor, validGlobalValDark) &&
          validGlobalValDark) ||
        resolvedColor
      : resolvedColor;
    return {
      ...data,
      resolvedColor,
      resolvedFont,
      resolvedPronouns,
      pronouns: resolvedPronouns,
      heroColor: validHeroColor,
      heroBrightness,
      heroNameColor,
    };
  }, [
    cached,
    initialProfile,
    mx,
    userId,
    room,
    renderRoomColors,
    renderRoomFonts,
    renderGlobalColors,
    renderUserCardsMode,
    themeKind,
    legacyUsernameColor,
  ]);
};
