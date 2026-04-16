import { describe, expect, it, vi } from 'vitest';
import { CallWidgetDriver } from './CallWidgetDriver';

const downloadMedia = vi.fn();
const mxcUrlToHttp = vi.fn();

vi.mock('matrix-widget-api', () => ({
  WidgetDriver: function WidgetDriver() {
    return undefined;
  },
  OpenIDRequestState: { Allowed: 'allowed' },
  SimpleObservable: function SimpleObservable() {
    return undefined;
  },
  UpdateDelayedEventAction: {},
}));

vi.mock('./utils', () => ({
  getCallCapabilities: () => new Set(),
}));

vi.mock('../../utils/debugLogger', () => ({
  createDebugLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../utils/matrix', () => ({
  downloadMedia: (...args: unknown[]) => downloadMedia(...args),
  mxcUrlToHttp: (...args: unknown[]) => mxcUrlToHttp(...args),
}));

describe('CallWidgetDriver.downloadFile', () => {
  it('passes the widget client auth scope through media downloads', async () => {
    mxcUrlToHttp.mockReturnValue('https://example.org/media');
    downloadMedia.mockResolvedValue(new Blob(['file']));

    const mx = {
      getDeviceId: () => 'DEVICE',
      getSafeUserId: () => '@alice:example.org',
      getUserId: () => '@alice:example.org',
      getAccessToken: () => 'widget-token',
    };

    const driver = new CallWidgetDriver(mx as never, '!room:example.org');

    await driver.downloadFile('mxc://example.org/media');

    expect(downloadMedia).toHaveBeenCalledWith(
      'https://example.org/media',
      expect.objectContaining({
        getAccessToken: expect.any(Function),
        sessionScope: '@alice:example.org',
      })
    );
    const [, options] = downloadMedia.mock.calls[0];
    expect(options.getAccessToken()).toBe('widget-token');
  });
});
