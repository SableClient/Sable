import { Box, Button, Icon, Icons, Spinner, Text } from 'folds';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { SequenceCardStyle } from '$features/settings/styles.css';
import {
  CUSTOM_CALL_RINGTONE_MAX_BYTES,
  CUSTOM_CALL_RINGTONE_MAX_DURATION_MS,
} from '$features/call/callRingtone';
import { bytesToSize, millisecondsToMinutesAndSeconds } from '$utils/common';

export type PreviewTone = 'incoming' | 'outgoing';

export type CustomToneMetadata = {
  fileName: string;
  sizeBytes: number;
  durationMs: number;
};

export function CustomToneMeta({
  metadata,
  emptyLabel,
}: {
  metadata: CustomToneMetadata | null;
  emptyLabel: string;
}) {
  if (!metadata) {
    return (
      <Text size="T200" priority="300">
        {emptyLabel}
      </Text>
    );
  }

  return (
    <Text size="T200" priority="300">
      {[
        metadata.fileName,
        bytesToSize(metadata.sizeBytes),
        millisecondsToMinutesAndSeconds(metadata.durationMs),
      ].join(' - ')}
    </Text>
  );
}

export function CustomToneSettingsCard({
  title,
  focusId,
  description,
  metadata,
  emptyLabel,
  hasCustomTone,
  previewing,
  previewActions,
  onImport,
  onPreview,
  onReset,
}: {
  title: string;
  focusId: string;
  description: string;
  metadata: CustomToneMetadata | null;
  emptyLabel: string;
  hasCustomTone: boolean;
  previewing: boolean;
  previewActions: {
    label: string;
    tone: PreviewTone;
    icon: (typeof Icons)[keyof typeof Icons];
  }[];
  onImport: () => void;
  onPreview: (tone: PreviewTone) => void;
  onReset: () => void;
}) {
  return (
    <SequenceCard
      className={SequenceCardStyle}
      variant="SurfaceVariant"
      direction="Column"
      gap="400"
    >
      <SettingTile title={title} focusId={focusId} description={description}>
        <Box direction="Column" gap="200">
          <CustomToneMeta metadata={metadata} emptyLabel={emptyLabel} />
          <Box gap="200" wrap="Wrap">
            <Button
              variant="Secondary"
              fill="Soft"
              size="300"
              radii="300"
              before={<Icon src={Icons.ArrowTop} size="100" />}
              onClick={onImport}
            >
              <Text size="B300">Import</Text>
            </Button>
            {previewActions.map(({ label, tone, icon }) => (
              <Button
                key={label}
                variant="Secondary"
                fill="Soft"
                size="300"
                radii="300"
                before={
                  previewing ? (
                    <Spinner variant="Secondary" size="100" />
                  ) : (
                    <Icon src={icon} size="100" />
                  )
                }
                onClick={() => onPreview(tone)}
                disabled={previewing}
              >
                <Text size="B300">{label}</Text>
              </Button>
            ))}
            <Button
              variant="Critical"
              fill="Soft"
              size="300"
              radii="300"
              before={<Icon src={Icons.Cross} size="100" />}
              onClick={onReset}
              disabled={!hasCustomTone}
            >
              <Text size="B300">Reset</Text>
            </Button>
          </Box>
          <Text size="T200" priority="300">
            Max file size: {bytesToSize(CUSTOM_CALL_RINGTONE_MAX_BYTES)}. Max duration:{' '}
            {millisecondsToMinutesAndSeconds(CUSTOM_CALL_RINGTONE_MAX_DURATION_MS)}.
          </Text>
        </Box>
      </SettingTile>
    </SequenceCard>
  );
}

export const customToneValidationError = (
  reason: 'type' | 'size' | 'duration',
  label: 'Ringtone' | 'Ringback'
): string => {
  if (reason === 'type') return 'Only audio files are supported.';
  if (reason === 'size') {
    return `File is too large. Max ${bytesToSize(CUSTOM_CALL_RINGTONE_MAX_BYTES)} allowed.`;
  }

  return `${label} must be between 1s and ${millisecondsToMinutesAndSeconds(
    CUSTOM_CALL_RINGTONE_MAX_DURATION_MS
  )}.`;
};
