import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CallSoundSettings } from './CallSoundSettings';

vi.mock('$state/settings', () => ({
  settingsAtom: {},
}));

vi.mock('$state/hooks/settings', () => ({
  useSetting: (_atom: unknown, key: string) => {
    const values: Record<string, unknown> = {
      incomingCallSoundEnabled: true,
      outgoingRingbackEnabled: true,
      callRingtoneId: 'sable-default',
      callRingbackTone: 'sable-default',
      callRingtoneVolume: 80,
      callSoundOverrideGlobalNotifications: false,
      callCustomRingtoneName: undefined,
      callCustomRingtoneSizeBytes: undefined,
      callCustomRingtoneDurationMs: undefined,
      callCustomRingbackName: undefined,
      callCustomRingbackSizeBytes: undefined,
      callCustomRingbackDurationMs: undefined,
    };
    return [values[key], vi.fn<(value: unknown) => void>()] as const;
  },
}));

vi.mock('$features/call/callRingtoneStorage', () => ({
  getCustomCallRingtone: vi.fn<() => Promise<undefined>>(async () => undefined),
  getCustomCallRingback: vi.fn<() => Promise<undefined>>(async () => undefined),
  putCustomCallRingtone: vi.fn<() => Promise<void>>(),
  putCustomCallRingback: vi.fn<() => Promise<void>>(),
  clearCustomCallRingtone: vi.fn<() => Promise<void>>(),
  clearCustomCallRingback: vi.fn<() => Promise<void>>(),
}));

describe('CallSoundSettings', () => {
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
