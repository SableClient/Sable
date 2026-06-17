import { describe, expect, it } from 'vitest';
import { readPersistedLaunchContext } from './launch-context-persistence';

describe('readPersistedLaunchContext', () => {
  it('parses persisted notification click launch context', () => {
    expect(
      readPersistedLaunchContext({
        source: 'notification_click',
        clickedAt: 123,
        userId: '@alice:example.org',
        roomId: '!room:example.org',
        eventId: '$event',
        targetUrl: 'https://example.org/to/%40alice%3Aexample.org/!room%3Aexample.org/%24event',
      })
    ).toEqual({
      source: 'notification_click',
      clickedAt: 123,
      userId: '@alice:example.org',
      roomId: '!room:example.org',
      eventId: '$event',
      targetUrl: 'https://example.org/to/%40alice%3Aexample.org/!room%3Aexample.org/%24event',
    });
  });

  it('rejects malformed launch context records', () => {
    expect(readPersistedLaunchContext({ source: 'notification_click' })).toBeUndefined();
    expect(readPersistedLaunchContext({ source: 'other', clickedAt: 123 })).toBeUndefined();
  });
});
