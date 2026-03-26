import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SettingTile } from '$components/setting-tile';
import { ScreenSize, ScreenSizeProvider } from '$hooks/useScreenSize';
import { SettingsSectionPage } from './SettingsSectionPage';
import { focusedSettingTile } from './styles.css';
import { useSettingsFocus } from './useSettingsFocus';

function FocusFixture() {
  useSettingsFocus();

  return (
    <div>
      <SettingTile focusId="message-link-preview">focus target</SettingTile>
    </div>
  );
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.search}</div>;
}

describe('SettingsSectionPage', () => {
  it('shows a back affordance on mobile section pages', () => {
    render(
      <ScreenSizeProvider value={ScreenSize.Mobile}>
        <SettingsSectionPage title="Devices" requestClose={vi.fn()} />
      </ScreenSizeProvider>
    );

    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('supports custom title semantics and close label', () => {
    render(
      <ScreenSizeProvider value={ScreenSize.Desktop}>
        <SettingsSectionPage
          title="Keyboard Shortcuts"
          titleAs="h1"
          actionLabel="Close keyboard shortcuts"
          requestClose={vi.fn()}
        />
      </ScreenSizeProvider>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Keyboard Shortcuts');
    expect(screen.getByRole('button', { name: 'Close keyboard shortcuts' })).toBeInTheDocument();
  });
});

describe('useSettingsFocus', () => {
  it('highlights a focus target from the query string', async () => {
    vi.useFakeTimers();

    try {
      render(
        <MemoryRouter initialEntries={['/settings/appearance?focus=message-link-preview']}>
          <ScreenSizeProvider value={ScreenSize.Mobile}>
            <LocationProbe />
            <FocusFixture />
          </ScreenSizeProvider>
        </MemoryRouter>
      );

      const target = document.querySelector('[data-settings-focus="message-link-preview"]');
      expect(target).toHaveClass(focusedSettingTile);
      expect(screen.getByTestId('location-probe')).toHaveTextContent('?focus=message-link-preview');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2999);
      });
      expect(screen.getByTestId('location-probe')).toHaveTextContent('?focus=message-link-preview');
      expect(target).toHaveClass(focusedSettingTile);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(screen.getByTestId('location-probe')).toHaveTextContent('');
      expect(target).not.toHaveClass(focusedSettingTile);
    } finally {
      vi.useRealTimers();
    }
  });
});
