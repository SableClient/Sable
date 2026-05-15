import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Icon, Icons, Input, Spinner, Switch, Text, toRem } from 'folds';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { SettingMenuSelector } from '$components/setting-menu-selector';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom, type CallRingbackTone, type CallRingtoneId } from '$state/settings';
import {
  CALL_RINGBACK_OPTIONS,
  CALL_RINGTONE_OPTIONS,
  CUSTOM_CALL_RINGTONE_MAX_BYTES,
  CUSTOM_CALL_RINGTONE_MAX_DURATION_MS,
  callRingtoneVolumeToGain,
  clampCallRingtoneVolume,
  readAudioDurationMs,
  resolveIncomingCallToneUrl,
  resolveOutgoingRingbackToneUrl,
  validateCustomCallRingtone,
} from '$features/call/callRingtone';
import {
  clearCustomCallRingback,
  clearCustomCallRingtone,
  getCustomCallRingback,
  getCustomCallRingtone,
  putCustomCallRingback,
  putCustomCallRingtone,
} from '$features/call/callRingtoneStorage';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { bytesToSize, millisecondsToMinutesAndSeconds } from '$utils/common';

type PreviewTone = 'incoming' | 'outgoing';

function CustomToneMeta({
  fileName,
  sizeBytes,
  durationMs,
  emptyLabel,
}: {
  fileName?: string;
  sizeBytes?: number;
  durationMs?: number;
  emptyLabel: string;
}) {
  if (!fileName) {
    return (
      <Text size="T200" priority="300">
        {emptyLabel}
      </Text>
    );
  }

  return (
    <Text size="T200" priority="300">
      {[
        fileName,
        typeof sizeBytes === 'number' ? bytesToSize(sizeBytes) : undefined,
        typeof durationMs === 'number' ? millisecondsToMinutesAndSeconds(durationMs) : undefined,
      ]
        .filter(Boolean)
        .join(' - ')}
    </Text>
  );
}

function CustomToneSettingsCard({
  title,
  focusId,
  description,
  fileName,
  sizeBytes,
  durationMs,
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
  fileName?: string;
  sizeBytes?: number;
  durationMs?: number;
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
          <CustomToneMeta
            fileName={fileName}
            sizeBytes={sizeBytes}
            durationMs={durationMs}
            emptyLabel={emptyLabel}
          />
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

const customToneValidationError = (
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

export function CallSoundSettings() {
  const [incomingCallSoundEnabled, setIncomingCallSoundEnabled] = useSetting(
    settingsAtom,
    'incomingCallSoundEnabled'
  );
  const [outgoingRingbackEnabled, setOutgoingRingbackEnabled] = useSetting(
    settingsAtom,
    'outgoingRingbackEnabled'
  );
  const [callRingtoneId, setCallRingtoneId] = useSetting(settingsAtom, 'callRingtoneId');
  const [callRingbackTone, setCallRingbackTone] = useSetting(settingsAtom, 'callRingbackTone');
  const [callRingtoneVolume, setCallRingtoneVolume] = useSetting(
    settingsAtom,
    'callRingtoneVolume'
  );
  const [callSoundOverrideGlobalNotifications, setCallSoundOverrideGlobalNotifications] =
    useSetting(settingsAtom, 'callSoundOverrideGlobalNotifications');
  const [callCustomRingtoneName, setCallCustomRingtoneName] = useSetting(
    settingsAtom,
    'callCustomRingtoneName'
  );
  const [callCustomRingtoneSizeBytes, setCallCustomRingtoneSizeBytes] = useSetting(
    settingsAtom,
    'callCustomRingtoneSizeBytes'
  );
  const [callCustomRingtoneDurationMs, setCallCustomRingtoneDurationMs] = useSetting(
    settingsAtom,
    'callCustomRingtoneDurationMs'
  );
  const [callCustomRingbackName, setCallCustomRingbackName] = useSetting(
    settingsAtom,
    'callCustomRingbackName'
  );
  const [callCustomRingbackSizeBytes, setCallCustomRingbackSizeBytes] = useSetting(
    settingsAtom,
    'callCustomRingbackSizeBytes'
  );
  const [callCustomRingbackDurationMs, setCallCustomRingbackDurationMs] = useSetting(
    settingsAtom,
    'callCustomRingbackDurationMs'
  );

  const [previewing, setPreviewing] = useState(false);
  const [loadingCustomState, setLoadingCustomState] = useState(true);
  const [hasCustomRingtone, setHasCustomRingtone] = useState(false);
  const [hasCustomRingback, setHasCustomRingback] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([getCustomCallRingtone(), getCustomCallRingback()])
      .then(([ringtone, ringback]) => {
        if (!mounted) return;
        setHasCustomRingtone(Boolean(ringtone));
        setHasCustomRingback(Boolean(ringback));
      })
      .finally(() => {
        if (!mounted) return;
        setLoadingCustomState(false);
      });

    return () => {
      mounted = false;
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!loadingCustomState && !hasCustomRingtone && callRingtoneId === 'custom') {
      setCallRingtoneId('sable-default');
      setCustomError('Custom ringtone is not available on this device. Falling back to default.');
    }
    if (!loadingCustomState && !hasCustomRingback && callRingbackTone === 'custom') {
      setCallRingbackTone('sable-default');
      setCustomError('Custom ringback is not available on this device. Falling back to default.');
    }
  }, [
    callRingtoneId,
    callRingbackTone,
    hasCustomRingtone,
    hasCustomRingback,
    loadingCustomState,
    setCallRingtoneId,
    setCallRingbackTone,
  ]);

  const ringtoneOptions = useMemo(
    () =>
      CALL_RINGTONE_OPTIONS.map((option) =>
        option.value === 'custom'
          ? {
              ...option,
              label: callCustomRingtoneName ? 'Custom File (Imported)' : 'Custom File',
              disabled: loadingCustomState,
            }
          : option
      ),
    [callCustomRingtoneName, loadingCustomState]
  );
  const ringbackOptions = useMemo(
    () =>
      CALL_RINGBACK_OPTIONS.map((option) =>
        option.value === 'custom'
          ? {
              ...option,
              label: callCustomRingbackName ? 'Custom File (Imported)' : 'Custom File',
              disabled: loadingCustomState,
            }
          : option
      ),
    [callCustomRingbackName, loadingCustomState]
  );

  const resolveToneForPreview = useCallback(
    async (tone: PreviewTone): Promise<string | null> => {
      let customRingtoneUrl: string | undefined;
      let customRingbackUrl: string | undefined;
      if (callRingtoneId === 'custom') {
        const customRingtone = await getCustomCallRingtone();
        if (customRingtone?.blob) {
          customRingtoneUrl = URL.createObjectURL(customRingtone.blob);
        }
      }
      if (callRingbackTone === 'custom') {
        const customRingback = await getCustomCallRingback();
        if (customRingback?.blob) {
          customRingbackUrl = URL.createObjectURL(customRingback.blob);
        }
      }

      const source =
        tone === 'incoming'
          ? resolveIncomingCallToneUrl({ callRingtoneId }, customRingtoneUrl)
          : resolveOutgoingRingbackToneUrl(
              { callRingbackTone, callRingtoneId },
              customRingtoneUrl,
              customRingbackUrl
            );

      if (customRingtoneUrl && source !== customRingtoneUrl) URL.revokeObjectURL(customRingtoneUrl);
      if (customRingbackUrl && source !== customRingbackUrl) URL.revokeObjectURL(customRingbackUrl);

      return source;
    },
    [callRingtoneId, callRingbackTone]
  );

  const playPreviewTone = useCallback(
    async (tone: PreviewTone) => {
      setCustomError(null);
      setPreviewing(true);
      try {
        const source = await resolveToneForPreview(tone);
        if (!source) return;
        const revokeSource = source.startsWith('blob:');

        previewAudioRef.current?.pause();
        const audio = new Audio(source);
        audio.loop = true;
        audio.volume = callRingtoneVolumeToGain(callRingtoneVolume);
        previewAudioRef.current = audio;
        await audio.play();
        window.setTimeout(() => {
          if (previewAudioRef.current === audio) {
            audio.pause();
            audio.currentTime = 0;
          }
          if (revokeSource) URL.revokeObjectURL(source);
        }, 2500);
      } catch {
        setCustomError('Unable to preview this ringtone in your browser.');
      } finally {
        setPreviewing(false);
      }
    },
    [callRingtoneVolume, resolveToneForPreview]
  );

  const importCustomTone = useCallback(
    (
      label: 'Ringtone' | 'Ringback',
      putTone: (file: File, durationMs: number) => Promise<unknown>,
      onImported: (file: File, durationMs: number) => void
    ) => {
      setCustomError(null);
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*';
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;

        try {
          const durationMs = await readAudioDurationMs(file);
          const validation = validateCustomCallRingtone({
            fileName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            durationMs,
          });
          if (!validation.valid) {
            setCustomError(customToneValidationError(validation.reason, label));
            return;
          }

          await putTone(file, durationMs);
          onImported(file, durationMs);
        } catch {
          setCustomError('Could not import this file. Try a different audio format.');
        }
      });

      input.click();
    },
    []
  );

  const handleImportCustomRingtone = useCallback(() => {
    importCustomTone('Ringtone', putCustomCallRingtone, (file, durationMs) => {
      setHasCustomRingtone(true);
      setCallRingtoneId('custom');
      setCallCustomRingtoneName(file.name);
      setCallCustomRingtoneSizeBytes(file.size);
      setCallCustomRingtoneDurationMs(durationMs);
    });
  }, [
    importCustomTone,
    setCallCustomRingtoneDurationMs,
    setCallCustomRingtoneName,
    setCallCustomRingtoneSizeBytes,
    setCallRingtoneId,
  ]);

  const handleResetCustomRingtone = useCallback(async () => {
    setCustomError(null);
    await clearCustomCallRingtone();
    setHasCustomRingtone(false);
    setCallCustomRingtoneName(undefined);
    setCallCustomRingtoneSizeBytes(undefined);
    setCallCustomRingtoneDurationMs(undefined);
    if (callRingtoneId === 'custom') {
      setCallRingtoneId('sable-default');
    }
  }, [
    callRingtoneId,
    setCallCustomRingtoneDurationMs,
    setCallCustomRingtoneName,
    setCallCustomRingtoneSizeBytes,
    setCallRingtoneId,
  ]);

  const handleImportCustomRingback = useCallback(() => {
    importCustomTone('Ringback', putCustomCallRingback, (file, durationMs) => {
      setHasCustomRingback(true);
      setCallRingbackTone('custom');
      setCallCustomRingbackName(file.name);
      setCallCustomRingbackSizeBytes(file.size);
      setCallCustomRingbackDurationMs(durationMs);
    });
  }, [
    importCustomTone,
    setCallCustomRingbackDurationMs,
    setCallCustomRingbackName,
    setCallCustomRingbackSizeBytes,
    setCallRingbackTone,
  ]);

  const handleResetCustomRingback = useCallback(async () => {
    setCustomError(null);
    await clearCustomCallRingback();
    setHasCustomRingback(false);
    setCallCustomRingbackName(undefined);
    setCallCustomRingbackSizeBytes(undefined);
    setCallCustomRingbackDurationMs(undefined);
    if (callRingbackTone === 'custom') {
      setCallRingbackTone('sable-default');
    }
  }, [
    callRingbackTone,
    setCallCustomRingbackDurationMs,
    setCallCustomRingbackName,
    setCallCustomRingbackSizeBytes,
    setCallRingbackTone,
  ]);

  const handleRingtoneSelection = (next: CallRingtoneId) => {
    if (next === 'custom' && !hasCustomRingtone) {
      setCustomError('Import a custom ringtone file first.');
      return;
    }
    setCustomError(null);
    setCallRingtoneId(next);
  };

  const handleRingbackSelection = (next: CallRingbackTone) => {
    if (next === 'custom' && !hasCustomRingback) {
      setCustomError('Import a custom ringback file first.');
      return;
    }
    setCustomError(null);
    setCallRingbackTone(next);
  };

  const handleVolumeChange = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return;
    setCallRingtoneVolume(clampCallRingtoneVolume(parsed));
  };

  return (
    <Box direction="Column" gap="100">
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Incoming Call Sound"
          focusId="incoming-call-sound"
          description="Play ringtone audio for incoming calls."
          after={
            <Switch
              variant="Primary"
              value={incomingCallSoundEnabled}
              onChange={setIncomingCallSoundEnabled}
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Outgoing Ringback Sound"
          focusId="outgoing-ringback-sound"
          description="Play ringback while waiting for someone to join."
          after={
            <Switch
              variant="Primary"
              value={outgoingRingbackEnabled}
              onChange={setOutgoingRingbackEnabled}
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Ringtone"
          focusId="call-ringtone"
          description="Choose the incoming call ringtone."
          after={
            <SettingMenuSelector
              value={callRingtoneId}
              options={ringtoneOptions}
              onSelect={handleRingtoneSelection}
              disabled={loadingCustomState}
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Ringback Tone"
          focusId="call-ringback-tone"
          description="Choose what plays while your outgoing call is waiting."
          after={
            <SettingMenuSelector
              value={callRingbackTone}
              options={ringbackOptions}
              onSelect={handleRingbackSelection}
              disabled={loadingCustomState}
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Ringtone Volume"
          focusId="call-ringtone-volume"
          description={`${clampCallRingtoneVolume(callRingtoneVolume)}%`}
          after={
            <Input
              style={{ width: toRem(76) }}
              variant="Secondary"
              size="300"
              radii="300"
              type="number"
              min="0"
              max="100"
              value={String(clampCallRingtoneVolume(callRingtoneVolume))}
              onChange={(evt) => handleVolumeChange(evt.currentTarget.value)}
              outlined
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Always Play Call Sound"
          focusId="always-play-call-sound"
          description="Play call sounds even when message notification sounds are turned off."
          after={
            <Switch
              variant="Primary"
              value={callSoundOverrideGlobalNotifications}
              onChange={setCallSoundOverrideGlobalNotifications}
            />
          }
        />
      </SequenceCard>
      <CustomToneSettingsCard
        title="Custom Ringtone"
        focusId="custom-call-ringtone"
        description="Import an audio file for your ringtone."
        fileName={callCustomRingtoneName}
        sizeBytes={callCustomRingtoneSizeBytes}
        durationMs={callCustomRingtoneDurationMs}
        emptyLabel="No custom ringtone imported."
        hasCustomTone={hasCustomRingtone}
        previewing={previewing}
        previewActions={[
          { label: 'Preview Ringtone', tone: 'incoming', icon: Icons.Play },
          { label: 'Preview Outgoing', tone: 'outgoing', icon: Icons.Phone },
        ]}
        onImport={handleImportCustomRingtone}
        onPreview={playPreviewTone}
        onReset={handleResetCustomRingtone}
      />
      <CustomToneSettingsCard
        title="Custom Ringback"
        focusId="custom-call-ringback"
        description="Import an audio file for outgoing ringback."
        fileName={callCustomRingbackName}
        sizeBytes={callCustomRingbackSizeBytes}
        durationMs={callCustomRingbackDurationMs}
        emptyLabel="No custom ringback imported."
        hasCustomTone={hasCustomRingback}
        previewing={previewing}
        previewActions={[{ label: 'Preview Ringback', tone: 'outgoing', icon: Icons.Phone }]}
        onImport={handleImportCustomRingback}
        onPreview={playPreviewTone}
        onReset={handleResetCustomRingback}
      />
      {customError && (
        <Text size="T200" style={{ color: 'var(--mx-color-critical-container-on)' }}>
          {customError}
        </Text>
      )}
    </Box>
  );
}
