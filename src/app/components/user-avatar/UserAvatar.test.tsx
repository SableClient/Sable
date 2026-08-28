import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const media = vi.hoisted(() => ({
  useAvatarMediaSource: vi.fn<
    (src: string | undefined) => {
      mediaSrc: string | undefined;
      error: boolean;
      onError: () => void;
    }
  >(),
}));

vi.mock('$hooks/useRenderableMediaUrl', () => media);

import { UserAvatar } from './UserAvatar';

const RAW_SRC = 'https://example.org/_matrix/client/v1/media/thumbnail/example.org/avatar';

const sourceResult = (mediaSrc: string | undefined, onError: () => void = () => {}) => ({
  mediaSrc,
  error: false,
  onError,
});

describe('UserAvatar', () => {
  beforeEach(() => {
    media.useAvatarMediaSource.mockReset();
  });

  it('waits for a renderable url instead of requesting the raw one', () => {
    media.useAvatarMediaSource.mockReturnValue(sourceResult(undefined));

    const { rerender } = render(
      <UserAvatar userId="@user:example.org" src={RAW_SRC} renderFallback={() => 'US'} />
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    media.useAvatarMediaSource.mockReturnValue(sourceResult('blob:resolved-avatar'));
    rerender(<UserAvatar userId="@user:example.org" src={RAW_SRC} renderFallback={() => 'US'} />);

    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:resolved-avatar');
  });

  it('falls back while the source reports a load error', () => {
    media.useAvatarMediaSource.mockReturnValue({
      mediaSrc: 'blob:resolved-avatar',
      error: true,
      onError: () => {},
    });

    const { rerender } = render(
      <UserAvatar userId="@user:example.org" src={RAW_SRC} renderFallback={() => 'US'} />
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    media.useAvatarMediaSource.mockReturnValue(sourceResult('blob:next-avatar'));
    rerender(<UserAvatar userId="@user:example.org" src={RAW_SRC} renderFallback={() => 'US'} />);

    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:next-avatar');
  });

  it('reports image load failures through the source error handler', () => {
    const onError = vi.fn<() => void>();
    media.useAvatarMediaSource.mockReturnValue(sourceResult('blob:resolved-avatar', onError));

    render(<UserAvatar userId="@user:example.org" src={RAW_SRC} renderFallback={() => 'US'} />);

    fireEvent.error(screen.getByRole('img'));

    expect(onError).toHaveBeenCalledTimes(1);
  });
});
