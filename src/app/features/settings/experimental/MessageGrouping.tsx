import { Box, Text, config } from 'folds';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { SequenceCardStyle } from '$features/common-settings/styles.css';
import { SettingTile } from '$components/setting-tile';
import { SequenceCard } from '$components/sequence-card';

const THRESHOLD_OPTIONS: { value: number; label: string }[] = [
  { value: 2, label: '2 min (default)' },
  { value: 5, label: '5 min' },
  { value: 15, label: '15 min (Discord-style)' },
  { value: 30, label: '30 min' },
  { value: 60, label: '60 min' },
];

export function MessageGrouping() {
  const [threshold, setThreshold] = useSetting(settingsAtom, 'messageGroupingThreshold');

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Message Grouping</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Group consecutive messages"
          focusId="message-grouping-threshold"
          description="Hide the sender header when the same person sends multiple messages within the chosen time window. Longer windows mean more messages are grouped together."
          after={
            <select
              id="message-grouping-threshold"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              style={{
                background: 'var(--bg-surface)',
                color: 'var(--tc-surface-high)',
                border: '1px solid var(--bg-surface-border)',
                borderRadius: config.radii.R300,
                padding: `${config.space.S100} ${config.space.S200}`,
                fontSize: config.fontSize.T300,
                cursor: 'pointer',
              }}
            >
              {THRESHOLD_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          }
        />
      </SequenceCard>
    </Box>
  );
}
