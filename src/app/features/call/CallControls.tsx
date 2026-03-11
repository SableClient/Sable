import { MouseEventHandler, useCallback, useRef, useState } from 'react';
import {
  Box,
  Button,
  config,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Spinner,
  Text,
  toRem,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { SequenceCard } from '../../components/sequence-card';
import * as css from './styles.css';
import {
  ChatButton,
  ControlDivider,
  MicrophoneButton,
  ScreenShareButton,
  SoundButton,
  VideoButton,
} from './Controls';
import { CallEmbed, useCallControlState } from '../../plugins/call';
import { stopPropagation } from '../../utils/keyboard';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { useRoom } from '../../hooks/useRoom';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';

type CallControlsProps = {
  callEmbed: CallEmbed;
};
export function CallControls({ callEmbed }: CallControlsProps) {
  const room = useRoom();
  const controlRef = useRef<HTMLDivElement>(null);

  const screenSize = useScreenSizeContext();
  const compact = screenSize === ScreenSize.Mobile;

  const { microphone, video, sound, screenshare, spotlight } = useCallControlState(
    callEmbed.control
  );

  const [cords, setCords] = useState<RectCords>();

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSpotlightClick = () => {
    callEmbed.control.toggleSpotlight();
    setCords(undefined);
  };

  const handleReactionsClick = () => {
    callEmbed.control.toggleReactions();
    setCords(undefined);
  };

  const handleSettingsClick = () => {
    callEmbed.control.toggleSettings();
    setCords(undefined);
  };

  const [hangupState, hangup] = useAsyncCallback(
    useCallback(() => callEmbed.hangup(), [callEmbed])
  );
  const exiting =
    hangupState.status === AsyncStatus.Loading || hangupState.status === AsyncStatus.Success;

  return (
    <Box
      ref={controlRef}
      className={css.CallControlContainer}
      justifyContent="Center"
      alignItems="Center"
      style={{
        maxWidth: '100%',
        padding: compact ? `0 ${toRem(8)}` : undefined,
        overflowX: 'auto',
      }}
    >
      <SequenceCard
        className={css.ControlCard}
        variant="SurfaceVariant"
        gap={compact ? '100' : '200'}
        radii="500"
        alignItems="Center"
        justifyContent="Center"
        direction="Row"
      >
        <Box
          shrink="No"
          alignItems="Center"
          justifyContent="Center"
          gap={compact ? '100' : '200'}
          direction="Row"
        >
          <MicrophoneButton
            enabled={microphone}
            onToggle={() => callEmbed.control.toggleMicrophone()}
          />
          <SoundButton enabled={sound} onToggle={() => callEmbed.control.toggleSound()} />
        </Box>

        {!compact && <ControlDivider />}

        <Box
          shrink="No"
          alignItems="Center"
          justifyContent="Center"
          gap={compact ? '100' : '200'}
          direction="Row"
        >
          <VideoButton enabled={video} onToggle={() => callEmbed.control.toggleVideo()} />
          <ScreenShareButton
            enabled={screenshare}
            onToggle={() => callEmbed.control.toggleScreenshare()}
          />
        </Box>
        {!compact && <ControlDivider />}
        <Box
          shrink="No"
          alignItems="Center"
          justifyContent="Center"
          gap={compact ? '100' : '200'}
          direction="Row"
        >
          {room?.isCallRoom() && <ChatButton />}

          <PopOut
            anchor={cords}
            position="Top"
            align="Center"
            content={
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  onDeactivate: () => setCords(undefined),
                  clickOutsideDeactivates: true,
                  isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                  isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                  escapeDeactivates: stopPropagation,
                }}
              >
                <Menu>
                  <Box direction="Column" style={{ padding: config.space.S100 }}>
                    <MenuItem
                      size="300"
                      variant="Surface"
                      radii="300"
                      onClick={handleSpotlightClick}
                    >
                      <Text size="B300" truncate>
                        {spotlight ? 'Grid View' : 'Spotlight View'}
                      </Text>
                    </MenuItem>
                    <MenuItem
                      size="300"
                      variant="Surface"
                      radii="300"
                      onClick={handleReactionsClick}
                    >
                      <Text size="B300" truncate>
                        Reactions
                      </Text>
                    </MenuItem>
                    <MenuItem
                      size="300"
                      variant="Surface"
                      radii="300"
                      onClick={handleSettingsClick}
                    >
                      <Text size="B300" truncate>
                        Settings
                      </Text>
                    </MenuItem>
                  </Box>
                </Menu>
              </FocusTrap>
            }
          >
            <IconButton
              variant="Surface"
              fill="Soft"
              radii="400"
              size="400"
              onClick={handleOpenMenu}
              outlined
              aria-pressed={!!cords}
            >
              <Icon size="400" src={Icons.VerticalDots} />
            </IconButton>
          </PopOut>

          <Button
            style={{ minWidth: compact ? toRem(48) : toRem(88), padding: compact ? 0 : undefined }}
            variant="Critical"
            fill="Solid"
            onClick={hangup}
            before={
              exiting ? (
                <Spinner variant="Critical" fill="Solid" size="200" />
              ) : (
                <Icon src={Icons.PhoneDown} size="200" filled />
              )
            }
            disabled={exiting}
          >
            {!compact && <Text size="B400">End</Text>}
          </Button>
        </Box>
      </SequenceCard>
    </Box>
  );
}
