import { act, renderHook } from '@testing-library/react';
import { EventEmitter } from 'events';
import { describe, expect, it } from 'vitest';
import { EventType, RoomStateEvent } from '$types/matrix-sdk';
import type { MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import { MatrixClientProvider } from './useMatrixClient';
import { useRoomsPowerLevels } from './usePowerLevels';

describe('useRoomsPowerLevels', () => {
  it('re-derives permissions when a room create event arrives', () => {
    const client = new EventEmitter();
    let powerLevelsEvent: MatrixEvent | undefined;
    const room = {
      roomId: '!space:example.org',
      getLiveTimeline: () => ({
        getState: () => ({
          getStateEvents: (type: string) =>
            type === EventType.RoomPowerLevels ? powerLevelsEvent : undefined,
        }),
      }),
    } as unknown as Room;
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MatrixClientProvider value={client as unknown as MatrixClient}>
        {children}
      </MatrixClientProvider>
    );
    const rooms = [room];

    const { result } = renderHook(() => useRoomsPowerLevels(rooms), { wrapper });
    expect(result.current.get(room.roomId)?.users_default).toBe(0);

    powerLevelsEvent = {
      getContent: () => ({ users_default: 75 }),
    } as unknown as MatrixEvent;
    const createEvent = {
      getRoomId: () => room.roomId,
      getType: () => EventType.RoomCreate,
      getStateKey: () => '',
    } as unknown as MatrixEvent;
    act(() => {
      client.emit(RoomStateEvent.Events, createEvent);
    });

    expect(result.current.get(room.roomId)?.users_default).toBe(75);
  });
});
