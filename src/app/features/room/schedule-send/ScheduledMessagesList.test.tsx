/* oxlint-disable typescript/no-explicit-any, typescript/no-extraneous-class, unicorn/consistent-function-scoping, vitest/require-mock-type-parameters */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduledMessagesList } from './ScheduledMessagesList';
import type * as MatrixSdkModule from '$types/matrix-sdk';

const testState = vi.hoisted(() => ({
  cancelDelayedEvent: vi.fn(),
  coordinatorRun: vi.fn(),
  invalidateQueries: vi.fn(),
  matrix: {
    getSafeUserId: vi.fn(() => '@me:example.org'),
  },
}));

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => testState.matrix,
}));

vi.mock('$utils/delayedEvents', () => ({
  cancelDelayedEvent: testState.cancelDelayedEvent,
  getDelayedEvents: vi.fn(),
}));

vi.mock('$state/room/roomScheduleCoordinator', () => ({
  roomScheduleCoordinator: {
    run: testState.coordinatorRun,
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      delayed_events: [
        {
          delay_id: 'delay-1',
          room_id: '!room:example.org',
          type: 'm.room.message',
          content: { body: 'Scheduled message' },
          running_since: 1_000,
          delay: 60_000,
        },
      ],
    },
  }),
  useQueryClient: () => ({ invalidateQueries: testState.invalidateQueries }),
}));

vi.mock('$state/scheduledMessages', async () => {
  const { atom } = await import('jotai');
  const scheduledTimeAtom = atom<Date | null>(null);
  const editingScheduledDelayIdAtom = atom<string | null>(null);

  return {
    delayedEventsSupportedAtom: atom(true),
    getScheduledMessageStateKey: (userId: string, roomId: string) => `${userId}\0${roomId}`,
    roomIdToScheduledTimeAtomFamily: () => scheduledTimeAtom,
    roomIdToEditingScheduledDelayIdAtomFamily: () => editingScheduledDelayIdAtom,
  };
});

vi.mock('$state/hooks/settings', () => ({
  useSetting: (_atom: unknown, key: string) => [
    key === 'hour24Clock' ? false : 'YYYY-MM-DD',
    vi.fn(),
  ],
}));

vi.mock('$state/settings', () => ({ settingsAtom: {} }));

vi.mock('$types/matrix-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof MatrixSdkModule>()),
  MatrixEvent: class MatrixEvent {},
}));

vi.mock('$utils/time', () => ({
  timeDayMonthYear: () => '2026-07-28',
  timeHourMinute: () => '00:01',
}));

vi.mock('$components/message-preview', () => ({
  MessagePreview: ({ actions, event }: any) => (
    <div>
      <span>{event.getContent?.().body ?? 'Scheduled message'}</span>
      {actions}
    </div>
  ),
  useRoomMessagePreviewRenderer: () => vi.fn(),
}));

vi.mock('$components/icons/phosphor', () => ({
  CaretDown: 'CaretDown',
  CaretUp: 'CaretUp',
  Clock: 'Clock',
  Lock: 'Lock',
  PencilSimple: 'PencilSimple',
  X: 'X',
  chipIcon: () => null,
}));

vi.mock('folds', () => {
  const Box = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  const Text = ({ children, ...props }: any) => <span {...props}>{children}</span>;
  const Button = ({ children, ...props }: any) => <button {...props}>{children}</button>;

  return {
    Box,
    Chip: Button,
    IconButton: Button,
    Spinner: () => <span role="progressbar">Cancelling</span>,
    Text,
    config: {
      borderWidth: { B300: '1px' },
      space: { S100: '1px', S200: '2px', S400: '4px' },
    },
    toRem: (value: number) => `${value / 16}rem`,
  };
});

vi.mock('./SchedulePickerDialog', () => ({
  SchedulePickerDialog: () => null,
}));

const room = { roomId: '!room:example.org' } as any;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function renderExpandedList() {
  render(<ScheduledMessagesList room={room} />);
  fireEvent.click(screen.getByRole('button', { name: /1 scheduled message/i }));
  return screen.getByRole('button', { name: 'Cancel scheduled message' });
}

describe('ScheduledMessagesList cancellation', () => {
  beforeEach(() => {
    testState.cancelDelayedEvent.mockReset();
    testState.coordinatorRun.mockReset();
    testState.invalidateQueries.mockReset();
    testState.coordinatorRun.mockImplementation(
      (_mx: unknown, _roomId: string, operation: () => unknown) => operation()
    );
  });

  it('blocks duplicate cancellation clicks and shows pending state', () => {
    const pending = deferred<void>();
    testState.cancelDelayedEvent.mockReturnValue(pending.promise);

    const cancel = renderExpandedList();
    fireEvent.click(cancel);
    fireEvent.click(cancel);

    expect(testState.coordinatorRun).toHaveBeenCalledWith(
      testState.matrix,
      room.roomId,
      expect.any(Function)
    );
    expect(testState.cancelDelayedEvent).toHaveBeenCalledOnce();
    expect(cancel).toBeDisabled();
    expect(cancel).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows a retryable alert when cancellation fails', async () => {
    testState.cancelDelayedEvent.mockRejectedValueOnce(new Error('Cancel failed'));
    const cancel = renderExpandedList();

    fireEvent.click(cancel);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to cancel scheduled message. Try again.'
      )
    );
    expect(cancel).not.toBeDisabled();
    expect(cancel).not.toHaveAttribute('aria-busy', 'true');
  });

  it('successfully retries cancellation after a failure', async () => {
    testState.cancelDelayedEvent
      .mockRejectedValueOnce(new Error('Cancel failed'))
      .mockResolvedValueOnce(undefined);
    const cancel = renderExpandedList();

    fireEvent.click(cancel);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    fireEvent.click(cancel);

    await waitFor(() => expect(testState.cancelDelayedEvent).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(testState.invalidateQueries).toHaveBeenCalledOnce());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
