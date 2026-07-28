import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import type { PerMessageProfile } from '$hooks/usePerMessageProfile';
import { PersonaPicker, PersonaPickerTab } from './PersonaPicker';

const mocked = vi.hoisted(() => ({
  getAll: vi.fn<(mx: MatrixClient) => Promise<PerMessageProfile[]>>(),
  getRoom: vi.fn<(mx: MatrixClient, roomId: string) => Promise<PerMessageProfile | undefined>>(),
  getAccount: vi.fn<(mx: MatrixClient) => Promise<PerMessageProfile | undefined>>(),
  setRoom: vi.fn<(...args: unknown[]) => Promise<void>>(),
  setAccount: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));

vi.mock('$hooks/usePerMessageProfile', () => ({
  getAllPerMessageProfiles: mocked.getAll,
  getCurrentlyUsedPerMessageProfileForRoom: mocked.getRoom,
  getCurrentlyUsedPerMessageProfileForAccount: mocked.getAccount,
  setCurrentlyUsedPerMessageProfileIdForRoom: mocked.setRoom,
  setCurrentlyUsedPerMessageProfileIdForAccount: mocked.setAccount,
}));
vi.mock('$hooks/useMediaAuthentication.ts', () => ({ useMediaAuthentication: () => false }));
// useActiveTheme reaches for window.matchMedia, which jsdom does not provide.
vi.mock('$hooks/useTheme.ts', () => ({
  ThemeKind: { Light: 'light', Dark: 'dark' },
  useActiveTheme: () => ({ kind: 'light' }),
}));
vi.mock('$components/icons/phosphor', () => ({
  MagnifyingGlass: {},
  User: {},
  composerIcon: () => null,
  menuIcon: () => null,
}));
vi.mock('$components/ResponsiveMenu', () => ({
  ResponsiveMenu: ({ children, menu }: { children: ReactNode; menu: ReactNode }) => (
    <div>
      {children}
      {menu}
    </div>
  ),
}));
vi.mock('$components/user-avatar/UserAvatar.tsx', () => ({
  UserAvatar: ({ renderFallback }: { renderFallback: () => ReactNode }) => <>{renderFallback()}</>,
}));
vi.mock('$components/info-card/InfoCard.tsx', () => ({
  InfoCard: ({ description }: { description: ReactNode }) => <div>{description}</div>,
}));
vi.mock('@phosphor-icons/react', () => ({ InfoIcon: {} }));
vi.mock('$utils/matrix.ts', () => ({ mxcUrlToHttp: () => undefined }));
vi.mock('$utils/platform', () => ({ isMobileOrTablet: () => false }));
vi.mock('$utils/common', () => ({ nameInitials: (name: string) => name.slice(0, 1) }));
vi.mock('./PersonaPicker.css.ts', () => ({
  PersonaPickerMenuItem: '',
  PersonaPickerButtonAvatar: '',
  SelectedPersonaPickerButtonAvatar: '',
  PersonaPickerButtonAvatarImage: '',
}));

vi.mock('folds', async () => {
  const React = await import('react');
  const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>((props, ref) => (
    <input ref={ref} {...props} />
  ));
  const TestButton = ({ children, ...props }: React.ComponentProps<'button'>) =>
    React.createElement('button', props, children);
  const TestContainer = ({ children }: { children?: ReactNode }) =>
    React.createElement('div', null, children);

  return {
    Avatar: TestContainer,
    Badge: TestButton,
    Box: TestContainer,
    IconButton: TestButton,
    Input,
    Menu: TestContainer,
    MenuItem: TestButton,
    Scroll: TestContainer,
    Text: TestContainer,
    config: { space: { S200: 0 } },
    toRem: (value: number) => `${value}rem`,
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const profiles: PerMessageProfile[] = [
  { id: 'first', name: 'First' },
  { id: 'second', name: 'Second' },
];

function renderPicker(mx = {} as MatrixClient, tab = PersonaPickerTab.Global) {
  return render(
    <PersonaPicker
      tab={tab}
      mx={mx}
      roomId="!room:example.org"
      suppressEditorRefocus={vi.fn<() => void>()}
      onTabChange={vi.fn<(tab: PersonaPickerTab) => void>()}
      latchedPersona={undefined}
    />
  );
}

describe('PersonaPicker async flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getAll.mockResolvedValue(profiles);
    mocked.getRoom.mockResolvedValue(undefined);
    mocked.getAccount.mockResolvedValue(undefined);
    mocked.setRoom.mockResolvedValue(undefined);
    mocked.setAccount.mockResolvedValue(undefined);
  });

  it('ignores a stale profile fetch after the client changes', async () => {
    const firstClient = {} as MatrixClient;
    const secondClient = {} as MatrixClient;
    const firstFetch = deferred<PerMessageProfile[]>();
    const secondFetch = deferred<PerMessageProfile[]>();
    mocked.getAll.mockImplementation((client: MatrixClient) =>
      client === firstClient ? firstFetch.promise : secondFetch.promise
    );

    const view = renderPicker(firstClient);
    view.rerender(
      <PersonaPicker
        mx={secondClient}
        roomId="!room:example.org"
        suppressEditorRefocus={vi.fn<() => void>()}
        onTabChange={vi.fn<(tab: PersonaPickerTab) => void>()}
        latchedPersona={undefined}
      />
    );

    secondFetch.resolve([{ id: 'new', name: 'New' }]);
    expect(await screen.findByText('New')).toBeInTheDocument();
    firstFetch.resolve([{ id: 'old', name: 'Old' }]);

    await waitFor(() => expect(screen.queryByText('Old')).not.toBeInTheDocument());
  });

  it('does not update state when an in-flight profile fetch resolves after unmount', async () => {
    const fetch = deferred<PerMessageProfile[]>();
    mocked.getAll.mockReturnValue(fetch.promise);
    const view = renderPicker();
    view.unmount();

    fetch.resolve(profiles);
    await Promise.resolve();
    expect(screen.queryByText('First')).not.toBeInTheDocument();
  });

  it('commits an independent global sync when the room sync is still pending', async () => {
    const roomSync = deferred<PerMessageProfile | undefined>();
    mocked.getRoom.mockReturnValue(roomSync.promise);
    mocked.getAccount.mockResolvedValue(profiles[0]);
    renderPicker();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'First' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
    });

    roomSync.reject(new Error('room sync failed'));
  });

  it('keeps the latest optimistic selection when an earlier write fails', async () => {
    const firstWrite = deferred<void>();
    const secondWrite = deferred<void>();
    mocked.setAccount.mockImplementationOnce(() => firstWrite.promise);
    mocked.setAccount.mockImplementationOnce(() => secondWrite.promise);
    renderPicker();
    await screen.findByText('First');

    fireEvent.click(screen.getByRole('button', { name: 'First' }));
    fireEvent.click(screen.getByRole('button', { name: 'Second' }));

    firstWrite.reject(new Error('first write failed'));
    secondWrite.resolve();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Second' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
    });
  });

  it('rolls back a failed global selection without suppressing a room selection', async () => {
    const mx = {} as MatrixClient;
    const globalWrite = deferred<void>();
    const roomWrite = deferred<void>();
    mocked.setAccount.mockImplementationOnce(() => globalWrite.promise);
    mocked.setRoom.mockImplementationOnce(() => roomWrite.promise);
    const view = renderPicker(mx);
    await screen.findByText('First');

    fireEvent.click(screen.getByRole('button', { name: 'First' }));
    view.rerender(
      <PersonaPicker
        tab={PersonaPickerTab.PerRoom}
        mx={mx}
        roomId="!room:example.org"
        suppressEditorRefocus={vi.fn<() => void>()}
        onTabChange={vi.fn<(tab: PersonaPickerTab) => void>()}
        latchedPersona={undefined}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Second' }));

    globalWrite.reject(new Error('global write failed'));
    roomWrite.resolve();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Second' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
    });

    view.rerender(
      <PersonaPicker
        tab={PersonaPickerTab.Global}
        mx={mx}
        roomId="!room:example.org"
        suppressEditorRefocus={vi.fn<() => void>()}
        onTabChange={vi.fn<(tab: PersonaPickerTab) => void>()}
        latchedPersona={undefined}
      />
    );
    expect(screen.getByRole('button', { name: 'First' })).not.toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('reconciles an optimistic selection when its write is rejected', async () => {
    mocked.setAccount.mockRejectedValueOnce(new Error('write failed'));
    renderPicker();
    await screen.findByText('First');

    fireEvent.click(screen.getByRole('button', { name: 'First' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'First' })).not.toHaveAttribute(
        'aria-selected',
        'true'
      );
    });
  });
});
