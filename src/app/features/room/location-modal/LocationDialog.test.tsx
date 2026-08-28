/* oxlint-disable typescript/no-explicit-any, react/void-dom-elements-no-children, vitest/require-mock-type-parameters, unicorn/consistent-function-scoping, typescript/no-extraneous-class */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocationDialog } from './LocationDialog';

vi.mock('folds', () => {
  const div = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  const button = ({ children, ...props }: any) => <button {...props}>{children}</button>;
  return {
    Dialog: div,
    Header: div,
    Box: div,
    Text: div,
    IconButton: button,
    Button: button,
    Input: (props: any) => <input {...props} />,
    Chip: button,
    color: { Critical: { OnContainer: 'red' } },
  };
});

vi.mock('@phosphor-icons/react', () => ({
  ClipboardIcon: () => null,
  MapPinAreaIcon: () => null,
  MapPinLineIcon: () => null,
}));

vi.mock('$components/icons/phosphor', () => ({
  chipIcon: () => null,
  composerIcon: () => null,
  Warning: 'Warning',
  X: 'X',
}));

vi.mock('$components/modal-overlay/ModalOverlay', () => ({
  ModalOverlay: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('$state/settings', () => ({ settingsAtom: {} }));
vi.mock('$state/hooks/settings', () => ({
  useSetting: (_atom: unknown, key: string) => [key === 'showInteractiveMap', vi.fn()],
}));
vi.mock('$utils/dom', () => ({ readClipboardText: vi.fn() }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div>{children}</div>,
  Marker: () => null,
  TileLayer: () => null,
  useMapEvents: () => null,
}));

vi.mock('leaflet', () => {
  class Icon {}
  return {
    default: { Icon, Marker: class Marker {}, marker: () => ({ addTo: () => ({}) }) },
    Icon,
  };
});

describe('LocationDialog', () => {
  it('awaits the content callback and only closes after success', async () => {
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        })
    );
    const onCancel = vi.fn();
    const room = { hasEncryptionStateEvent: () => false } as any;

    render(<LocationDialog room={room} onCancel={onCancel} onSubmit={onSubmit} />);
    const submit = screen.getByRole('button', { name: 'Share Location' });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(submit).toBeDisabled();
    expect((onSubmit as any).mock.calls[0]?.[0]).toMatchObject({
      msgtype: 'm.location',
      geo_uri: expect.stringMatching(/^geo:/),
    });

    resolveSubmit();
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  });

  it('shows a retryable error when submission fails', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('Send failed'));
    const onCancel = vi.fn();
    const room = { hasEncryptionStateEvent: () => false } as any;

    render(<LocationDialog room={room} onCancel={onCancel} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share Location' }));

    await waitFor(() => expect(screen.getByText('Send failed')).toBeInTheDocument());
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Share Location' })).not.toBeDisabled();
  });
});
