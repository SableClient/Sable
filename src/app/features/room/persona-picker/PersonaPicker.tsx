import {
  composerIcon,
  MagnifyingGlass,
  menuIcon,
  User as UserIcon,
} from '$components/icons/phosphor';
import { ResponsiveMenu } from '$components/ResponsiveMenu';
import { UserAvatar } from '$components/user-avatar/UserAvatar.tsx';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication.ts';
import type { PerMessageProfileMsc4461 } from '$app/persona';
import { ProfileCatalog } from '$app/persona/catalog';
import { mxcUrlToHttp } from '$utils/matrix.ts';
import { isMobileOrTablet } from '$utils/platform';
import { nameInitials } from '$utils/common';
import {
  Avatar,
  Box,
  config,
  IconButton,
  Input,
  Menu,
  MenuItem,
  type RectCords,
  Scroll,
  Text,
  toRem,
  Badge,
  color,
} from 'folds';
import type { MatrixClient } from 'matrix-js-sdk';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MutableRefObject,
} from 'react';
import * as css from './PersonaPicker.css.ts';
import { InfoCard } from '$components/info-card/InfoCard.tsx';
import { InfoIcon } from '@phosphor-icons/react';
import { ThemeKind, useActiveTheme } from '$hooks/useTheme.ts';

const pillStyles = {
  cursor: 'pointer',
} as const;

export enum PersonaPickerTab {
  Global = 'Global',
  PerRoom = 'PerRoom',
}

export enum PersonaPickerPresentation {
  TemporarySelectorMenu = 'TemporarySelectorMenu',
  PersistentPicker = 'PersistentPicker',
}

type PersonaPickerProps = {
  tab?: PersonaPickerTab;
  mx: MatrixClient;
  roomId?: string;
  suppressEditorRefocus?: () => void;
  onTabChange?: (tab: PersonaPickerTab) => void;
  latchedPersona?: PerMessageProfileMsc4461;
  onPersonaSelect?: (persona: PerMessageProfileMsc4461 | undefined) => void | Promise<void>;
  requestClose?: () => void;
  showNoneOption?: boolean;
  hideButton?: boolean;
  hideTabs?: boolean;
  anchor?: RectCords;
};

export function TemporaryPersonaPicker(props: PersonaPickerProps) {
  return (
    <PersonaPickerMenu {...props} presentation={PersonaPickerPresentation.TemporarySelectorMenu} />
  );
}

export function PersistentPersonaPicker(props: PersonaPickerProps) {
  return <PersonaPickerMenu {...props} presentation={PersonaPickerPresentation.PersistentPicker} />;
}

function PersonaPickerMenu({
  tab: tabProp = PersonaPickerTab.Global,
  mx,
  roomId,
  suppressEditorRefocus,
  onTabChange,
  latchedPersona,
  onPersonaSelect,
  anchor,
  requestClose,
}: PersonaPickerProps & { presentation: PersonaPickerPresentation }) {
  const useAuthentication = useMediaAuthentication();
  const [tab, setTab] = useState(tabProp);
  const activeTheme = useActiveTheme();
  const [AddPersonaMenuAnchor, setAddPersonaMenuAnchor] = useState<RectCords | undefined>(anchor);
  const [profiles, setProfiles] = useState<PerMessageProfileMsc4461[] | undefined>(undefined);
  const [selectedGlobalPersona, setSelectedGlobalPersona] =
    useState<PerMessageProfileMsc4461 | null>(null);
  const [selectedRoomPersona, setSelectedRoomPersona] = useState<PerMessageProfileMsc4461 | null>(
    latchedPersona ?? null
  );
  const mountedRef = useRef(false);
  const profileFetchGenerationRef = useRef(0);
  // Bumped on each click so an in-flight sync cannot undo a fresher choice. Global and
  // per-room selections are independent, so one must not invalidate the other's rollback.
  const globalSelectionRef = useRef(0);
  const roomSelectionRef = useRef(0);
  const isPickerMenuItemSelected = (persona: PerMessageProfileMsc4461) => {
    const selectedPersona =
      tab === PersonaPickerTab.Global ? selectedGlobalPersona : selectedRoomPersona;
    return persona.id === selectedPersona?.id ? true : undefined;
  };

  const nameColor = useCallback(
    (persona: PerMessageProfileMsc4461) =>
      activeTheme.kind === ThemeKind.Dark
        ? persona['eu.she-a.color']?.on_dark
        : persona['eu.she-a.color']?.on_light,
    [activeTheme]
  );

  const defactoPersona = () => selectedRoomPersona ?? selectedGlobalPersona;

  const searchInputRef = useRef<HTMLInputElement>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [filteredProfiles, setFilteredProfiles] = useState<PerMessageProfileMsc4461[] | undefined>(
    undefined
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      profileFetchGenerationRef.current += 1;
    };
  }, []);

  const clearFilterInput = () => {
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
    }
    setFilteredProfiles(profiles);
  };

  useEffect(() => {
    let cancelled = false;

    const syncProfile = async (
      generationRef: MutableRefObject<number>,
      load: () => Promise<PerMessageProfileMsc4461 | undefined>,
      apply: (profile: PerMessageProfileMsc4461 | null) => void
    ) => {
      const generation = generationRef.current;
      try {
        const synced = await load();
        if (!cancelled && generation === generationRef.current) apply(synced ?? null);
      } catch {
        // Profile synchronization is best effort; retain the current selection on failure.
      }
    };

    void syncProfile(
      roomSelectionRef,
      () =>
        roomId
          ? new ProfileCatalog(mx).getSelection({ roomId }).then((selection) => selection?.persona)
          : Promise.resolve(undefined),
      // A latched persona already reflects the user's intent, so don't overwrite it.
      (profile) => {
        if (!selectedRoomPersona) setSelectedRoomPersona(profile);
      }
    );
    void syncProfile(
      globalSelectionRef,
      () => new ProfileCatalog(mx).getSelection('account').then((selection) => selection?.persona),
      setSelectedGlobalPersona
    );

    return () => {
      cancelled = true;
    };
  }, [mx, roomId, latchedPersona, selectedRoomPersona]);

  const fetchProfiles = useCallback(async (mx_: MatrixClient) => {
    const fetchGeneration = ++profileFetchGenerationRef.current;
    try {
      const fetchedProfiles = await new ProfileCatalog(mx_).list();
      if (!mountedRef.current || fetchGeneration !== profileFetchGenerationRef.current) {
        return;
      }
      setProfiles(fetchedProfiles);
      setFilteredProfiles(fetchedProfiles);
    } catch {
      // Profile loading is best effort; keep the existing list when it fails.
    }
  }, []);

  useEffect(() => {
    void fetchProfiles(mx);
    return () => {
      profileFetchGenerationRef.current += 1;
    };
  }, [fetchProfiles, mx]);

  const filter = useCallback(
    (e: FormEvent) => {
      const term = (e.target as HTMLInputElement).value.toLocaleLowerCase();

      const filtered = term
        ? profiles?.filter((profile) =>
            searchInputRef.current
              ? profile.displayname.toLocaleLowerCase().includes(searchInputRef.current?.value) ||
                profile.id.toLocaleLowerCase().includes(searchInputRef.current?.value)
              : true
          )
        : profiles;

      setFilteredProfiles(filtered);
    },
    [profiles]
  );

  const avatarUrl = useCallback(
    (profile: PerMessageProfileMsc4461) => {
      if (profile.avatar_url !== undefined) {
        return mxcUrlToHttp(mx, profile.avatar_url, useAuthentication, 96, 96, 'crop') ?? undefined;
      } else {
        return undefined;
      }
    },
    [mx, useAuthentication]
  );

  return (
    <ResponsiveMenu
      anchor={AddPersonaMenuAnchor}
      position="Top"
      align="Start"
      offset={16}
      alignOffset={-44}
      requestClose={() => {
        setAddPersonaMenuAnchor(undefined);
        clearFilterInput();
      }}
      menu={
        <Menu>
          <Box
            direction="Column"
            gap="100"
            style={{ padding: config.space.S200, minWidth: '18rem' }}
          >
            <Box gap="100">
              <Badge
                style={pillStyles}
                as="button"
                variant="Secondary"
                fill={tab == PersonaPickerTab.Global ? 'Solid' : 'None'}
                size="500"
                onClick={() => {
                  setTab(PersonaPickerTab.Global);
                  onTabChange?.(PersonaPickerTab.Global);
                }}
              >
                <Text as="span" size="L400">
                  Global
                </Text>
              </Badge>
              <Badge
                style={pillStyles}
                as="button"
                variant="Secondary"
                fill={tab == PersonaPickerTab.PerRoom ? 'Solid' : 'None'}
                size="500"
                onClick={() => {
                  setTab(PersonaPickerTab.PerRoom);
                  onTabChange?.(PersonaPickerTab.PerRoom);
                }}
              >
                <Text as="span" size="L400">
                  Per-room
                </Text>
              </Badge>
            </Box>

            <>
              <Input
                ref={searchInputRef}
                variant="SurfaceVariant"
                size="400"
                placeholder="Search"
                maxLength={50}
                autoFocus={!isMobileOrTablet()}
                onChange={filter}
                before={menuIcon(MagnifyingGlass)}
              />

              <Scroll hideTrack ref={scrollRef} size="400" style={{ maxHeight: '10rem' }}>
                {filteredProfiles?.map((profile) => (
                  <MenuItem
                    key={profile.id}
                    size="400"
                    radii="300"
                    className={css.PersonaPickerMenuItem}
                    aria-selected={isPickerMenuItemSelected(profile)}
                    onClick={async () => {
                      if (onPersonaSelect) {
                        await onPersonaSelect(profile);
                        requestClose?.();
                        return;
                      }
                      const isGlobal = tab === PersonaPickerTab.Global;
                      const previousPersona = isGlobal
                        ? selectedGlobalPersona
                        : selectedRoomPersona;
                      const disabling = profile.id === previousPersona?.id;
                      const setPersona = isGlobal
                        ? setSelectedGlobalPersona
                        : setSelectedRoomPersona;
                      const generationRef = isGlobal ? globalSelectionRef : roomSelectionRef;
                      const selectionGeneration = ++generationRef.current;

                      setPersona(disabling ? null : profile);

                      try {
                        await new ProfileCatalog(mx).setSelection(
                          isGlobal ? 'account' : { roomId: roomId! },
                          disabling ? undefined : profile.id,
                          undefined,
                          disabling
                        );
                      } catch {
                        if (mountedRef.current && selectionGeneration === generationRef.current) {
                          setPersona(previousPersona);
                        }
                      }
                    }}
                    before={
                      <Avatar
                        size="300"
                        radii="400"
                        style={{
                          width: 28,
                          height: 28,
                          marginLeft: -6,
                        }}
                        aria-label="Profile avatar"
                      >
                        <UserAvatar
                          userId={profile.id}
                          src={avatarUrl(profile)}
                          fallbackColor={profile['eu.she-a.color']?.on_light ?? undefined}
                          renderFallback={() => (
                            <Text as="span" size="H4" aria-label="Avatar fallback">
                              {nameInitials(profile.displayname)}
                            </Text>
                          )}
                          alt={`Avatar for profile ${profile.id}`}
                        />
                      </Avatar>
                    }
                  >
                    <Box direction="Column">
                      <Text
                        truncate
                        style={{ color: nameColor(profile) ?? undefined, maxWidth: toRem(150) }}
                      >
                        {profile.displayname}
                      </Text>
                      <Text
                        truncate
                        size="T200"
                        style={{
                          color: `color-mix(${color.Surface.OnContainer}, transparent 20%)`,
                          maxWidth: toRem(150),
                        }}
                      >
                        {profile.id}
                      </Text>
                    </Box>
                  </MenuItem>
                ))}
              </Scroll>
              <InfoCard
                before={menuIcon(InfoIcon, { weight: 'fill' })}
                variant="Primary"
                description={
                  selectedRoomPersona ? (
                    <>
                      Message will use your <em>per-room</em> persona.
                    </>
                  ) : selectedGlobalPersona ? (
                    <>
                      Message will use your <em>global</em> persona.
                    </>
                  ) : (
                    <>No persona chosen.</>
                  )
                }
              />
            </>
          </Box>
        </Menu>
      }
    >
      <IconButton
        aria-pressed={!!AddPersonaMenuAnchor}
        onClick={(evt) => {
          setAddPersonaMenuAnchor(evt.currentTarget.getBoundingClientRect());
        }}
        onPointerDown={suppressEditorRefocus}
        variant="SurfaceVariant"
        size="300"
        style={{ backgroundColor: 'transparent' }}
        title="Switch persona"
        aria-label="Switch persona"
      >
        {(selectedRoomPersona ?? selectedGlobalPersona) ? (
          <Avatar
            size="200"
            radii="300"
            className={
              AddPersonaMenuAnchor
                ? css.SelectedPersonaPickerButtonAvatar
                : css.PersonaPickerButtonAvatar
            }
            aria-label="Profile avatar"
          >
            <UserAvatar
              className={css.PersonaPickerButtonAvatarImage}
              userId={defactoPersona()!.id}
              src={avatarUrl(defactoPersona()!)}
              renderFallback={() => (
                <Text as="span" size="H6" aria-label="Avatar fallback">
                  {nameInitials(defactoPersona()!.displayname)}
                </Text>
              )}
              alt={`Avatar for profile ${defactoPersona()!.id}`}
            />
          </Avatar>
        ) : (
          composerIcon(UserIcon, { weight: AddPersonaMenuAnchor ? 'fill' : 'regular' })
        )}
      </IconButton>
    </ResponsiveMenu>
  );
}
