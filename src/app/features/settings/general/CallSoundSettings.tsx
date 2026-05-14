import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Icon, Icons, Input, Spinner, Switch, Text, toRem } from 'folds';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { SettingMenuSelector } from '$components/setting-menu-selector';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom, type CallRingtoneId } from '$state/settings';
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
  clearCustomCallRingtone,
  getCustomCallRingtone,
  putCustomCallRingtone,
} from '$features/call/callRingtoneStorage';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { bytesToSize, millisecondsToMinutesAndSeconds } from '$utils/common';

function CustomRingtoneMeta({
  fileName,
  sizeBytes,
  durationMs,
}: {
  fileName?: string;
  sizeBytes?: number;
  durationMs?: number;
}) {
  if (!fileName) {
    return (
      <Text size="T200" priority="300">
        No custom ringtone imported.
      </Text>
    );
  }

  return (
    <Text size="T200" priority="300">
      {fileName}
      {typeof sizeBytes === 'number' && ` • ${bytesToSize(sizeBytes)}`}
      {typeof durationMs === 'number' && ` • ${millisecondsToMinutesAndSeconds(durationMs)}`}
    </Text>
  );
}

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
  const [callRingtoneVolume, setCallRingtoneVolume] = useSetting(settingsAtom, 'callRingtoneVolume');
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

  const [previewing, setPreviewing] = useState(false);
  const [loadingCustomState, setLoadingCustomState] = useState(true);
  const [hasCustomRingtone, setHasCustomRingtone] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let mounted = true;
    getCustomCallRingtone()
      .then((entry) => {
        if (!mounted) return;
        setHasCustomRingtone(Boolean(entry));
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
      setCustomError('Custom ringtone is not available on this device. Falling back to default.');
    }
  }, [callRingtoneId, hasCustomRingtone, loadingCustomState]);

  const ringtoneOptions = useMemo(
    () =>
      CALL_RINGTONE_OPTIONS.map((option) =>
        option.value === 'custom'
          ? {
              ...option,
              label: callCustomRingtoneName ? 'Custom File (Imported)' : 'Custom File',
              disabled: loadingCustomState ? true : false,
            }
          : option
      ),
    [callCustomRingtoneName, loadingCustomState]
  );

  const resolveToneForPreview = useCallback(
    async (tone: 'incoming' | 'outgoing'): Promise<string | null> => {
      let customUrl: string | undefined;
      if (callRingtoneId === 'custom' || callRingbackTone === 'same-as-ringtone') {
        const custom = await getCustomCallRingtone();
        if (custom?.blob) {
          customUrl = URL.createObjectURL(custom.blob);
        }
      }

      const source =
        tone === 'incoming'
          ? resolveIncomingCallToneUrl({ callRingtoneId }, customUrl)
          : resolveOutgoingRingbackToneUrl({ callRingbackTone, callRingtoneId }, customUrl);

      if (customUrl && source !== customUrl) {
        URL.revokeObjectURL(customUrl);
      }

      return source;
    },
    [callRingtoneId, callRingbackTone]
  );

  const playPreviewTone = useCallback(
    async (tone: 'incoming' | 'outgoing') => {
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

  const handleImportCustomRingtone = useCallback(() => {
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
          if (validation.reason === 'type') {
            setCustomError('Only audio files are supported.');
            return;
          }
          if (validation.reason === 'size') {
            setCustomError(
              `File is too large. Max ${bytesToSize(CUSTOM_CALL_RINGTONE_MAX_BYTES)} allowed.`
            );
            return;
          }
          setCustomError(
            `Ringtone must be between 1s and ${millisecondsToMinutesAndSeconds(
              CUSTOM_CALL_RINGTONE_MAX_DURATION_MS
            )}.`
          );
          return;
        }

        await putCustomCallRingtone(file, durationMs);
        setHasCustomRingtone(true);
        setCallRingtoneId('custom');
        setCallCustomRingtoneName(file.name);
        setCallCustomRingtoneSizeBytes(file.size);
        setCallCustomRingtoneDurationMs(durationMs);
      } catch {
        setCustomError('Could not import this file. Try a different audio format.');
      }
    });

    input.click();
  }, [
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

  const handleRingtoneSelection = (next: CallRingtoneId) => {
    if (next === 'custom' && !hasCustomRingtone) {
      setCustomError('Import a custom ringtone file first.');
      return;
    }
    setCustomError(null);
    setCallRingtoneId(next);
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
              options={CALL_RINGBACK_OPTIONS}
              onSelect={setCallRingbackTone}
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
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Custom Ringtone"
          focusId="custom-call-ringtone"
          description="Import an audio file for your ringtone."
        >
          <Box direction="Column" gap="200">
            <CustomRingtoneMeta
              fileName={callCustomRingtoneName}
              sizeBytes={callCustomRingtoneSizeBytes}
              durationMs={callCustomRingtoneDurationMs}
            />
            <Box gap="200" wrap="Wrap">
              <Button
                variant="Secondary"
                fill="Soft"
                size="300"
                radii="300"
                before={<Icon src={Icons.ArrowTop} size="100" />}
                onClick={handleImportCustomRingtone}
              >
                <Text size="B300">Import</Text>
              </Button>
              <Button
                variant="Secondary"
                fill="Soft"
                size="300"
                radii="300"
                before={
                  previewing ? (
                    <Spinner variant="Secondary" size="100" />
                  ) : (
                    <Icon src={Icons.Play} size="100" />
                  )
                }
                onClick={() => playPreviewTone('incoming')}
                disabled={previewing}
              >
                <Text size="B300">Preview Ringtone</Text>
              </Button>
              <Button
                variant="Secondary"
                fill="Soft"
                size="300"
                radii="300"
                before={<Icon src={Icons.Phone} size="100" />}
                onClick={() => playPreviewTone('outgoing')}
                disabled={previewing}
              >
                <Text size="B300">Preview Ringback</Text>
              </Button>
              <Button
                variant="Critical"
                fill="Soft"
                size="300"
                radii="300"
                before={<Icon src={Icons.Cross} size="100" />}
                onClick={handleResetCustomRingtone}
                disabled={!hasCustomRingtone}
              >
                <Text size="B300">Reset</Text>
              </Button>
            </Box>
            <Text size="T200" priority="300">
              Max file size: {bytesToSize(CUSTOM_CALL_RINGTONE_MAX_BYTES)}. Max duration:{' '}
              {millisecondsToMinutesAndSeconds(CUSTOM_CALL_RINGTONE_MAX_DURATION_MS)}.
            </Text>
            {customError && (
              <Text size="T200" style={{ color: 'var(--mx-color-critical-container-on)' }}>
                {customError}
              </Text>
            )}
          </Box>
        </SettingTile>
      </SequenceCard>
    </Box>
  );
}
