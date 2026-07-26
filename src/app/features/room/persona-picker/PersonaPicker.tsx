import { composerIcon, User as UserIcon } from '$components/icons/phosphor';
import { UserAvatar } from '$components/user-avatar/UserAvatar.tsx';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication.ts';
import {
  getCurrentlyUsedPerMessageProfileForRoom,
  getAllPerMessageProfiles,
  type PerMessageProfile,
  setCurrentlyUsedPerMessageProfileIdForRoom,
} from '$hooks/usePerMessageProfile';
import { stopPropagation } from '$utils/keyboard';
import { mxcUrlToHttp } from '$utils/matrix.ts';
import { mobileOrTablet } from '$utils/user-agent';
import FocusTrap from 'focus-trap-react';
import { nameInitials } from '$utils/common';
import {
  Avatar,
  Box,
  config,
  IconButton,
  Input,
  Menu,
  MenuItem,
  PopOut,
  type RectCords,
  Scroll,
  Text,
  toRem,
} from 'folds';
import type { MatrixClient } from 'matrix-js-sdk';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import * as css from './PersonaPicker.css.ts';
import { useTranslation } from 'react-i18next';

type PersonaPickerProps = {
  mx: MatrixClient;
  roomId: string;
  suppressEditorRefocus: () => void;
};

export function PersonaPicker({ mx, roomId, suppressEditorRefocus }: PersonaPickerProps) {
  const useAuthentication = useMediaAuthentication();
  const [AddPersonaMenuAnchor, setAddPersonaMenuAnchor] = useState<RectCords>();
  const [profiles, setProfiles] = useState<PerMessageProfile[] | undefined>(undefined);
  const [selectedPersona, setSelectedPersona] = useState<PerMessageProfile | null>(null);
  const { t } = useTranslation(['settings/persona', 'general']);
  const isPickerMenuItemSelected = (persona: PerMessageProfile) =>
    persona.id === selectedPersona?.id ? true : undefined;

  const searchInputRef = useRef<HTMLInputElement>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [showPersonaPicker, setShowPersonaPicker] = useState(false);

  const [filteredProfiles, setFilteredProfiles] = useState<PerMessageProfile[] | undefined>(
    undefined
  );

  const clearFilterInput = () => {
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
    }
    setFilteredProfiles(profiles);
  };

  useEffect(() => {
    const syncProfile = async () => {
      const syncedProfile = await getCurrentlyUsedPerMessageProfileForRoom(mx, roomId);
      setSelectedPersona(syncedProfile ?? null);
    };
    syncProfile();
  }, [mx, roomId]);

  const fetchProfiles = async (mx_: MatrixClient) => {
    const fetchedProfiles = await getAllPerMessageProfiles(mx_);
    setProfiles(fetchedProfiles);
    setFilteredProfiles(fetchedProfiles);
  };

  useEffect(() => {
    fetchProfiles(mx);
  }, [mx]);

  const filter = (e: FormEvent) => {
    const term = (e.target as HTMLInputElement).value.toLocaleLowerCase();

    const filtered = term
      ? profiles?.filter((profile) =>
          searchInputRef.current
            ? profile.name.toLocaleLowerCase().includes(searchInputRef.current?.value) ||
              profile.id.toLocaleLowerCase().includes(searchInputRef.current?.value)
            : true
        )
      : profiles;

    setFilteredProfiles(filtered);
  };

  const avatarUrl = useCallback(
    (profile: PerMessageProfile) => {
      if (profile.avatarUrl !== undefined) {
        return mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined;
      } else {
        return undefined;
      }
    },
    [mx, useAuthentication]
  );

  return (
    <>
      <PopOut
        anchor={AddPersonaMenuAnchor}
        position="Top"
        align="Start"
        offset={5}
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onActivate: () => {
                // HACK: getAllPerMessageProfiles returns [] on Sable first load.
                // BUG: On the third render the list returns empty in testing.
                if (profiles?.length === 0) {
                  fetchProfiles(mx);
                }
              },
              onDeactivate: () => {
                setAddPersonaMenuAnchor(undefined);
                setShowPersonaPicker(false);
                clearFilterInput();
              },
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu>
              <Box direction="Column" gap="100" style={{ padding: config.space.S200 }}>
                <Text size="H6">{t('set_persona_for_this_room')}</Text>
                <Input
                  ref={searchInputRef}
                  variant="SurfaceVariant"
                  size="400"
                  placeholder={t('search', { ns: 'general' })}
                  maxLength={50}
                  autoFocus={!mobileOrTablet()}
                  onChange={filter}
                />

                <Scroll ref={scrollRef} size="400" style={{ maxHeight: '14rem' }}>
                  {filteredProfiles?.map((profile) => (
                    <MenuItem
                      key={profile.id}
                      size="400"
                      radii="300"
                      className={css.PersonaPickerMenuItem}
                      aria-selected={isPickerMenuItemSelected(profile)}
                      onClick={async () => {
                        const disabling = profile.id === selectedPersona?.id;

                        if (!disabling) {
                          setSelectedPersona(profile);
                          await setCurrentlyUsedPerMessageProfileIdForRoom(mx, roomId, profile.id);
                        } else {
                          setSelectedPersona(null);
                          await setCurrentlyUsedPerMessageProfileIdForRoom(
                            mx,
                            roomId,
                            undefined,
                            undefined,
                            true
                          );
                        }
                      }}
                      before={
                        <Avatar
                          size="300"
                          radii="400"
                          style={{
                            width: '2rem',
                            height: '2rem',
                          }}
                          aria-label={t('profile_avatar')}
                        >
                          <UserAvatar
                            userId={profile.id}
                            src={avatarUrl(profile)}
                            renderFallback={() => (
                              <Text as="span" size="H4" aria-label="Avatar fallback">
                                {nameInitials(profile.name)}
                              </Text>
                            )}
                            alt={t('avatar_for', { profileId: profile.id })}
                          />
                        </Avatar>
                      }
                    >
                      <Text truncate style={{ maxWidth: toRem(150) }}>
                        {profile.name}
                      </Text>
                    </MenuItem>
                  ))}
                </Scroll>
              </Box>
            </Menu>
          </FocusTrap>
        }
      />
      {
        <IconButton
          aria-pressed={showPersonaPicker}
          onClick={(evt) => {
            setShowPersonaPicker(true);
            setAddPersonaMenuAnchor(evt.currentTarget.getBoundingClientRect());
          }}
          onPointerDown={suppressEditorRefocus}
          variant="SurfaceVariant"
          size="300"
          style={{ backgroundColor: 'transparent' }}
          title={t('switch_persona')}
          aria-label={t('switch_persona')}
        >
          {selectedPersona ? (
            <Avatar
              size="200"
              radii="300"
              className={
                showPersonaPicker
                  ? css.SelectedPersonaPickerButtonAvatar
                  : css.PersonaPickerButtonAvatar
              }
              aria-label={t('profile_avatar')}
            >
              <UserAvatar
                className={css.PersonaPickerButtonAvatarImage}
                userId={selectedPersona.id}
                src={avatarUrl(selectedPersona)}
                renderFallback={() => (
                  <Text as="span" size="H6" aria-label={t('avatar_fallback')}>
                    {nameInitials(selectedPersona.name)}
                  </Text>
                )}
                alt={t('avatar_for', { profileId: selectedPersona.id })}
              />
            </Avatar>
          ) : (
            composerIcon(UserIcon, { weight: showPersonaPicker ? 'fill' : 'regular' })
          )}
        </IconButton>
      }
    </>
  );
}
