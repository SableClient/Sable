/* oxlint-disable vitest/require-mock-type-parameters */
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeregisterAllPushersSetting } from './DeregisterPushNotifications';

const mockUseSetting = vi.hoisted(() => vi.fn());
const mockUseAtom = vi.hoisted(() => vi.fn());
const mockSetPushNotifications = vi.hoisted(() => vi.fn());
const mockSetPushSubscription = vi.hoisted(() => vi.fn());
const mockMx = vi.hoisted(() => ({ id: 'mx-client' }));
const mockDeRegisterAllPushers = vi.hoisted(() => vi.fn());

vi.mock('../../../hooks/useMatrixClient', () => ({
  useMatrixClient: () => mockMx,
}));

vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('../../../state/hooks/settings', () => ({
  useSetting: mockUseSetting,
}));

vi.mock('jotai', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useAtom: mockUseAtom,
  };
});

vi.mock('../../../state/settings', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    settingsAtom: {},
  };
});

vi.mock('../../../state/pushSubscription', () => ({
  pushSubscriptionAtom: {},
}));

vi.mock('./PushNotifications', () => ({
  deRegisterAllPushers: mockDeRegisterAllPushers,
}));

describe('DeregisterAllPushersSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSetting.mockReturnValue([false, mockSetPushNotifications]);
    mockUseAtom.mockReturnValue([null, mockSetPushSubscription]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows success state and clears local push state after resetting all pushers', async () => {
    mockDeRegisterAllPushers.mockResolvedValue(undefined);

    render(<DeregisterAllPushersSetting />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Reset All' })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset All' })[1]!);

    await waitFor(() => {
      expect(mockDeRegisterAllPushers).toHaveBeenCalledWith(mockMx);
    });

    await waitFor(() => {
      expect(screen.getByText('Successfully deregistered all devices.')).toBeInTheDocument();
    });

    expect(mockSetPushNotifications).toHaveBeenCalledWith(false);
    expect(mockSetPushSubscription).toHaveBeenCalledWith(null);
  });

  it('shows the error state and keeps the confirm dialog open when deregistration fails', async () => {
    mockDeRegisterAllPushers.mockRejectedValue(new Error('boom'));

    render(<DeregisterAllPushersSetting />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Reset All' })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset All' })[1]!);

    await waitFor(() => {
      expect(screen.getByText('Failed to deregister devices. Please try again.')).toBeInTheDocument();
    });

    expect(screen.getByText('This will remove push notifications from all your sessions and devices. This action cannot be undone. Are you sure you want to continue?')).toBeInTheDocument();
    expect(mockSetPushNotifications).not.toHaveBeenCalled();
    expect(mockSetPushSubscription).not.toHaveBeenCalled();
  });
});
