/* oxlint-disable typescript/no-explicit-any, react/void-dom-elements-no-children, vitest/require-mock-type-parameters, unicorn/consistent-function-scoping */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PollDialog } from './PollDialog';

vi.mock('folds', () => {
  const div = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  const button = ({ children, ...props }: any) => <button {...props}>{children}</button>;
  const input = (props: any) => <input {...props} />;
  return {
    Dialog: div,
    Header: div,
    Box: div,
    Text: div,
    IconButton: button,
    Button: button,
    Input: input,
    Chip: button,
    Switch: ({ value, onChange }: any) => (
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
    ),
    Scroll: div,
    color: { Critical: { OnContainer: 'red' } },
  };
});

vi.mock('$components/icons/phosphor', () => ({
  chipIcon: () => null,
  composerIcon: () => null,
  ListBullets: 'ListBullets',
  Minus: 'Minus',
  X: 'X',
}));

vi.mock('$components/setting-tile', () => ({
  SettingTile: ({ children, after }: any) => (
    <div>
      {children}
      {after}
    </div>
  ),
}));

vi.mock('$components/sequence-card', () => ({
  SequenceCard: ({ children }: any) => <div>{children}</div>,
  SequenceCardStyle: '',
}));

vi.mock('$components/modal-overlay/ModalOverlay', () => ({
  ModalOverlay: ({ children }: any) => <div>{children}</div>,
}));

describe('PollDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('awaits submission, prevents duplicates, and closes after success', async () => {
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        })
    );
    const onCancel = vi.fn();

    render(<PollDialog onCancel={onCancel} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Insert Title'), {
      target: { value: 'Dinner' },
    });
    fireEvent.change(screen.getByLabelText('Type Option 1'), {
      target: { value: 'Pizza' },
    });
    fireEvent.change(screen.getByLabelText('Type Option 2'), {
      target: { value: 'Pasta' },
    });

    const submit = screen.getByRole('button', { name: 'Create Poll' });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(submit).toBeDisabled();
    expect((onSubmit as any).mock.calls[0]?.[0]).toMatchObject({
      'org.matrix.msc3381.poll.start': expect.objectContaining({
        question: expect.objectContaining({ body: 'Dinner' }),
      }),
    });

    resolveSubmit();
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  });

  it('keeps the dialog open and shows a retryable error when submission fails', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('Send failed'));
    const onCancel = vi.fn();

    render(<PollDialog onCancel={onCancel} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Insert Title'), {
      target: { value: 'Dinner' },
    });
    fireEvent.change(screen.getByLabelText('Type Option 1'), {
      target: { value: 'Pizza' },
    });
    fireEvent.change(screen.getByLabelText('Type Option 2'), {
      target: { value: 'Pasta' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create Poll' }));

    await waitFor(() => expect(screen.getByText('Send failed')).toBeInTheDocument());
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create Poll' })).not.toBeDisabled();
  });
});
