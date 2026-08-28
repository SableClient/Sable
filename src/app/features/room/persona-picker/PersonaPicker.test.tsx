import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientEvent, type MatrixClient, type MatrixEvent } from 'matrix-js-sdk';
import type { PerMessageProfileMsc4461 } from '$app/persona';
import { MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME } from '$unstable/prefixes';
import { PersonaPicker, PersonaPickerTab, useProfiles } from './PersonaPicker';

const mocked = vi.hoisted(() => ({
  getAll: vi.fn<(mx: MatrixClient) => Promise<PerMessageProfileMsc4461[]>>(),
  getRoom:
    vi.fn<(mx: MatrixClient, roomId: string) => Promise<PerMessageProfileMsc4461 | undefined>>(),
  getAccount: vi.fn<(mx: MatrixClient) => Promise<PerMessageProfileMsc4461 | undefined>>(),
  setRoom: vi.fn<(...args: unknown[]) => Promise<void>>(),
  setAccount: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));

const grabPersonaButton = (name: string) => {
  const btn = screen.getByText(name).parentElement!.parentElement!;
  if (btn.tagName !== 'BUTTON') throw new Error('Not a button, DOM layout changed!');
  return btn;
};

vi.mock('$app/persona/catalog', () => ({
  isPersonaAccountDataEvent: (eventType: string) =>
    eventType === 'fi.mau.msc4461.per_message_profiles.v2' ||
    eventType.startsWith('fyi.cisnt.permessageprofile.'),
  ProfileCatalog: class {
    constructor(private readonly mx: MatrixClient) {}

    list() {
      return mocked.getAll(this.mx);
    }

    async getSelection(scope: 'account' | { roomId: string }) {
      const persona =
        scope === 'account'
          ? await mocked.getAccount(this.mx)
          : await mocked.getRoom(this.mx, scope.roomId);
      return persona ? { persona } : undefined;
    }

    setSelection(
      scope: 'account' | { roomId: string },
      profileId: string | undefined,
      validUntil?: number,
      reset?: boolean
    ) {
      return scope === 'account'
        ? mocked.setAccount(this.mx, profileId, validUntil, reset)
        : mocked.setRoom(this.mx, scope.roomId, profileId, validUntil, reset);
    }
  },
}));
vi.mock('$hooks/useMediaAuthentication.ts', () => ({ useMediaAuthentication: () => false }));
vi.mock('$hooks/usePerMessageProfile.ts', () => ({
  usePersonaCosmetics: () => ({
    avatarUrl: () => undefined,
    nameColor: () => undefined,
  }),
}));
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
vi.mock('$utils/platform', () => ({
  hasServiceWorker: () => false,
  isMobileOrTablet: () => false,
}));
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
    color: { Surface: { OnContainer: '#000000' } },
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

const profiles: PerMessageProfileMsc4461[] = [
  { id: 'first', displayname: 'First' },
  { id: 'second', displayname: 'Second' },
];

type TestMatrixClient = MatrixClient & { emitAccountData: (type: string) => void };

function createMatrixClient(): TestMatrixClient {
  const accountDataHandlers = new Set<(event: MatrixEvent) => void>();
  return {
    on(event: ClientEvent, handler: (accountData: MatrixEvent) => void) {
      if (event === ClientEvent.AccountData) accountDataHandlers.add(handler);
    },
    removeListener(event: ClientEvent, handler: (accountData: MatrixEvent) => void) {
      if (event === ClientEvent.AccountData) accountDataHandlers.delete(handler);
    },
    emitAccountData(type: string) {
      const accountData = { getType: () => type } as MatrixEvent;
      accountDataHandlers.forEach((handler) => handler(accountData));
    },
  } as TestMatrixClient;
}

function renderPicker(mx: MatrixClient = createMatrixClient(), tab = PersonaPickerTab.Global) {
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
    const firstClient = createMatrixClient();
    const secondClient = createMatrixClient();
    const firstFetch = deferred<PerMessageProfileMsc4461[]>();
    const secondFetch = deferred<PerMessageProfileMsc4461[]>();
    mocked.getAll.mockImplementation((client: MatrixClient) =>
      client === firstClient ? firstFetch.promise : secondFetch.promise
    );

    const mountedRef = { current: true };
    const generationRef = { current: 0 };
    const view = renderHook(({ mx }) => useProfiles(mx, mountedRef, generationRef), {
      initialProps: { mx: firstClient },
    });
    await waitFor(() => expect(mocked.getAll).toHaveBeenCalledWith(firstClient));
    view.rerender({ mx: secondClient });

    await act(async () => {
      secondFetch.resolve([{ id: 'new', displayname: 'New' }]);
      await secondFetch.promise;
    });
    await waitFor(() => expect(view.result.current.profiles?.[0]?.id).toBe('new'));
    await act(async () => {
      firstFetch.resolve([{ id: 'old', displayname: 'Old' }]);
      await firstFetch.promise;
    });

    expect(view.result.current.profiles?.[0]?.id).toBe('new');
  });

  it('refreshes profiles when persona account data arrives after initial sync', async () => {
    const mx = createMatrixClient();
    mocked.getAll.mockResolvedValueOnce([]).mockResolvedValueOnce(profiles);
    const mountedRef = { current: true };
    const generationRef = { current: 0 };
    const view = renderHook(() => useProfiles(mx, mountedRef, generationRef));

    await waitFor(() => expect(view.result.current.profiles).toEqual([]));
    act(() => {
      mx.emitAccountData(
        `${MATRIX_SABLE_UNSTABLE_ACCOUNT_PER_MESSAGE_PROFILES_PROPERTY_NAME}.index`
      );
    });

    await waitFor(() => expect(view.result.current.profiles).toEqual(profiles));
  });

  it('does not update state when an in-flight profile fetch resolves after unmount', async () => {
    const fetch = deferred<PerMessageProfileMsc4461[]>();
    mocked.getAll.mockReturnValue(fetch.promise);
    const view = renderPicker();
    view.unmount();

    fetch.resolve(profiles);
    await Promise.resolve();
    expect(screen.queryByText('First')).not.toBeInTheDocument();
  });

  it('renders while profiles are loading', async () => {
    mocked.getAll.mockReturnValue(new Promise<PerMessageProfileMsc4461[]>(() => {}));
    renderPicker();

    await waitFor(() => expect(mocked.getAll).toHaveBeenCalled());
  });

  it('commits an independent global sync when the room sync is still pending', async () => {
    const roomSync = deferred<PerMessageProfileMsc4461 | undefined>();
    mocked.getRoom.mockReturnValue(roomSync.promise);
    mocked.getAccount.mockResolvedValue(profiles[0]);
    renderPicker();

    await waitFor(() => {
      expect(grabPersonaButton('First')).toHaveAttribute('aria-selected', 'true');
    });

    roomSync.reject(new Error('room sync failed'));
  });

  it('clears the optimistic selection when disabling the active persona', async () => {
    mocked.getAccount.mockResolvedValue(profiles[0]);
    renderPicker();

    await waitFor(() => {
      expect(grabPersonaButton('First')).toHaveAttribute('aria-selected', 'true');
    });

    fireEvent.click(grabPersonaButton('First'));

    expect(grabPersonaButton('First')).not.toHaveAttribute('aria-selected', 'true');
    expect(mocked.setAccount).toHaveBeenCalledWith(expect.anything(), undefined, undefined, true);
  });

  it('keeps the latest optimistic selection when an earlier write fails', async () => {
    const firstWrite = deferred<void>();
    const secondWrite = deferred<void>();
    mocked.setAccount.mockImplementationOnce(() => firstWrite.promise);
    mocked.setAccount.mockImplementationOnce(() => secondWrite.promise);
    renderPicker();
    await screen.findByText('First');

    fireEvent.click(grabPersonaButton('First'));
    fireEvent.click(grabPersonaButton('Second'));

    firstWrite.reject(new Error('first write failed'));
    secondWrite.resolve();

    await waitFor(() => {
      expect(grabPersonaButton('Second')).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('rolls back a failed global selection without suppressing a room selection', async () => {
    const mx = createMatrixClient();
    const globalWrite = deferred<void>();
    const roomWrite = deferred<void>();
    mocked.setAccount.mockImplementationOnce(() => globalWrite.promise);
    mocked.setRoom.mockImplementationOnce(() => roomWrite.promise);
    const view = renderPicker(mx);
    await screen.findByText('First');

    fireEvent.click(grabPersonaButton('First'));
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
    fireEvent.click(grabPersonaButton('Second'));

    globalWrite.reject(new Error('global write failed'));
    roomWrite.resolve();

    await waitFor(() => {
      expect(grabPersonaButton('Second')).toHaveAttribute('aria-selected', 'true');
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
    expect(grabPersonaButton('First')).not.toHaveAttribute('aria-selected', 'true');
  });

  it('reconciles an optimistic selection when its write is rejected', async () => {
    mocked.setAccount.mockRejectedValueOnce(new Error('write failed'));
    renderPicker();
    await screen.findByText('First');

    fireEvent.click(grabPersonaButton('First'));

    await waitFor(() => {
      expect(grabPersonaButton('First')).not.toHaveAttribute('aria-selected', 'true');
    });
  });
});
