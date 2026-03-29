import { useMemo } from 'react';
import { Box, Text, color } from 'folds';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useClientConfig, selectExperimentVariant } from '$hooks/useClientConfig';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { SequenceCardStyle } from '$features/settings/styles.css';

export function ExperimentsPanel() {
  const mx = useMatrixClient();
  const config = useClientConfig();
  const userId = mx.getUserId() ?? undefined;

  const experiments = useMemo(() => {
    if (!config.experiments) return [];
    return Object.entries(config.experiments).map(([key, experimentConfig]) => ({
      key,
      config: experimentConfig,
      selection: selectExperimentVariant(key, experimentConfig, userId),
    }));
  }, [config.experiments, userId]);

  if (experiments.length === 0) {
    return (
      <Box direction="Column" gap="100">
        <Text size="L400">Features & Experiments</Text>
        <Text size="T200" style={{ color: color.Secondary.Main }}>
          No experiments configured
        </Text>
      </Box>
    );
  }

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Features & Experiments</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        {experiments.map(({ key, config: experimentConfig, selection }) => (
          <SettingTile key={key} title={key}>
            <Box direction="Column" gap="200">
              <Box direction="Row" gap="300">
                <Text size="T200">
                  <strong>Enabled:</strong>
                </Text>
                <Text
                  size="T200"
                  style={{
                    color: selection.enabled ? color.Success.Main : color.Secondary.Main,
                  }}
                >
                  {selection.enabled ? 'Yes' : 'No'}
                </Text>
              </Box>
              {selection.enabled && (
                <>
                  <Box direction="Row" gap="300">
                    <Text size="T200">
                      <strong>Rollout:</strong>
                    </Text>
                    <Text size="T200">{selection.rolloutPercentage}%</Text>
                  </Box>
                  <Box direction="Row" gap="300">
                    <Text size="T200">
                      <strong>Your Variant:</strong>
                    </Text>
                    <Text
                      size="T200"
                      style={{
                        color: selection.inExperiment ? color.Success.Main : color.Secondary.Main,
                      }}
                    >
                      {selection.variant}
                      {selection.inExperiment && ' (in experiment)'}
                      {!selection.inExperiment && ' (control)'}
                    </Text>
                  </Box>
                  {experimentConfig.variants && experimentConfig.variants.length > 0 && (
                    <Box direction="Row" gap="300">
                      <Text size="T200">
                        <strong>Treatment Variants:</strong>
                      </Text>
                      <Text size="T200">
                        {experimentConfig.variants
                          .filter((v) => v !== experimentConfig.controlVariant)
                          .join(', ')}
                      </Text>
                    </Box>
                  )}
                </>
              )}
            </Box>
          </SettingTile>
        ))}
      </SequenceCard>
    </Box>
  );
}
