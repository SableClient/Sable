import { useEffect, useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { selectAtom } from 'jotai/utils';
import type { MatrixClient, Room } from '$types/matrix-sdk';
import { EventTimeline, EventType } from '$types/matrix-sdk';

import colorMXID from '$utils/colorMXID';
import { persistentProfileIdsAtom, profilesCacheAtom } from '$state/userRoomProfile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom, shouldApplyUserHeroCards } from '$state/settings';
import type { MSC1767Text } from '$types/matrix/common';
import { areColorsTooSimilar, shadeColor } from '$utils/shadeColor';
import type { PronounSet } from '$utils/pronouns';
import { useMatrixClient } from './useMatrixClient';
import { ThemeKind, useActiveTheme } from './useTheme';
import { useTimelineScrolling } from './useTimelineScrollActivity';
import { useIsInactivePanel } from './useRoom';
import { CustomStateEvent } from '$types/matrix/room';
import * as prefix from '$unstable/prefixes';
import { PROFILE_CACHE_FRESH_MS } from '$client/userProfileCache';

const MAX_CONCURRENT_PROFILE_REQUESTS = 4;
const PROFILE_REQUEST_DWELL_MS = 150;
const inFlightProfiles = new WeakMap<MatrixClient, Map<string, Promise<Record<string, unknown>>>>();
const activeProfileRequests = new WeakMap<MatrixClient, number>();
const profileRequestQueues = new WeakMap<MatrixClient, Array<() => void>>();
const profileFetchGenerations = new WeakMap<MatrixClient, Map<string, number>>();

const getFetchGeneration = (mx: MatrixClient, userId: string): number =>
  profileFetchGenerations.get(mx)?.get(userId) ?? 0;

const bumpFetchGeneration = (mx: MatrixClient, userId: string): void => {
  const generations = profileFetchGenerations.get(mx) ?? new Map<string, number>();
  profileFetchGenerations.set(mx, generations);
  generations.set(userId, (generations.get(userId) ?? 0) + 1);
};

export type ColorSet = {
  on_light?: string;
  on_dark?: string;
};

const scheduleProfileRequest = (
  mx: MatrixClient,
  task: () => Promise<Record<string, unknown>>
): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    const run = () => {
      activeProfileRequests.set(mx, (activeProfileRequests.get(mx) ?? 0) + 1);
      void task()
        .then(resolve, reject)
        .finally(() => {
          const active = Math.max(0, (activeProfileRequests.get(mx) ?? 1) - 1);
          activeProfileRequests.set(mx, active);
          // Newest first: a profile just scrolled to would otherwise wait behind the backlog.
          if (active < MAX_CONCURRENT_PROFILE_REQUESTS) profileRequestQueues.get(mx)?.pop()?.();
        });
    };

    if ((activeProfileRequests.get(mx) ?? 0) < MAX_CONCURRENT_PROFILE_REQUESTS) {
      run();
      return;
    }

    const queue = profileRequestQueues.get(mx) ?? [];
    profileRequestQueues.set(mx, queue);
    queue.push(run);
  });

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
  nameColors?: ColorSet;
  heroColorScheme?: Record<string, string>;
  isCat?: boolean;
  hasCats?: boolean;
  isAnimal?: string;
  hasAnimal?: string;
  animalNeed?: string;
  extended?: Record<string, unknown>;
  _fetched?: boolean;
  _fetchedAt?: number;
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
    prefix.MATRIX_UNSTABLE_COLORS,
    prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_PROPERTY_NAME,
    prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_LIGHT_PROPERTY_NAME,
    prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_DARK_PROPERTY_NAME,
    prefix.MATRIX_COMMET_UNSTABLE_PROFILE_COLOR_SCHEME_PROPERTY_NAME,
    prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_HAS_CAT_PROPERTY_NAME,
    prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_IS_CAT_PROPERTY_NAME,
    prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_IS_ANIMAL_PROPERTY_NAME,
    prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_HAS_ANIMAL_PROPERTY_NAME,
    prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_ANIMAL_NEED_PROPERTY_NAME,
  ]);

  const extended: Record<string, unknown> = {};
  Object.entries(info).forEach(([key, value]) => {
    if (!knownKeys.has(key)) {
      extended[key] = value;
    }
  });

  const normalized: UserProfile = {
    avatarUrl: info.avatar_url as string | undefined,
    displayName: info.displayname as string | undefined,
    _fetched: true,
    _fetchedAt: Date.now(),
  };

  if (prefix.MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME in info) {
    normalized.pronouns = info[prefix.MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME] as
      | PronounSet[]
      | undefined;
  }
  if (
    prefix.MATRIX_UNSTABLE_PROFILE_TIMEZONE_PROPERTY_NAME in info ||
    prefix.MATRIX_STABLE_PROFILE_TIMEZONE_PROPERTY_NAME in info
  ) {
    normalized.timezone = (info[prefix.MATRIX_UNSTABLE_PROFILE_TIMEZONE_PROPERTY_NAME] ||
      info[prefix.MATRIX_STABLE_PROFILE_TIMEZONE_PROPERTY_NAME]) as string | undefined;
  }
  if (
    prefix.MATRIX_UNSTABLE_PROFILE_BIOGRAPHY_PROPERTY_NAME in info ||
    prefix.MATRIX_SABLE_UNSTABLE_PROFILE_BIOGRAPHY_PROPERTY_NAME in info ||
    prefix.MATRIX_COMMET_UNSTABLE_PROFILE_BIO_PROPERTY_NAME in info
  ) {
    normalized.bio =
      msc4440Bio?.['m.text']?.[0]?.body ||
      (info[prefix.MATRIX_SABLE_UNSTABLE_PROFILE_BIOGRAPHY_PROPERTY_NAME] as string | undefined) ||
      (info[prefix.MATRIX_COMMET_UNSTABLE_PROFILE_BIO_PROPERTY_NAME] as string | undefined);
  }
  if (prefix.MATRIX_COMMET_UNSTABLE_PROFILE_STATUS_PROPERTY_NAME in info) {
    normalized.status = info[prefix.MATRIX_COMMET_UNSTABLE_PROFILE_STATUS_PROPERTY_NAME] as
      | string
      | undefined;
  }
  if (prefix.MATRIX_UNSTABLE_PROFILE_BANNER_PROPERTY_NAME in info) {
    normalized.bannerUrl = info[prefix.MATRIX_UNSTABLE_PROFILE_BANNER_PROPERTY_NAME] as
      | string
      | undefined;
  }
  if (prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_PROPERTY_NAME in info) {
    normalized.nameColor = info[prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_PROPERTY_NAME] as
      | string
      | undefined;
  }
  if (prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_DARK_PROPERTY_NAME in info) {
    normalized.nameColorDark = info[prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_DARK_PROPERTY_NAME] as
      | string
      | undefined;
  }
  if (prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_LIGHT_PROPERTY_NAME in info) {
    normalized.nameColorLight = info[
      prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_LIGHT_PROPERTY_NAME
    ] as string | undefined;
  }
  if (prefix.MATRIX_UNSTABLE_COLORS in info) {
    normalized.nameColors = info[prefix.MATRIX_UNSTABLE_COLORS] as ColorSet | undefined;
  }
  if (prefix.MATRIX_COMMET_UNSTABLE_PROFILE_COLOR_SCHEME_PROPERTY_NAME in info) {
    normalized.heroColorScheme = info[
      prefix.MATRIX_COMMET_UNSTABLE_PROFILE_COLOR_SCHEME_PROPERTY_NAME
    ] as Record<string, string> | undefined;
  }
  if (prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_IS_CAT_PROPERTY_NAME in info) {
    normalized.isCat = info[prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_IS_CAT_PROPERTY_NAME] as
      | boolean
      | undefined;
  }
  if (prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_HAS_CAT_PROPERTY_NAME in info) {
    normalized.hasCats = info[
      prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_HAS_CAT_PROPERTY_NAME
    ] as boolean | undefined;
  }
  if (prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_IS_ANIMAL_PROPERTY_NAME in info) {
    normalized.isAnimal = info[
      prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_IS_ANIMAL_PROPERTY_NAME
    ] as string;
  }
  if (prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_HAS_ANIMAL_PROPERTY_NAME in info) {
    normalized.hasAnimal = info[
      prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_HAS_ANIMAL_PROPERTY_NAME
    ] as string;
  }
  if (prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_ANIMAL_NEED_PROPERTY_NAME in info) {
    normalized.animalNeed = info[
      prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_ANIMAL_NEED_PROPERTY_NAME
    ] as string;
  }
  if (Object.keys(extended).length > 0) {
    normalized.extended = extended;
  }

  return normalized;
};

export const invalidateUserProfileCache = (
  mx: MatrixClient,
  userId: string,
  setProfiles: (update: (prev: Record<string, UserProfile>) => Record<string, UserProfile>) => void
): void => {
  bumpFetchGeneration(mx, userId);
  setProfiles((prev) => {
    const existing = prev[userId];
    if (!existing) return prev;
    return { ...prev, [userId]: { ...existing, _fetchedAt: 0 } };
  });
};

export const isValidHex = (c: unknown): string | undefined => {
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
  initialProfile?: Partial<UserProfile>,
  persistAcrossSessions = false,
  fetchEnabled = true
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
  const timelineScrolling = useTimelineScrolling();
  const isInactivePanel = useIsInactivePanel();

  const userSelector = useMemo(() => selectAtom(profilesCacheAtom, (db) => db[userId]), [userId]);

  const cached = useAtomValue(userSelector);
  const setGlobalProfiles = useSetAtom(profilesCacheAtom);
  const setPersistentProfileIds = useSetAtom(persistentProfileIdsAtom);

  useEffect(() => {
    if (!persistAcrossSessions || !userId || userId === 'undefined') return;
    setPersistentProfileIds((prev) => {
      if (prev.has(userId)) return prev;
      const next = new Set(prev);
      next.add(userId);
      return next;
    });
  }, [persistAcrossSessions, setPersistentProfileIds, userId]);

  const fetchedAt = cached?._fetchedAt;
  const isFresh =
    cached?._fetched === true &&
    typeof fetchedAt === 'number' &&
    Date.now() - fetchedAt < PROFILE_CACHE_FRESH_MS;
  const needsFetch =
    fetchEnabled &&
    !timelineScrolling &&
    !isInactivePanel &&
    !!userId &&
    userId !== 'undefined' &&
    !isFresh;

  useEffect(() => {
    if (!needsFetch) return undefined;

    const startFetch = () => {
      const clientInFlight = inFlightProfiles.get(mx) ?? new Map();
      inFlightProfiles.set(mx, clientInFlight);
      if (clientInFlight.has(userId)) return;

      const generation = getFetchGeneration(mx, userId);
      const fetchPromise = scheduleProfileRequest(mx, () => mx.getProfileInfo(userId)).finally(
        () => {
          clientInFlight.delete(userId);
        }
      );
      clientInFlight.set(userId, fetchPromise);

      // Attach the cache update only when creating the shared request. It deliberately outlives
      // the initiating row: a completed request remains useful after a fast virtualized scroll.
      fetchPromise
        .then((info: Record<string, unknown>) => {
          if (getFetchGeneration(mx, userId) !== generation) {
            startFetch();
            return;
          }
          const normalized = normalizeInfo(info);
          setGlobalProfiles((prev) => {
            const { [userId]: previousProfile, ...otherProfiles } = prev;
            return {
              ...otherProfiles,
              [userId]: { ...previousProfile, ...normalized },
            };
          });
        })
        .catch(() => {
          if (getFetchGeneration(mx, userId) !== generation) {
            startFetch();
            return;
          }
          setGlobalProfiles((prev) => ({
            ...prev,
            [userId]: { ...prev[userId], _fetched: true, _fetchedAt: Date.now() },
          }));
        });
    };

    const timeoutId = window.setTimeout(startFetch, PROFILE_REQUEST_DWELL_MS);

    return () => window.clearTimeout(timeoutId);
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
        const roomMemberEvent = state?.getStateEvents(EventType.RoomMember, userId);
        const roomColorContent = (
          Array.isArray(roomMemberEvent) ? roomMemberEvent[0] : roomMemberEvent
        )?.getContent();
        const roomColorObject = roomColorContent?.[prefix.MATRIX_UNSTABLE_COLORS];
        const roomColorNew =
          themeKind === ThemeKind.Light ? roomColorObject?.on_light : roomColorObject?.on_dark;
        const localEvent = state?.getStateEvents(CustomStateEvent.RoomCosmeticsColor, userId);
        const localColorOld = (Array.isArray(localEvent) ? localEvent[0] : localEvent)?.getContent()
          ?.color;
        localColor = roomColorNew ?? localColorOld;
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
          const spaceMemberEvent = pState?.getStateEvents(EventType.RoomMember, userId);
          const spaceColorContent = (
            Array.isArray(spaceMemberEvent) ? spaceMemberEvent[0] : spaceMemberEvent
          )?.getContent();
          const spaceColorObject = spaceColorContent?.[prefix.MATRIX_UNSTABLE_COLORS];
          const spaceColorNew =
            themeKind === ThemeKind.Light ? spaceColorObject?.on_light : spaceColorObject?.on_dark;
          const spaceEvent = pState?.getStateEvents(CustomStateEvent.RoomCosmeticsColor, userId);
          const spaceColorOld = (
            Array.isArray(spaceEvent) ? spaceEvent[0] : spaceEvent
          )?.getContent()?.color;
          spaceColor = spaceColorNew ?? spaceColorOld;
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

    const colorArray = data.nameColors;

    const validGlobalVal = isValidHex(data?.nameColor);
    const validGlobalValDark = isValidHex(colorArray?.on_dark) ?? isValidHex(data?.nameColorDark);
    const validGlobalValLight =
      isValidHex(colorArray?.on_light) ?? isValidHex(data?.nameColorLight);

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
    const rawHeroColor = data?.heroColorScheme?.color;
    const heroCardsAllowed = shouldApplyUserHeroCards(
      renderUserCardsMode,
      rawHeroBrightness,
      rawHeroColor
    );
    const validHeroColor = heroCardsAllowed ? isValidHex(rawHeroColor) : undefined;
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
