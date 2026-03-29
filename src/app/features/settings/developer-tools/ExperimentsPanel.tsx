import { useState, useCallback } from 'react';
import { Box, Text, Switch, Button } from 'folds';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { useClientConfig, setExperimentOverride } from '$hooks/useClientConfig';

const EXPERIMENT_OVERRIDE_PREFIX = 'sable_exp_';

function getActiveExperimentKeys(configExperiments?: Record<string, boolean>): string[] {
  const fromConfig = Object.keys(configExperiments ?? {});
  const fromBuild = Object.keys(INJECTED_EXPERIMENT_FLAGS);
  const fromStorage = Object.keys(localStorage)
    .filter((k) => k.startsWith(EXPERIMENT_OVERRIDE_PREFIX))
    .map((k) => k.slice(EXPERIMENT_OVERRIDE_PREFIX.length));

  return Array.from(new Set([...fromConfig, ...fromBuild, ...fromStorage])).toSorted();
}

function getEffectiveValue(
  key: string,
  configExperiments?: Record<string, boolean>
): { value: boolean; source: 'override' | 'config' | 'build' | 'default' } {
  const lsValue = localStorage.getItem(`${EXPERIMENT_OVERRIDE_PREFIX}${key}`);
  if (lsValue !== null) return { value: lsValue === 'true', source: 'override' };
  if (configExperiments && key in configExperiments)
    return { value: configExperiments[key] ?? false, source: 'config' };
  if (key in INJECTED_EXPERIMENT_FLAGS)
    return { value: INJECTED_EXPERIMENT_FLAGS[key] ?? false, source: 'build' };
  return { value: false, source: 'default' };
}

export function ExperimentsPanel() {
  const config = useClientConfig();
  const [, forceUpdate] = useState(0);
  const refresh = useCallback(() => forceUpdate((n) => n + 1), []);

  const keys = getActiveExperimentKeys(config.experiments);

  if (keys.length === 0) {
    return (
      <Box direction="Column" gap="100">
        <Text size="L400">Experiments</Text>
        <Text size="T200" style={{ opacity: 0.7 }}>
          No experiment flags are defined. Set <code>VITE_FEATURE_*</code> env vars at build time or
          add an <code>experiments</code> field to <code>config.json</code>.
        </Text>
      </Box>
    );
  }

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Experiments</Text>
      <Text size="T200" style={{ opacity: 0.7 }}>
        Override experiment flags for this session. Changes are stored in localStorage and take
        effect immediately on next render.
      </Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        {keys.map((key) => {
          const { value, source } = getEffectiveValue(key, config.experiments);
          const hasOverride = source === 'override';
          return (
            <SettingTile
              key={key}
              focusId={`experiment-${key}`}
              title={key}
              description={`Source: ${source}`}
              after={
                <Box gap="200" alignItems="Center">
                  {hasOverride && (
                    <Button
                      variant="Secondary"
                      fill="Soft"
                      size="300"
                      radii="300"
                      outlined
                      onClick={() => {
                        setExperimentOverride(key, null);
                        refresh();
                      }}
                    >
                      <Text size="B300">Reset</Text>
                    </Button>
                  )}
                  <Switch
                    variant="Primary"
                    value={value}
                    onChange={(v) => {
                      setExperimentOverride(key, v);
                      refresh();
                    }}
                  />
                </Box>
              }
            />
          );
        })}
      </SequenceCard>
    </Box>
  );
}
