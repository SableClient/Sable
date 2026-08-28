import type { ChangeEvent, ChangeEventHandler, FormEventHandler } from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Text,
  IconButton,
  Scroll,
  Switch,
  Avatar,
  Input,
  config,
  Button,
  Spinner,
} from 'folds';
import { menuIcon, X } from '$components/icons/phosphor';
import { PageContent, SettingsSectionPage } from '$components/page';
import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useRoom } from '$hooks/useRoom';
import { usePowerLevels } from '$hooks/usePowerLevels';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useStateEvent } from '$hooks/useStateEvent';

import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { createLogger } from '$utils/debug';
import { UserAvatar } from '$components/user-avatar';
import { nameInitials } from '$utils/common';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import type { UserProfile } from '$hooks/useUserProfile';
import { useUserProfile } from '$hooks/useUserProfile';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import type { Room, RoomMember, StateEvents } from '$types/matrix-sdk';
import { Command, useCommands } from '$hooks/useCommands';
import { useCapabilities } from '$hooks/useCapabilities';
import { NameColorEditor } from '$features/settings/account/NameColorEditor';
import { PronounEditor } from '$features/settings/account/PronounEditor';
import type { PronounSet } from '$utils/pronouns';
import { EventTimeline, EventType } from '$types/matrix-sdk';
import { CustomStateEvent } from '$types/matrix/room';
import { AvatarUploadTile } from '$components/avatar-upload-tile/AvatarUploadTile';
import type { CustomRoomMemberEventContent } from '$unstable/CustomRoomMemberEventContent';
import * as prefix from '$unstable/prefixes';

const log = createLogger('Cosmetics');

// Members load lazily under sliding sync, so `room.getMember` can be null here.
const fallbackDisplayName = (userId: string): string => getMxIdLocalPart(userId) ?? userId;

type CosmeticsSettingProps = {
  profile: UserProfile;
  member: RoomMember | null;
  userId: string;
  room: Room;
};
function CosmeticsAvatar({ profile, member, userId, room }: CosmeticsSettingProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const capabilities = useCapabilities();
  const disableSetAvatar = capabilities['m.set_avatar_url']?.enabled === false;
  const memberStateEvent = useStateEvent(room, EventType.RoomMember, userId);
  const memberStateContent = memberStateEvent?.getContent<{ avatar_url?: string }>();
  const globalAvatarMxc = mx.getUser(userId)?.avatarUrl ?? profile.avatarUrl;
  const roomAvatarMxc = memberStateEvent
    ? memberStateContent?.avatar_url
    : member?.getMxcAvatarUrl();
  const avatarMxc = roomAvatarMxc ?? globalAvatarMxc;
  const hasRoomAvatarOverride =
    memberStateEvent !== undefined &&
    memberStateContent?.avatar_url !== undefined &&
    memberStateContent.avatar_url !== globalAvatarMxc;
  const avatarUrl =
    avatarMxc && (mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined);

  const myRoomAvatar = useCommands(mx, room)[Command.MyRoomAvatar];

  return (
    <AvatarUploadTile
      title="Room Avatar"
      disableSetAvatar={disableSetAvatar}
      removeDisabled={!hasRoomAvatarOverride}
      onUpload={(mxc) => myRoomAvatar.exe(mxc)}
      onRemove={() => myRoomAvatar.exe('')}
      confirmTitle="Remove Room Avatar"
      confirmDescription="Are you sure you want to remove room avatar?"
      after={
        <Avatar size="500" radii="300">
          <UserAvatar
            userId={userId}
            src={avatarUrl}
            renderFallback={() => (
              <Text size="H4">
                {nameInitials(member?.rawDisplayName ?? fallbackDisplayName(userId))}
              </Text>
            )}
          />
        </Avatar>
      }
    />
  );
}

function CosmeticsNickname({ profile, member, userId, room }: CosmeticsSettingProps) {
  const mx = useMatrixClient();

  const defaultDisplayName = member?.rawDisplayName ?? fallbackDisplayName(userId);
  const [displayName, setDisplayName] = useState<string>(defaultDisplayName);
  const hasChanges = displayName !== defaultDisplayName;

  const myRoomNick = useCommands(mx, room)[Command.MyRoomNick];
  const [changeState, changeDisplayName] = useAsyncCallback((name: string) => myRoomNick.exe(name));
  const changingDisplayName = changeState.status === AsyncStatus.Loading;

  useEffect(() => {
    setDisplayName(defaultDisplayName);
  }, [defaultDisplayName]);

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const name = evt.currentTarget.value;
    setDisplayName(name);
  };

  const handleReset = () => {
    if (hasChanges) {
      setDisplayName(defaultDisplayName);
    } else {
      setDisplayName(profile.displayName ?? getMxIdLocalPart(userId) ?? userId);
    }
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (changingDisplayName) return;

    const target = evt.target as HTMLFormElement | undefined;
    const displayNameInput = target?.displayNameInput as HTMLInputElement | undefined;
    const name = displayNameInput?.value;

    changeDisplayName(name ?? '');
  };

  return (
    <SettingTile title="Room Display Name">
      <Box direction="Column" grow="Yes" gap="100">
        <Box as="form" onSubmit={handleSubmit} gap="200">
          <Box grow="Yes" direction="Column">
            <Input
              name="displayNameInput"
              value={displayName}
              onChange={handleChange}
              variant="Secondary"
              radii="300"
              style={{ paddingRight: config.space.S200 }}
              readOnly={changingDisplayName}
              after={
                displayName !== (profile.displayName ?? getMxIdLocalPart(userId) ?? userId) &&
                !changingDisplayName && (
                  <IconButton
                    type="reset"
                    onClick={handleReset}
                    size="300"
                    radii="300"
                    variant="Secondary"
                  >
                    {menuIcon(X)}
                  </IconButton>
                )
              }
            />
          </Box>
          <Button
            size="400"
            variant={hasChanges ? 'Success' : 'Secondary'}
            fill={hasChanges ? 'Solid' : 'Soft'}
            outlined
            radii="300"
            disabled={!hasChanges || changingDisplayName}
            type="submit"
          >
            {changingDisplayName && <Spinner variant="Success" fill="Solid" size="300" />}
            <Text size="B400">Save</Text>
          </Button>
        </Box>
      </Box>
    </SettingTile>
  );
}

function CosmeticsFont({
  room,
  isSpace,
  font,
  disabled,
}: {
  room: Room;
  isSpace: boolean;
  font?: string;
  disabled: boolean;
}) {
  const mx = useMatrixClient();

  const initialFont = (/^"?(.*?)"?, var\(--font-secondary\)$/.exec(font ?? '') ?? [''])[1] ?? '';
  const [val, setVal] = useState(initialFont);

  useEffect(() => setVal(initialFont), [initialFont]);

  const fontCommand = useCommands(mx, room)[isSpace ? Command.SFont : Command.Font];
  const handleSave = () => {
    if (val === initialFont) return;
    fontCommand.exe(val);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setVal(e.currentTarget.value);
  };

  return (
    <SettingTile
      title={isSpace ? 'Space Font' : 'Room Font'}
      description="Use a custom font to render your display name"
      after={
        <Input
          value={val}
          size="300"
          radii="300"
          disabled={disabled}
          variant="Secondary"
          placeholder="Comic Sans"
          onChange={handleChange}
          onBlur={handleSave}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          style={{ width: '232px' }}
        />
      }
    />
  );
}

type CosmeticsProps = {
  requestBack?: () => void;
  requestClose: () => void;
};
export function Cosmetics({ requestBack, requestClose }: CosmeticsProps) {
  const mx = useMatrixClient();
  const userId = mx.getUserId()!;
  const profile = useUserProfile(userId);
  const room = useRoom();
  const roomProfile = useUserProfile(userId, room);
  const creators = useRoomCreators(room);
  const member = room.getMember(userId);
  const powerLevels = usePowerLevels(room);
  const isSpace = room.isSpaceRoom();

  const mEvent = room
    .getLiveTimeline()
    .getState(EventTimeline.FORWARDS)
    ?.getStateEvents(EventType.RoomMember, mx.getSafeUserId());

  const oldColorState = room.getLiveTimeline().getState(EventTimeline.FORWARDS);
  const oldColorEvent = oldColorState?.getStateEvents(CustomStateEvent.RoomCosmeticsColor, userId);
  const localColorOld = (
    Array.isArray(oldColorEvent) ? oldColorEvent[0] : oldColorEvent
  )?.getContent()?.color;
  const content = mEvent?.getContent<CustomRoomMemberEventContent>();
  const colorOnDark = content?.[prefix.MATRIX_UNSTABLE_COLORS]?.on_dark ?? localColorOld;
  const colorOnLight = content?.[prefix.MATRIX_UNSTABLE_COLORS]?.on_light ?? localColorOld;

  const permissions = useRoomPermissions(creators, powerLevels);
  const canEditPermissions = permissions.stateEvent(EventType.RoomPowerLevels, mx.getSafeUserId());

  const commands = useCommands(mx, room);

  const getLevel = (eventType: string) => (powerLevels.events ?? {})?.[eventType] ?? 50;

  const canHaveRoomPronouns = getLevel(CustomStateEvent.RoomCosmeticsPronouns) === 0;
  const canHaveRoomFont = getLevel(CustomStateEvent.RoomCosmeticsFont) === 0;

  const handleToggle = useCallback(
    async (eventType: string, enabled: boolean) => {
      const newLevel = enabled ? 0 : 50;
      const newContent = {
        ...powerLevels,
        events: {
          ...powerLevels.events,
          [eventType]: newLevel,
        },
      };

      try {
        await mx.sendStateEvent(
          room.roomId,
          EventType.RoomPowerLevels as keyof StateEvents,
          newContent,
          ''
        );
      } catch (e) {
        log.error(`Failed to update permissions for ${eventType}:`, e);
      }
    },
    [mx, room.roomId, powerLevels]
  );

  return (
    <SettingsSectionPage title="Cosmetics" requestBack={requestBack} requestClose={requestClose}>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <Box direction="Column" gap="100">
                <Text size="L400">Profile</Text>
                {!isSpace && (
                  <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="400"
                  >
                    <CosmeticsAvatar
                      profile={profile}
                      member={member}
                      userId={userId}
                      room={room}
                    />
                  </SequenceCard>
                )}
                {!isSpace && (
                  <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="400"
                  >
                    <CosmeticsNickname
                      profile={profile}
                      member={member}
                      userId={userId}
                      room={room}
                    />
                  </SequenceCard>
                )}
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <NameColorEditor
                    title={
                      isSpace
                        ? 'Space Dark theme Global Name Color'
                        : 'Room Dark theme Global Name Color'
                    }
                    current={colorOnDark}
                    description="Your name's color for a dark theme user."
                    onSave={(color) =>
                      commands[isSpace ? Command.SColor : Command.Color].exe(
                        color ? `dark ${color}` : 'dark reset'
                      )
                    }
                  />
                  <NameColorEditor
                    title={isSpace ? 'Space Light theme Name Color' : 'Room Light theme Name Color'}
                    current={colorOnLight}
                    description="Your name's color for a light theme user."
                    onSave={(color) =>
                      commands[isSpace ? Command.SColor : Command.Color].exe(
                        color ? `light ${color}` : 'light reset'
                      )
                    }
                  />
                </SequenceCard>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <PronounEditor
                    title={isSpace ? 'Space Pronouns' : 'Room Pronouns'}
                    current={roomProfile.resolvedPronouns as PronounSet[]}
                    disabled={!(canHaveRoomPronouns || canEditPermissions)}
                    onSave={(p) =>
                      commands[isSpace ? Command.SPronoun : Command.Pronoun].exe(
                        p
                          .map(({ language, summary }: PronounSet) =>
                            language ? `${language}:${summary}` : summary
                          )
                          .join()
                      )
                    }
                  />
                </SequenceCard>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <CosmeticsFont
                    room={room}
                    isSpace={isSpace}
                    font={roomProfile.resolvedFont}
                    disabled={!(canHaveRoomFont || canEditPermissions)}
                  />
                </SequenceCard>
              </Box>
              <Box direction="Column" gap="100">
                <Text size="L400">Settings</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                ></SequenceCard>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title={isSpace ? 'Space-Wide Pronouns' : 'Room Pronouns'}
                    description={`Allow everyone to set pronouns that apply in ${isSpace ? "all the space's rooms" : 'this room'}.`}
                    after={
                      <Switch
                        variant="Primary"
                        value={canHaveRoomPronouns}
                        onChange={(enabled) =>
                          handleToggle(CustomStateEvent.RoomCosmeticsPronouns, enabled)
                        }
                        disabled={!canEditPermissions}
                      />
                    }
                  />
                </SequenceCard>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title={isSpace ? 'Space-Wide Fonts' : 'Room Fonts'}
                    description={`Allow everyone to set a font that applies in ${isSpace ? "all the space's rooms" : 'this room'}.`}
                    after={
                      <Switch
                        variant="Primary"
                        value={canHaveRoomFont}
                        onChange={(enabled) =>
                          handleToggle(CustomStateEvent.RoomCosmeticsFont, enabled)
                        }
                        disabled={!canEditPermissions}
                      />
                    }
                  />
                </SequenceCard>
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
