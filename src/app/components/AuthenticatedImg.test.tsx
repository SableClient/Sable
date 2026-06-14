/* oxlint-disable vitest/require-mock-type-parameters */
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedImg } from './AuthenticatedImg';

const renderableMedia = vi.hoisted(() => ({
  useRenderableMediaUrl: vi.fn(),
}));

vi.mock('$hooks/useRenderableMediaUrl', () => renderableMedia);

describe('AuthenticatedImg', () => {
  beforeEach(() => {
    renderableMedia.useRenderableMediaUrl.mockReset();
    vi.unstubAllGlobals();
  });

  it('renders the image when the hook resolves a safe media url', () => {
    renderableMedia.useRenderableMediaUrl.mockReturnValue('https://example.org/image.png');

    render(<AuthenticatedImg src="https://example.org/image.png" alt="safe media" />);

    expect(renderableMedia.useRenderableMediaUrl).toHaveBeenCalledWith(
      'https://example.org/image.png'
    );
    expect(screen.getByAltText('safe media')).toHaveAttribute(
      'src',
      'https://example.org/image.png'
    );
  });

  it('drops unsafe image urls when media resolution does not provide a safe replacement', () => {
    renderableMedia.useRenderableMediaUrl.mockReturnValue(undefined);
    const unsafeUrl = ['javascript', 'alert(1)'].join(':');
    const { container } = render(<AuthenticatedImg src={unsafeUrl} alt="unsafe media" />);

    expect(screen.queryByAltText('unsafe media')).not.toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders the fallback when no safe image url is available', () => {
    renderableMedia.useRenderableMediaUrl.mockReturnValue(undefined);
    const unsafeUrl = ['javascript', 'alert(1)'].join(':');

    render(
      <AuthenticatedImg src={unsafeUrl} alt="unsafe media" fallback={<span>fallback media</span>} />
    );

    expect(screen.getByText('fallback media')).toBeInTheDocument();
  });

  it('defers lazy media resolution until the placeholder intersects', () => {
    let handleIntersection: IntersectionObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(function MockIntersectionObserver(callback: IntersectionObserverCallback) {
        handleIntersection = callback;
        return {
          observe,
          disconnect,
          unobserve: vi.fn(),
          takeRecords: vi.fn(() => []),
        };
      })
    );
    renderableMedia.useRenderableMediaUrl.mockImplementation((url: string | undefined) =>
      url ? 'blob:https://example.org/rendered-image' : undefined
    );

    render(
      <AuthenticatedImg src="https://example.org/image.png" alt="lazy media" loading="lazy" />
    );

    const placeholder = screen.getByAltText('lazy media');
    expect(renderableMedia.useRenderableMediaUrl).toHaveBeenLastCalledWith(undefined);
    expect(placeholder).not.toHaveAttribute('src');
    expect(observe).toHaveBeenCalledWith(placeholder);

    act(() => {
      handleIntersection?.(
        [
          {
            isIntersecting: true,
            intersectionRatio: 1,
            target: placeholder,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver
      );
    });

    expect(renderableMedia.useRenderableMediaUrl).toHaveBeenLastCalledWith(
      'https://example.org/image.png'
    );
    expect(screen.getByAltText('lazy media')).toHaveAttribute(
      'src',
      'blob:https://example.org/rendered-image'
    );
    expect(disconnect).toHaveBeenCalled();
  });
});
