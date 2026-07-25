import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScreenSize, ScreenSizeProvider } from '$hooks/useScreenSize';
import { ModalOverlay } from './ModalOverlay';

const renderAt = (screenSize: ScreenSize, mobile: 'centred' | 'sheet' | 'fullscreen') =>
  render(
    <ScreenSizeProvider value={screenSize}>
      <ModalOverlay requestClose={vi.fn<() => void>()} mobile={mobile}>
        <button type="button">Confirm</button>
      </ModalOverlay>
    </ScreenSizeProvider>
  );

describe('ModalOverlay mobile presentation', () => {
  it('presents a sheet as a labelled dialog on mobile', () => {
    renderAt(ScreenSize.Mobile, 'sheet');

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('ignores the sheet presentation on desktop', () => {
    renderAt(ScreenSize.Desktop, 'sheet');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('keeps the centred presentation free of the sheet wrapper on mobile', () => {
    renderAt(ScreenSize.Mobile, 'centred');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });
});
