import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Icons, Input, Switch, Text, toRem } from 'folds';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { SettingMenuSelector } from '$components/setting-menu-selector';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom, type CallRingtoneId } from '$state/settings';
import {
  CALL_RINGBACK_OPTIONS,
  CALL_RINGTONE_OPTIONS,
  clampCallRingtoneVolume,
  readAudioDurationMs,
  validateCustomCallRingtone,
} from '$features/call/callRingtone';
import { ringtoneManager } from '$features/call/CallRingtoneManager';
import {
  clearCustomCallRingback,
  clearCustomCallRingtone,
  getCustomCallRingback,
  getCustomCallRingtone,
  putCustomCallRingback,
  putCustomCallRingtone,
  type StoredCallRingtone,
} from '$features/call/callRingtoneStorage';
import { SequenceCardStyle } from '$features/settings/styles.css';
import {
  CustomToneSettingsCard,
  customToneValidationError,
  type CustomToneMetadata,
  type PreviewTone,
} from './CallSoundSettingsCards';
import { useTranslation } from 'react-i18next';

const toCustomToneMetadata = (stored: StoredCallRingtone): CustomToneMetadata => ({
  fileName: stored.fileName,
  sizeBytes: stored.sizeBytes,
  durationMs: stored.durationMs,
});

export function CallSoundSettings() {
  const { t } = useTranslation(['settings/general']);
  const [incomingCallSoundEnabled, setIncomingCallSoundEnabled] = useSetting(
    settingsAtom,
    'incomingCallSoundEnabled'
  );
  const [incomingVoiceRoomCallSoundEnabled, setIncomingVoiceRoomCallSoundEnabled] = useSetting(
    settingsAtom,
    'incomingVoiceRoomCallSoundEnabled'
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

  const [previewing, setPreviewing] = useState(false);
  const [loadingCustomState, setLoadingCustomState] = useState(true);
  const [hasCustomRingtone, setHasCustomRingtone] = useState(false);
  const [hasCustomRingback, setHasCustomRingback] = useState(false);
  const [customRingtoneMeta, setCustomRingtoneMeta] = useState<CustomToneMetadata | null>(null);
  const [customRingbackMeta, setCustomRingbackMeta] = useState<CustomToneMetadata | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    Promise.all([getCustomCallRingtone(), getCustomCallRingback()])
      .then(([ringtone, ringback]) => {
        if (!mounted) return;
        setHasCustomRingtone(Boolean(ringtone));
        setHasCustomRingback(Boolean(ringback));
        setCustomRingtoneMeta(ringtone ? toCustomToneMetadata(ringtone) : null);
        setCustomRingbackMeta(ringback ? toCustomToneMetadata(ringback) : null);
      })
      .finally(() => {
        if (!mounted) return;
        setLoadingCustomState(false);
      });

    return () => {
      mounted = false;
      ringtoneManager.stopPreview();
    };
  }, []);

  useEffect(() => {
    if (!loadingCustomState && !hasCustomRingtone && callRingtoneId === 'custom') {
      setCallRingtoneId('sable-default');
      setCustomError(t('Calls.custom_ringtone_not_available'));
    }
    if (!loadingCustomState && !hasCustomRingback && callRingbackTone === 'custom') {
      setCallRingbackTone('sable-default');
      setCustomError(t('Calls.custom_ringback_not_available'));
    }
  }, [
    callRingtoneId,
    callRingbackTone,
    hasCustomRingtone,
    hasCustomRingback,
    loadingCustomState,
    setCallRingtoneId,
    setCallRingbackTone,
    t,
  ]);

  const ringtoneOptions = useMemo(
    () =>
      CALL_RINGTONE_OPTIONS.map((option) =>
        option.value === 'custom'
          ? {
              ...option,
              label: customRingtoneMeta ? t('Calls.custom_file_imported') : t('Calls.custom_file'),
              disabled: loadingCustomState,
            }
          : option
      ),
    [customRingtoneMeta, loadingCustomState, t]
  );
  const ringbackOptions = useMemo(
    () =>
      CALL_RINGBACK_OPTIONS.map((option) =>
        option.value === 'custom'
          ? {
              ...option,
              label: customRingbackMeta ? t('Calls.custom_file_imported') : t('Calls.custom_file'),
              disabled: loadingCustomState,
            }
          : option
      ),
    [customRingbackMeta, loadingCustomState, t]
  );

  const playPreviewTone = useCallback(
    async (tone: PreviewTone) => {
      setCustomError(null);
      setPreviewing(true);
      try {
        await ringtoneManager.playPreview(tone, {
          callRingtoneId,
          callRingbackTone,
          callRingtoneVolume,
        });

        window.setTimeout(() => {
          ringtoneManager.stopPreview();
        }, 2500);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setCustomError(t('Calls.unable_to_preview_this_ringtone'));
      } finally {
        setPreviewing(false);
      }
    },
    [callRingtoneId, callRingbackTone, callRingtoneVolume, t]
  );

  const importCustomTone = useCallback(
    (
      label: 'Ringtone' | 'Ringback',
      putTone: (file: File, durationMs: number) => Promise<StoredCallRingtone>,
      onImported: (stored: StoredCallRingtone) => void
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
            setCustomError(customToneValidationError(validation.reason, label, t));
            return;
          }

          const stored = await putTone(file, durationMs);
          onImported(stored);
        } catch {
          setCustomError(t('Calls.could_not_import_file_format'));
        }
      });

      input.click();
    },
    [t]
  );

  const handleImportCustomRingtone = useCallback(() => {
    importCustomTone('Ringtone', putCustomCallRingtone, (stored) => {
      setHasCustomRingtone(true);
      setCallRingtoneId('custom');
      setCustomRingtoneMeta(toCustomToneMetadata(stored));
    });
  }, [importCustomTone, setCallRingtoneId]);

  const handleResetCustomRingtone = useCallback(async () => {
    setCustomError(null);
    await clearCustomCallRingtone();
    setHasCustomRingtone(false);
    setCustomRingtoneMeta(null);
    if (callRingtoneId === 'custom') {
      setCallRingtoneId('sable-default');
    }
  }, [callRingtoneId, setCallRingtoneId]);

  const handleImportCustomRingback = useCallback(() => {
    importCustomTone('Ringback', putCustomCallRingback, (stored) => {
      setHasCustomRingback(true);
      setCallRingbackTone('custom');
      setCustomRingbackMeta(toCustomToneMetadata(stored));
    });
  }, [importCustomTone, setCallRingbackTone]);

  const handleResetCustomRingback = useCallback(async () => {
    setCustomError(null);
    await clearCustomCallRingback();
    setHasCustomRingback(false);
    setCustomRingbackMeta(null);
    if (callRingbackTone === 'custom') {
      setCallRingbackTone('sable-default');
    }
  }, [callRingbackTone, setCallRingbackTone]);

  const handleRingtoneSelection = (next: CallRingtoneId) => {
    if (next === 'custom' && !hasCustomRingtone) {
      setCustomError(t('Calls.import_custom_ringtone_file'));
      return;
    }
    setCustomError(null);
    setCallRingtoneId(next);
  };

  const handleRingbackSelection = (next: CallRingtoneId) => {
    if (next === 'custom' && !hasCustomRingback) {
      setCustomError(t('Calls.import_custom_ringback_file'));
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
          title={t('Calls.incoming_call_sound_title')}
          focusId="incoming-call-sound"
          description={t('Calls.incoming_call_sound_description')}
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
          title={t('Calls.notify_voice_rooms_title')}
          focusId="notify-voice-rooms"
          description={t('Calls.notify_voice_rooms_description')}
          after={
            <Switch
              variant="Primary"
              value={incomingVoiceRoomCallSoundEnabled}
              onChange={setIncomingVoiceRoomCallSoundEnabled}
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Calls.outgoing_ringback_sound_title')}
          focusId="outgoing-ringback-sound"
          description={t('Calls.outgoing_ringback_sound_description')}
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
          title={t('Calls.call_ringtone_title')}
          focusId="call-ringtone"
          description={t('Calls.call_ringtone_description')}
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
          title={t('Calls.call_ringback_tone_title')}
          focusId="call-ringback-tone"
          description={t('Calls.call_ringback_tone_description')}
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
          title={t('Calls.call_ringtone_volume_title')}
          focusId="call-ringtone-volume"
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
          title={t('Calls.always_play_call_sound_title')}
          focusId="always-play-call-sound"
          description={t('Calls.always_play_call_sound_description')}
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
        title={t('Calls.custom_call_ringtone_title')}
        focusId="custom-call-ringtone"
        description={t('Calls.custom_call_ringtone_description')}
        metadata={customRingtoneMeta}
        emptyLabel={t('Calls.custom_call_ringtone_empty')}
        hasCustomTone={hasCustomRingtone}
        previewing={previewing}
        previewActions={[
          { label: t('Calls.custom_call_ringtone_preview'), tone: 'incoming', icon: Icons.Play },
        ]}
        onImport={handleImportCustomRingtone}
        onPreview={playPreviewTone}
        onReset={handleResetCustomRingtone}
      />
      <CustomToneSettingsCard
        title={t('Calls.custom_call_ringback_title')}
        focusId="custom-call-ringback"
        description={t('Calls.custom_call_ringback_description')}
        metadata={customRingbackMeta}
        emptyLabel={t('Calls.custom_call_ringback_empty')}
        hasCustomTone={hasCustomRingback}
        previewing={previewing}
        previewActions={[
          { label: t('Calls.custom_call_ringback_preview'), tone: 'outgoing', icon: Icons.Phone },
        ]}
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
