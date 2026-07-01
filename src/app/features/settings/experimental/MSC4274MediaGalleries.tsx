import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Box, Switch, Text } from 'folds';
import { SequenceCardStyle } from '../styles.css';

export function MSC4274MediaGalleries() {
  const [enabledMediaGalleries, setEnabledMediaGalleries] = useSetting(
    settingsAtom,
    'enableMediaGalleries'
  );

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Enable Media Galleries Support</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="100"
      >
        <SettingTile
          title="Enable Media Galleries"
          focusId="media-galleries"
          description="If enabled, multiple attachments will be sent in one message, as per MSC4274. Incompatible with clients that don't implement it."
          after={
            <Switch
              variant="Primary"
              value={enabledMediaGalleries}
              onChange={setEnabledMediaGalleries}
              title={enabledMediaGalleries ? 'Disable Media Galleries' : 'Enable Media Galleries'}
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}
