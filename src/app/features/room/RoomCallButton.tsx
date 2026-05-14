import type { MouseEventHandler } from 'react';
import { useState } from 'react';
import FocusTrap from 'focus-trap-react';
import type { RectCords } from 'folds';
import {
  Box,
  IconButton,
  Icon,
  Icons,
  TooltipProvider,
  Tooltip,
  Text,
  PopOut,
  Menu,
  MenuItem,
  config,
} from 'folds';
import { useAtomValue } from 'jotai';
import type { Room } from '$types/matrix-sdk';
import { useCallStart, useCallJoined } from '$hooks/useCallEmbed';
import type { CallPreferences } from '$state/callPreferences';
import { callEmbedAtom } from '$state/callEmbed';
import { stopPropagation } from '$utils/keyboard';

interface RoomCallButtonProps {
  room: Room;
  direct: boolean;
  defaultPreferences: CallPreferences;
  allowVideoStart?: boolean;
}

type CallStartMenuProps = {
  onVoiceCall: () => void;
  onVideoCall: () => void;
  requestClose: () => void;
  allowVideoStart: boolean;
};

function CallStartMenu({
  onVoiceCall,
  onVideoCall,
  requestClose,
  allowVideoStart,
}: CallStartMenuProps) {
  return (
    <Menu style={{ minWidth: '150px', padding: config.space.S100 }}>
      <Box direction="Column" gap="100">
        <MenuItem onClick={onVoiceCall} size="300" radii="300">
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Voice Call
          </Text>
        </MenuItem>
        {allowVideoStart && (
          <MenuItem onClick={onVideoCall} size="300" radii="300">
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Video Call
            </Text>
          </MenuItem>
        )}
        <MenuItem onClick={requestClose} size="300" radii="300">
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Cancel
          </Text>
        </MenuItem>
      </Box>
    </Menu>
  );
}

export function RoomCallButton({
  room,
  direct,
  defaultPreferences,
  allowVideoStart = true,
}: RoomCallButtonProps) {
  const startCall = useCallStart(direct);
  const callEmbed = useAtomValue(callEmbedAtom);
  const joined = useCallJoined(callEmbed);
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const isJoinedInThisRoom = joined && callEmbed?.roomId === room.roomId;
  const callStartingInThisRoom = !!callEmbed && callEmbed.roomId === room.roomId && !joined;
  const inAnotherCall = !!callEmbed && callEmbed.roomId !== room.roomId;
  const startDisabled = inAnotherCall || callStartingInThisRoom;

  if (isJoinedInThisRoom) return null;

  const startVoiceCall = () => {
    startCall(room, {
      microphone: defaultPreferences.microphone,
      video: false,
      sound: defaultPreferences.sound,
    });
    setMenuAnchor(undefined);
  };

  const startVideoCall = () => {
    startCall(room, {
      microphone: defaultPreferences.microphone,
      video: true,
      sound: defaultPreferences.sound,
    });
    setMenuAnchor(undefined);
  };

  const startDefaultCall = () => {
    const resolvedVideo = allowVideoStart ? defaultPreferences.video : false;
    startCall(room, {
      microphone: defaultPreferences.microphone,
      video: resolvedVideo,
      sound: defaultPreferences.sound,
    });
  };

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  return (
    <>
      <TooltipProvider
        position="Bottom"
        offset={4}
        tooltip={
          <Tooltip>
            {inAnotherCall ? (
              <Text>Already in another call</Text>
            ) : callStartingInThisRoom ? (
              <Text>Call is starting</Text>
            ) : (
              <Text>Start Call</Text>
            )}
          </Tooltip>
        }
      >
        {(triggerRef) => (
          <IconButton
            fill="None"
            ref={triggerRef}
            onClick={handleOpenMenu}
            onContextMenu={(evt) => {
              evt.preventDefault();
              if (startDisabled) return;
              startDefaultCall();
            }}
            disabled={startDisabled}
            aria-label="Start Call"
            aria-pressed={!!menuAnchor}
          >
            <Icon size="400" src={Icons.VideoCamera} filled={!!menuAnchor} />
          </IconButton>
        )}
      </TooltipProvider>
      <PopOut
        anchor={menuAnchor}
        position="Bottom"
        align="Center"
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              returnFocusOnDeactivate: false,
              onDeactivate: () => setMenuAnchor(undefined),
              clickOutsideDeactivates: true,
              isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
              isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
              escapeDeactivates: stopPropagation,
            }}
          >
            <CallStartMenu
              onVoiceCall={startVoiceCall}
              onVideoCall={startVideoCall}
              requestClose={() => setMenuAnchor(undefined)}
              allowVideoStart={allowVideoStart}
            />
          </FocusTrap>
        }
      />
    </>
  );
}
