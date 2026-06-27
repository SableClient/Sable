import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSetting } from '$state/hooks/settings';
import { CallSoundSettings } from './CallSoundSettings';

vi.mock('$state/settings', () => ({
  CALL_TONE_IDS: ['sable-default', 'classic-soft', 'minimal-ping', 'silent', 'custom'],
  settingsAtom: {},
  getSettings: () => ({
    iconCompactSizePx: 16,
    iconInlineSizePx: 20,
    iconToolbarSizePx: 24,
    iconEmptySizePx: 32,
  }),
}));

vi.mock('$state/hooks/settings', () => ({
  useSetting: vi.fn<typeof useSetting>(),
}));

vi.mock('$features/call/callRingtoneStorage', () => ({
  getCustomCallRingtone: vi.fn<() => Promise<undefined>>(async () => undefined),
  getCustomCallRingback: vi.fn<() => Promise<undefined>>(async () => undefined),
  putCustomCallRingtone: vi.fn<() => Promise<void>>(),
  putCustomCallRingback: vi.fn<() => Promise<void>>(),
  clearCustomCallRingtone: vi.fn<() => Promise<void>>(),
  clearCustomCallRingback: vi.fn<() => Promise<void>>(),
}));

const defaultSettingValues: Record<string, unknown> = {
  incomingCallSoundEnabled: true,
  outgoingRingbackEnabled: true,
  callRingtoneId: 'sable-default',
  callRingbackTone: 'sable-default',
  callRingtoneVolume: 80,
  callSoundOverrideGlobalNotifications: false,
};

describe('CallSoundSettings', () => {
  beforeEach(() => {
    vi.mocked(useSetting).mockImplementation((_atom: unknown, key: string) => {
      return [defaultSettingValues[key], vi.fn<(value: unknown) => void>()] as const;
    });
  });

  it('falls back to default ringtone when custom ringtone is unavailable', async () => {
    const setCallRingtoneId = vi.fn<(value: unknown) => void>();
    vi.mocked(useSetting).mockImplementation((_atom: unknown, key: string) => {
      if (key === 'callRingtoneId') {
        return ['custom', setCallRingtoneId] as const;
      }
      return [defaultSettingValues[key], vi.fn<(value: unknown) => void>()] as const;
    });

    render(<CallSoundSettings />);

    await waitFor(() => {
      expect(setCallRingtoneId).toHaveBeenCalledWith('sable-default');
    });
  });

  it('renders expected call sound setting controls', async () => {
    render(<CallSoundSettings />);

    expect(screen.getByText('Incoming Call Sound')).toBeInTheDocument();
    expect(screen.getByText('Outgoing Ringback Sound')).toBeInTheDocument();
    expect(screen.getByText('Ringtone')).toBeInTheDocument();
    expect(screen.getByText('Ringback Tone')).toBeInTheDocument();
    expect(screen.getByText('Ringtone Volume')).toBeInTheDocument();
    expect(screen.getByText('Always Play Call Sound')).toBeInTheDocument();
    expect(screen.getByText('Custom Ringtone')).toBeInTheDocument();
    expect(screen.getByText('Custom Ringback')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('No custom ringtone imported.')).toBeInTheDocument();
      expect(screen.getByText('No custom ringback imported.')).toBeInTheDocument();
    });
  });
});
