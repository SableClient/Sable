import { describe, expect, it, vi } from 'vitest';
import { matchRoomRoute } from './roomRouteMatch';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: () => undefined }));

const roomId = '!room:example.com';
const encodedRoomId = encodeURIComponent(roomId);
const eventId = '$event-id';

describe('matchRoomRoute', () => {
  it('matches a bare room route in every section', () => {
    expect(matchRoomRoute(`/home/${encodedRoomId}/`)).toEqual({
      roomIdOrAlias: roomId,
      eventId: undefined,
    });
    expect(matchRoomRoute(`/direct/${encodedRoomId}/`)).toEqual({
      roomIdOrAlias: roomId,
      eventId: undefined,
    });
    expect(matchRoomRoute(`/!space:example.com/${encodedRoomId}/`)).toEqual({
      roomIdOrAlias: roomId,
      eventId: undefined,
    });
  });

  it('matches a room route with an event id', () => {
    expect(matchRoomRoute(`/home/${encodedRoomId}/${encodeURIComponent(eventId)}/`)).toEqual({
      roomIdOrAlias: roomId,
      eventId,
    });
  });

  it('rejects forum routes', () => {
    expect(matchRoomRoute(`/home/${encodedRoomId}/forum/`)).toBeUndefined();
    expect(matchRoomRoute(`/direct/${encodedRoomId}/forum/`)).toBeUndefined();
    expect(matchRoomRoute(`/!space:example.com/${encodedRoomId}/forum/`)).toBeUndefined();
  });

  it('drops a second segment that is not an event id', () => {
    expect(matchRoomRoute(`/home/${encodedRoomId}/anything/`)).toEqual({
      roomIdOrAlias: roomId,
      eventId: undefined,
    });
  });

  it('rejects non-room first segments', () => {
    expect(matchRoomRoute('/home/create/')).toBeUndefined();
    expect(matchRoomRoute('/!space:example.com/lobby/')).toBeUndefined();
  });
});
