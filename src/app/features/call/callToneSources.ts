import type { Settings } from '$state/settings';
import { getCustomCallRingback, getCustomCallRingtone } from './callRingtoneStorage';
import { resolveIncomingCallToneUrl, resolveOutgoingRingbackToneUrl } from './callRingtone';

export type CallToneSourceSettings = Pick<Settings, 'callRingtoneId' | 'callRingbackTone'>;

export type ResolvedCallToneSources = {
  incomingUrl: string | null;
  outgoingUrl: string | null;
  customRingtoneObjectUrl?: string;
  customRingbackObjectUrl?: string;
  revoke: () => void;
};

export const resolveCallToneSources = async (
  settings: CallToneSourceSettings
): Promise<ResolvedCallToneSources> => {
  let customRingtoneUrl: string | undefined;
  let customRingbackUrl: string | undefined;

  if (settings.callRingtoneId === 'custom') {
    const customRingtone = await getCustomCallRingtone().catch(() => undefined);
    if (customRingtone?.blob) {
      customRingtoneUrl = URL.createObjectURL(customRingtone.blob);
    }
  }

  if (settings.callRingbackTone === 'custom') {
    const customRingback = await getCustomCallRingback().catch(() => undefined);
    if (customRingback?.blob) {
      customRingbackUrl = URL.createObjectURL(customRingback.blob);
    }
  }

  const incomingUrl = resolveIncomingCallToneUrl(
    { callRingtoneId: settings.callRingtoneId },
    customRingtoneUrl
  );
  const outgoingUrl = resolveOutgoingRingbackToneUrl(
    {
      callRingtoneId: settings.callRingtoneId,
      callRingbackTone: settings.callRingbackTone,
    },
    customRingtoneUrl,
    customRingbackUrl
  );

  return {
    incomingUrl,
    outgoingUrl,
    customRingtoneObjectUrl: customRingtoneUrl,
    customRingbackObjectUrl: customRingbackUrl,
    revoke: () => {
      if (customRingtoneUrl) URL.revokeObjectURL(customRingtoneUrl);
      if (customRingbackUrl) URL.revokeObjectURL(customRingbackUrl);
    },
  };
};

export const revokeUnusedCustomToneUrls = (
  resolved: ResolvedCallToneSources,
  activeSource: string | null
): void => {
  if (resolved.customRingtoneObjectUrl && resolved.customRingtoneObjectUrl !== activeSource) {
    URL.revokeObjectURL(resolved.customRingtoneObjectUrl);
  }
  if (resolved.customRingbackObjectUrl && resolved.customRingbackObjectUrl !== activeSource) {
    URL.revokeObjectURL(resolved.customRingbackObjectUrl);
  }
};
