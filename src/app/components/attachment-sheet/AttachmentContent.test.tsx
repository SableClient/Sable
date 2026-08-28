import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AttachmentContent } from './AttachmentContent';

describe('AttachmentContent', () => {
  it('dispatches native attachment actions synchronously and suppresses focus restore', () => {
    const skipReturnFocusRef = { current: false };
    const onPickPhotos = vi.fn<() => void>();

    render(
      <AttachmentContent
        onPickPhotos={onPickPhotos}
        onPickFile={vi.fn<() => void>()}
        onPickPoll={vi.fn<() => void>()}
        onPickLocation={vi.fn<() => void>()}
        skipReturnFocusRef={skipReturnFocusRef}
      />
    );

    screen.getByRole('button', { name: 'Open photo gallery' }).click();

    expect(onPickPhotos).toHaveBeenCalledOnce();
    expect(skipReturnFocusRef.current).toBe(true);
  });
});
