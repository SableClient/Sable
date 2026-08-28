import { describe, expect, it } from 'vitest';
import { buildNotificationExtra } from './TauriNotificationsApiClient';

describe('buildNotificationExtra', () => {
  it('string-coerces all values of a flat routing payload', () => {
    expect(
      buildNotificationExtra({
        type: 'm.room.message',
        room_id: '!r:example.org',
        event_id: '$e:example.org',
        user_id: '@u:example.org',
      })
    ).toEqual({
      type: 'm.room.message',
      room_id: '!r:example.org',
      event_id: '$e:example.org',
      user_id: '@u:example.org',
    });
  });

  it('drops undefined keys', () => {
    expect(
      buildNotificationExtra({ type: 'm.room.message', room_id: '!r:x', event_id: undefined })
    ).toEqual({ type: 'm.room.message', room_id: '!r:x' });
  });

  it('drops null keys', () => {
    expect(buildNotificationExtra({ room_id: '!r:x', event_id: null })).toEqual({
      room_id: '!r:x',
    });
  });

  it('string-coerces non-string primitives', () => {
    expect(buildNotificationExtra({ count: 5, flagged: true })).toEqual({
      count: '5',
      flagged: 'true',
    });
  });

  it.each([undefined, null, 'not-an-object', 42])(
    'returns an empty record for non-object input (%s)',
    (input) => {
      expect(buildNotificationExtra(input)).toEqual({});
    }
  );
});
