import { getMxIdServer } from '$utils/mxIdHelper';
import { creatorsSupported } from '$utils/roomSupport';
import type { Room } from '$types/matrix-sdk';
import type { IRoomCreateContent } from '$types/matrix/room';
import type { IPowerLevels } from '$hooks/usePowerLevels';
import { getStateEvent } from '$utils/room';
import { EventType } from '$types/matrix-sdk';

export const getViaServers = (room: Room): string[] => {
  const getHighestPowerUserId = (): string | undefined => {
    const creatorEvent = getStateEvent(room, EventType.RoomCreate);
    if (
      creatorEvent &&
      creatorsSupported(creatorEvent.getContent<IRoomCreateContent>().room_version)
    ) {
      return creatorEvent.getSender();
    }

    const powerLevels = getStateEvent(room, EventType.RoomPowerLevels)?.getContent<IPowerLevels>();

    if (!powerLevels) return undefined;
    const userIdToPower = powerLevels.users;
    if (!userIdToPower) return undefined;
    let powerUserId: string | undefined;

    Object.keys(userIdToPower).forEach((userId) => {
      const userPower = userIdToPower[userId];
      if (userPower === undefined || userPower <= (powerLevels.users_default ?? 0)) return;

      if (!powerUserId) {
        powerUserId = userId;
        return;
      }
      const currentPower = userIdToPower[powerUserId];
      if (currentPower !== undefined && userPower > currentPower) {
        powerUserId = userId;
      }
    });
    return powerUserId;
  };

  const getServerToPopulation = (): Record<string, number> => {
    const members = room.getMembers();
    const serverToPop: Record<string, number> = {};

    members?.forEach((member) => {
      const { userId } = member;
      const server = getMxIdServer(userId);
      if (!server) return;
      const serverPop = serverToPop[server];
      if (serverPop === undefined) {
        serverToPop[server] = 1;
        return;
      }
      serverToPop[server] = serverPop + 1;
    });

    return serverToPop;
  };

  const via: string[] = [];
  const userId = getHighestPowerUserId();
  if (userId) {
    const server = getMxIdServer(userId);
    if (server) via.push(server);
  }
  const serverToPop = getServerToPopulation();
  const sortedServers = Object.keys(serverToPop).toSorted(
    (svrA, svrB) => (serverToPop[svrB] ?? 0) - (serverToPop[svrA] ?? 0)
  );
  const mostPop3 = sortedServers.slice(0, 3);
  if (via.length === 0) return mostPop3;
  const firstVia = via[0];
  if (firstVia && mostPop3.includes(firstVia)) {
    mostPop3.splice(mostPop3.indexOf(firstVia), 1);
  }
  return via.concat(mostPop3.slice(0, 2));
};
