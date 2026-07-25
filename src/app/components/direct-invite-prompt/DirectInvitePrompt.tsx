import { Box, Button, Text, color, config } from 'folds';
import { PromptDialog } from '$components/modal-overlay/PromptDialog';
import { AsyncButton } from '$components/AsyncButton';

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
    <PromptDialog title="Invite another Member" requestClose={onCancel}>
      <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
        <Box direction="Column" gap="200">
          <Text size="T300">
            This is a <b>Direct Message</b> room, intended for a conversation between two persons.
            Would you like to convert it into a <b>group chat</b> before continuing?
          </Text>
          {convertError && (
            <Text style={{ color: color.Critical.Main }} size="T300">
              Failed to convert direct message to room! {convertError}
            </Text>
          )}
        </Box>
        <Box direction="Column" gap="200">
          <AsyncButton
            variant="Primary"
            onClick={onConvertAndInvite}
            loading={converting}
            spinnerVariant="Primary"
            spinnerSize="200"
            aria-disabled={converting}
          >
            <Text size="B400">
              {converting ? 'Converting...' : 'Convert to Group Chat and Invite'}
            </Text>
          </AsyncButton>
          <Button variant="Warning" fill="Soft" onClick={onInviteDirect} disabled={converting}>
            <Text size="B400">Invite to Direct Message anyway</Text>
          </Button>
          <Button variant="Secondary" fill="Soft" onClick={onCancel} disabled={converting}>
            <Text size="B400">Cancel</Text>
          </Button>
        </Box>
      </Box>
    </PromptDialog>
  );
}
