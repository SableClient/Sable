import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
  color,
  config,
} from 'folds';
import { stopPropagation } from '$utils/keyboard';
import { t } from 'i18next';

type DirectInvitePromptProps = {
  onCancel: () => void;
  onInviteDirect: () => void;
  onConvertAndInvite: () => void;
  converting: boolean;
  convertError?: string;
};

export function DirectInvitePrompt({
  onCancel,
  onInviteDirect,
  onConvertAndInvite,
  converting,
  convertError,
}: DirectInvitePromptProps) {
  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: onCancel,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface">
            <Header
              style={{
                padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                borderBottomWidth: config.borderWidth.B300,
              }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">{t('Room.DirectInvite.invite_another_member')}</Text>
              </Box>
              <IconButton size="300" onClick={onCancel} radii="300">
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
              <Box direction="Column" gap="200">
                <Text size="T300">
                  {t('Room.DirectInvite.this_is_a')} <b>{t('Room.DirectInvite.direct_message')}</b> {t('Room.DirectInvite.room_intended_for_a_conversation_between_two_persons_would_you_like_to_conv')} <b>{t('Room.DirectInvite.group_chat')}</b> {t('Room.DirectInvite.before_continuing')}
                </Text>
                {convertError && (
                  <Text style={{ color: color.Critical.Main }} size="T300">
                    {t('Room.DirectInvite.failed_to_convert_direct_message_to_room')} {convertError}
                  </Text>
                )}
              </Box>
              <Box direction="Column" gap="200">
                <Button
                  variant="Primary"
                  onClick={onConvertAndInvite}
                  disabled={converting}
                  before={
                    converting ? <Spinner fill="Solid" variant="Primary" size="200" /> : undefined
                  }
                  aria-disabled={converting}
                >
                  <Text size="B400">
                    {converting ? 'Converting...' : t('Room.DirectInvite.convert_to_group_chat_and_invite')}
                  </Text>
                </Button>
                <Button
                  variant="Warning"
                  fill="Soft"
                  onClick={onInviteDirect}
                  disabled={converting}
                >
                  <Text size="B400">{t('Room.DirectInvite.invite_to_direct_message_anyway')}</Text>
                </Button>
                <Button variant="Secondary" fill="Soft" onClick={onCancel} disabled={converting}>
                  <Text size="B400">{t('General.cancel')}</Text>
                </Button>
              </Box>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
