import { describe, expect, it } from 'vitest';
import { EventDirection, MatrixCapabilities, WidgetEventCapability } from 'matrix-widget-api';
import { getCallCapabilities } from './utils';

describe('getCallCapabilities', () => {
  const roomId = '!room:example.org';
  const userId = '@alice:example.org';
  const deviceId = 'ALICEDEVICE';

  it('includes delayed-event capabilities', () => {
    const capabilities = getCallCapabilities(roomId, userId, deviceId);

    expect(capabilities.has(MatrixCapabilities.MSC4157SendDelayedEvent)).toBe(true);
    expect(capabilities.has(MatrixCapabilities.MSC4157UpdateDelayedEvent)).toBe(true);
  });

  it('includes upload and download media capabilities', () => {
    const capabilities = getCallCapabilities(roomId, userId, deviceId);

    expect(capabilities.has(MatrixCapabilities.MSC4039UploadFile)).toBe(true);
    expect(capabilities.has(MatrixCapabilities.MSC4039DownloadFile)).toBe(true);
  });

  it('includes call member state send/receive capabilities', () => {
    const capabilities = getCallCapabilities(roomId, userId, deviceId);

    expect(
      capabilities.has(
        WidgetEventCapability.forStateEvent(
          EventDirection.Send,
          'org.matrix.msc3401.call.member',
          userId
        ).raw
      )
    ).toBe(true);
    expect(
      capabilities.has(
        WidgetEventCapability.forStateEvent(
          EventDirection.Receive,
          'org.matrix.msc3401.call.member'
        ).raw
      )
    ).toBe(true);
  });

  it('includes rtc notification and decline send/receive capabilities', () => {
    const capabilities = getCallCapabilities(roomId, userId, deviceId);

    expect(
      capabilities.has(
        WidgetEventCapability.forRoomEvent(
          EventDirection.Send,
          'org.matrix.msc4075.rtc.notification'
        ).raw
      )
    ).toBe(true);
    expect(
      capabilities.has(
        WidgetEventCapability.forRoomEvent(
          EventDirection.Receive,
          'org.matrix.msc4075.rtc.notification'
        ).raw
      )
    ).toBe(true);
    expect(
      capabilities.has(
        WidgetEventCapability.forRoomEvent(EventDirection.Send, 'org.matrix.msc4310.rtc.decline')
          .raw
      )
    ).toBe(true);
    expect(
      capabilities.has(
        WidgetEventCapability.forRoomEvent(EventDirection.Receive, 'org.matrix.msc4310.rtc.decline')
          .raw
      )
    ).toBe(true);
  });
});
