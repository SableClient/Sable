import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScreenSize, ScreenSizeProvider } from '$hooks/useScreenSize';
import { Modal500 } from './Modal500';

describe('Modal500', () => {
  it('does not throw when rendered without tabbable children', () => {
    expect(() =>
      render(
        <ScreenSizeProvider value={ScreenSize.Desktop}>
          <Modal500 requestClose={vi.fn<() => void>()}>
            <div>Empty modal content</div>
          </Modal500>
        </ScreenSizeProvider>
      )
    ).not.toThrow();
  });
});
