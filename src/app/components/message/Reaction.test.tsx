import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import { useSetting } from '$state/hooks/settings';
import * as css from './Reaction.css';
import { Reaction } from './Reaction';

vi.mock(import('$state/settings'), async (importOriginal) => ({
  ...(await importOriginal()),
  settingsAtom: {} as never,
}));

vi.mock('$state/hooks/settings', () => ({
  useSetting: vi.fn<typeof useSetting>(),
}));

const defaultSettingValues: Record<string, unknown> = {
  hideSingleReactionCount: false,
};

describe('Reaction', () => {
  beforeEach(() => {
    vi.mocked(useSetting).mockImplementation(((_atom: unknown, key: string) => {
      return [defaultSettingValues[key], vi.fn<() => void>()] as never;
    }) as never);
  });

  it('shows the count on single-reaction chips by default', () => {
    render(<Reaction mx={{ roomId: '' } as unknown as MatrixClient} count={1} reaction="😀" />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveClass(css.Reaction);
    expect(screen.getByRole('button')).not.toHaveClass(css.ReactionNoCount);
  });

  it('shows the count on multi-reaction chips by default', () => {
    render(<Reaction mx={{ roomId: '' } as unknown as MatrixClient} count={3} reaction="😀" />);

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('button')).not.toHaveClass(css.ReactionNoCount);
  });

  it('hides the count on single-reaction chips when the setting is enabled', () => {
    vi.mocked(useSetting).mockImplementation(((_atom: unknown, key: string) => {
      if (key === 'hideSingleReactionCount') {
        return [true, vi.fn<() => void>()] as never;
      }
      return [defaultSettingValues[key], vi.fn<() => void>()] as never;
    }) as never);

    render(<Reaction mx={{ roomId: '' } as unknown as MatrixClient} count={1} reaction="😀" />);

    expect(screen.getByText('😀')).toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveClass(css.ReactionNoCount);
  });

  it('keeps the count on multi-reaction chips when the setting is enabled', () => {
    vi.mocked(useSetting).mockImplementation(((_atom: unknown, key: string) => {
      if (key === 'hideSingleReactionCount') {
        return [true, vi.fn<() => void>()] as never;
      }
      return [defaultSettingValues[key], vi.fn<() => void>()] as never;
    }) as never);

    render(<Reaction mx={{ roomId: '' } as unknown as MatrixClient} count={2} reaction="😀" />);

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('button')).not.toHaveClass(css.ReactionNoCount);
  });
});
