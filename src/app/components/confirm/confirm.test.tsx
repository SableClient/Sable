import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScreenSize, ScreenSizeProvider } from '$hooks/useScreenSize';
import { confirm } from './confirm';
import { ConfirmHost } from './ConfirmHost';

afterEach(() => {
  cleanup();
});

function renderConfirmHost() {
  const container = document.createElement('div');
  container.id = 'portalContainer';
  document.body.appendChild(container);

  render(
    <ScreenSizeProvider value={ScreenSize.Desktop}>
      <ConfirmHost container={container} />
    </ScreenSizeProvider>
  );

  return container;
}

describe('confirm', () => {
  it('renders dialog text in DOM and resolves true on action button click', async () => {
    const user = userEvent.setup();
    const container = renderConfirmHost();

    const promise = confirm({
      title: 'Delete Account',
      description: 'This action cannot be undone.',
      action: 'Delete',
      variant: 'Critical',
    });

    // Dialog title and description must appear in the DOM
    expect(await screen.findByText('Delete Account')).toBeInTheDocument();
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();

    // Click the destructive button
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    // Promise must resolve true
    const result = await promise;
    expect(result).toBe(true);

    // Dialog must be removed
    expect(screen.queryByText('Delete Account')).not.toBeInTheDocument();

    container.remove();
  });

  it('resolves false when dismissed via close button', async () => {
    const user = userEvent.setup();
    const container = renderConfirmHost();

    const promise = confirm({
      title: 'Leave Room',
      description: 'Are you sure?',
      action: 'Leave',
      variant: 'Warning',
    });

    await screen.findByText('Leave Room');

    // Click the X close button
    await user.click(screen.getByRole('button', { name: 'Close' }));

    const result = await promise;
    expect(result).toBe(false);

    expect(screen.queryByText('Leave Room')).not.toBeInTheDocument();

    container.remove();
  });

  it('does not hang when called without a mounted host', () => {
    // confirm() must return a real Promise without a host, not throw.
    const promise = confirm({
      title: 'Orphan',
      description: 'No host mounted',
      action: 'OK',
      variant: 'Primary',
    });
    expect(promise).toBeInstanceOf(Promise);

    expect(() =>
      confirm({
        title: 'T',
        description: 'D',
        action: 'A',
        variant: 'Critical',
      })
    ).not.toThrow();
  });
});
