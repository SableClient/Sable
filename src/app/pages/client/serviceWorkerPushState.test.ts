import { describe, expect, it } from 'vitest';
import { SyncState } from '$types/matrix-sdk';
import {
  buildPushVisibilityResult,
  isMatrixSyncHealthy,
  resolvePushFallbackBanner,
} from './serviceWorkerPushState';

describe('service worker push state helpers', () => {
  it('treats prepared and syncing Matrix states as healthy', () => {
    expect(isMatrixSyncHealthy(SyncState.Prepared)).toBe(true);
    expect(isMatrixSyncHealthy(SyncState.Syncing)).toBe(true);
    expect(isMatrixSyncHealthy(SyncState.Reconnecting)).toBe(false);
    expect(isMatrixSyncHealthy(null)).toBe(false);
  });

  it('confirms visible and healthy only when the document is visible and sync is healthy', () => {
    expect(buildPushVisibilityResult('req-1', 'visible', SyncState.Syncing)).toEqual({
      type: 'pushVisibilityResult',
      requestId: 'req-1',
      visible: true,
      syncHealthy: true,
    });

    expect(buildPushVisibilityResult('req-2', 'visible', SyncState.Reconnecting)).toEqual({
      type: 'pushVisibilityResult',
      requestId: 'req-2',
      visible: true,
      syncHealthy: false,
    });

    expect(buildPushVisibilityResult('req-3', 'hidden', SyncState.Syncing)).toEqual({
      type: 'pushVisibilityResult',
      requestId: 'req-3',
      visible: false,
      syncHealthy: false,
    });
  });

  it('resolves fallback banner data for a room-targeted push', () => {
    expect(
      resolvePushFallbackBanner(
        {
          roomId: '!room:example.org',
          eventId: '$event',
          userId: '@alice:example.org',
          title: 'Room name',
          body: 'New message received.',
          senderName: 'Alice',
        },
        'fallback-id'
      )
    ).toEqual({
      id: '$event',
      title: 'Room name',
      roomName: undefined,
      serverName: 'example.org',
      senderName: 'Alice',
      body: 'New message received.',
      roomId: '!room:example.org',
      eventId: '$event',
      userId: '@alice:example.org',
      navigate: undefined,
    });
  });

  it('resolves fallback banner defaults for a generic push', () => {
    expect(resolvePushFallbackBanner({}, 'fallback-id')).toEqual({
      id: 'fallback-id',
      title: 'New Message',
      roomName: undefined,
      serverName: undefined,
      senderName: undefined,
      body: 'New message received.',
      roomId: undefined,
      eventId: undefined,
      userId: undefined,
      navigate: undefined,
    });
  });
});
