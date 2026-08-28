import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAtomValue, useSetAtom, Provider } from 'jotai';
import { globalBannersAtom } from '$state/globalBanners';
import { triggerUpdateCheckAtom, updatePhaseAtom } from '$state/desktopUpdate';
import { DesktopUpdatePill } from '$components/tauri/DesktopUpdatePill';
import { getDebugLogger } from '$utils/debugLogger';
import { DesktopUpdater } from './DesktopUpdater';

const { checkFn, updaterEnabled } = vi.hoisted(() => ({
  checkFn: vi.fn<() => Promise<unknown>>(),
  updaterEnabled: vi.fn<() => boolean>(),
}));

vi.mock('@tauri-apps/plugin-updater', () => ({ check: checkFn }));

vi.mock('$utils/platform', async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return { ...mod, isDesktopTauri: () => true, isDesktopUpdaterEnabled: updaterEnabled };
});

vi.mock('$state/hooks/desktopSettings', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  useDesktopSetting: () => [true, vi.fn<() => void>()],
}));

vi.mock('$utils/tauriTitlebar', async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return { ...mod, hasCustomDesktopTitlebar: () => true };
});

function BannersProbe() {
  const banners = useAtomValue(globalBannersAtom);
  return (
    <div data-testid="banners">
      {banners.map((b) => (
        <section key={b.id} data-testid={`banner-${b.id}`}>
          <span>{b.title}</span>
          <span>{b.description}</span>
          <button type="button" onClick={b.primaryAction.onClick}>
            {b.primaryAction.label}
          </button>
          {b.secondaryAction && (
            <button type="button" onClick={b.secondaryAction.onClick}>
              {b.secondaryAction.label}
            </button>
          )}
        </section>
      ))}
    </div>
  );
}

function CheckNowButton() {
  const trigger = useSetAtom(triggerUpdateCheckAtom);
  return (
    <button type="button" onClick={() => trigger((c) => c + 1)}>
      check
    </button>
  );
}

function UpdatePhaseProbe() {
  const phase = useAtomValue(updatePhaseAtom);
  return <output data-testid="update-phase">{phase.type}</output>;
}

function makeUpdate(version: string) {
  return {
    version,
    body: `changelog ${version}`,
    downloadAndInstall: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  localStorage.clear();
  updaterEnabled.mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('DesktopUpdater', () => {
  it('does not check for or display updates when the updater is disabled at build time', async () => {
    updaterEnabled.mockReturnValue(false);
    localStorage.setItem('sable_fake_desktop_update', '1');

    render(
      <Provider>
        <DesktopUpdatePill />
        <DesktopUpdater />
        <BannersProbe />
      </Provider>
    );

    await waitFor(() => expect(checkFn).not.toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Update Available' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('banner-desktop-update-ready')).not.toBeInTheDocument();
  });

  it('reopens the update banner from the pill after dismissing it', async () => {
    localStorage.setItem('sable_fake_desktop_update', '1');

    render(
      <Provider>
        <DesktopUpdatePill />
        <DesktopUpdater />
        <BannersProbe />
      </Provider>
    );

    const pill = await screen.findByRole('button', { name: 'Update Available' });
    expect(screen.queryByTestId('banner-desktop-update-ready')).not.toBeInTheDocument();

    fireEvent.click(pill);
    await screen.findByTestId('banner-desktop-update-ready');
    expect(screen.getByRole('button', { name: 'Download & Install' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    await waitFor(() => {
      expect(screen.queryByTestId('banner-desktop-update-ready')).not.toBeInTheDocument();
    });
    const pillAgain = await screen.findByRole('button', { name: 'Update Available' });

    fireEvent.click(pillAgain);
    await screen.findByTestId('banner-desktop-update-ready');
    expect(screen.getByRole('button', { name: 'Download & Install' })).toBeInTheDocument();
  });

  it('releases the previous update handle when a new check replaces it after a dismiss', async () => {
    const update1 = makeUpdate('1.0.0');
    const update2 = makeUpdate('2.0.0');
    checkFn.mockResolvedValueOnce(update1).mockResolvedValueOnce(update2);

    render(
      <Provider>
        <DesktopUpdatePill />
        <DesktopUpdater />
        <BannersProbe />
        <CheckNowButton />
      </Provider>
    );

    await waitFor(() => expect(checkFn).toHaveBeenCalledTimes(1));
    const pill = await screen.findByRole('button', { name: 'Update Available' });

    fireEvent.click(pill);
    await screen.findByTestId('banner-desktop-update-ready');
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    await waitFor(() => {
      expect(screen.queryByTestId('banner-desktop-update-ready')).not.toBeInTheDocument();
    });
    expect(update1.close).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'check' }));
    await waitFor(() => expect(update1.close).toHaveBeenCalledTimes(1));
    expect(update2.close).not.toHaveBeenCalled();
  });

  it('downloads then installs and prompts to restart', async () => {
    const update = makeUpdate('3.0.0');
    checkFn.mockResolvedValue(update);

    render(
      <Provider>
        <DesktopUpdatePill />
        <DesktopUpdater />
        <BannersProbe />
      </Provider>
    );

    const pill = await screen.findByRole('button', { name: 'Update Available' });
    fireEvent.click(pill);
    await screen.findByTestId('banner-desktop-update-ready');

    fireEvent.click(screen.getByRole('button', { name: 'Download & Install' }));
    await waitFor(() => expect(update.downloadAndInstall).toHaveBeenCalled());
    await screen.findByTestId('banner-desktop-update-restart');
    expect(screen.getByRole('button', { name: 'Restart Now' })).toBeInTheDocument();
  });

  it('retries when downloadAndInstall fails', async () => {
    const update = makeUpdate('4.0.0');
    const debugLog = vi.spyOn(getDebugLogger(), 'log');
    update.downloadAndInstall
      .mockRejectedValueOnce({ message: 'permission denied' })
      .mockResolvedValueOnce(undefined);
    checkFn.mockResolvedValue(update);

    render(
      <Provider>
        <DesktopUpdatePill />
        <DesktopUpdater />
        <BannersProbe />
        <UpdatePhaseProbe />
      </Provider>
    );

    const pill = await screen.findByRole('button', { name: 'Update Available' });
    fireEvent.click(pill);
    await screen.findByTestId('banner-desktop-update-ready');

    fireEvent.click(screen.getByRole('button', { name: 'Download & Install' }));
    await waitFor(() => expect(update.downloadAndInstall).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.getByText('Update Failed')).toBeInTheDocument();
    });
    expect(debugLog).toHaveBeenCalledWith(
      'error',
      'network',
      'DesktopUpdater',
      'Failed to install update: permission denied'
    );
    expect(screen.getByText('permission denied')).toBeInTheDocument();
    expect(screen.getByTestId('update-phase')).toHaveTextContent('ready');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(update.downloadAndInstall).toHaveBeenCalledTimes(2));
    await screen.findByTestId('banner-desktop-update-restart');
  });
});
