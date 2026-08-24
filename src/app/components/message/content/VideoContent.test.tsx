import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VideoContent } from './VideoContent';
import { getDebugLogger } from '$utils/debugLogger';

const mocks = vi.hoisted(() => ({ tauri: true, loopbackTargets: [] as string[] }));
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => mocks.tauri,
  // Real convertFileSrc percent-encodes the target into the URI path.
  convertFileSrc: (url: string, protocol: string) =>
    `${protocol}://localhost/${encodeURIComponent(url)}`,
  invoke: async (_command: string, { url }: { url: string }) => {
    mocks.loopbackTargets.push(url);
    return `http://127.0.0.1:45678/${mocks.loopbackTargets.length}`;
  },
}));

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({}),
}));
vi.mock('$hooks/useMediaAuthentication', () => ({
  useMediaAuthentication: () => true,
}));
vi.mock('$hooks/useObjectURL', () => ({
  useCreateObjectURL: () => (value: string) => value,
}));

const SABLE_MEDIA_URL =
  'sable-media://https://hs.example/_matrix/client/v1/media/download/example.org/vid123?__sable_media_cache=3';
vi.mock('$utils/matrix', () => ({
  mxcUrlToHttp: () => SABLE_MEDIA_URL,
  rewriteAuthenticatedMediaUrl: (url: string | null) => url,
  downloadMedia: vi.fn<() => Promise<ArrayBuffer>>(),
  downloadEncryptedMedia: vi.fn<() => Promise<ArrayBuffer>>(),
  decryptFile: vi.fn<() => Promise<ArrayBuffer>>(),
}));
vi.mock('$utils/swMediaAuth', () => ({
  probeSWMediaAuthSupport: async () => true,
}));

describe('VideoContent', () => {
  it('requests a distinct sable-media target from the loopback on retry in Tauri', async () => {
    mocks.loopbackTargets.length = 0;
    const srcs: string[] = [];
    render(
      <VideoContent
        body="clip"
        mimeType="video/mp4"
        url="mxc://example.org/vid123"
        info={{ w: 640, h: 360, duration: 1000 }}
        renderVideo={(props) => {
          srcs.push(props.src);
          return (
            <video data-testid="video" src={props.src} onError={props.onError}>
              <track kind="captions" />
            </video>
          );
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Watch' }));

    const video = await screen.findByTestId('video');
    await waitFor(() => {
      expect(srcs[srcs.length - 1]).toMatch(/^http:\/\/127\.0\.0\.1:45678\//);
      expect(mocks.loopbackTargets[mocks.loopbackTargets.length - 1]).toBe(SABLE_MEDIA_URL);
    });
    const initialSrc = mocks.loopbackTargets[mocks.loopbackTargets.length - 1];

    fireEvent.error(video);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      const retriedSrc = mocks.loopbackTargets[mocks.loopbackTargets.length - 1] ?? '';
      expect(retriedSrc).not.toBe(initialSrc);
      // The decoded scheme path is the `target` Rust feeds into cache_key.
      const schemePath = retriedSrc.replace(/^sable-media:\/\/localhost\//, '').split('?')[0]!;
      expect(decodeURIComponent(schemePath)).toMatch(
        /^https:\/\/hs\.example\/_matrix\/client\/v1\/media\/download\/example\.org\/vid123#__sable_media_retry=\d+$/
      );
      expect(retriedSrc).toContain('__sable_media_cache=3');
    });
  });

  it('records the video element failure in the diagnostics buffer', async () => {
    mocks.loopbackTargets.length = 0;
    getDebugLogger().clear();
    render(
      <VideoContent
        body="clip"
        mimeType="video/webm"
        url="mxc://example.org/vid123"
        info={{ w: 640, h: 360, duration: 1000 }}
        renderVideo={(props) => (
          <video data-testid="video" src={props.src} onError={props.onError}>
            <track kind="captions" />
          </video>
        )}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Watch' }));
    fireEvent.error(await screen.findByTestId('video'));

    // Error-level entries are buffered without debug logging enabled.
    const entry = getDebugLogger()
      .getLogs()
      .find((log) => log.category === 'media' && log.level === 'error');
    expect(entry?.message).toContain('Video element error');
    expect(entry?.message).toContain('mime=video/webm');
    expect(entry?.message).toContain('scheme=http');
  });
});
