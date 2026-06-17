import { useCallback, useState } from 'react';

import { CustomAccountDataEvent, type AddedServersContent } from '$types/matrix/accountData';
import { isServerName } from '$utils/matrix';

import { useAccountDataCallback } from './useAccountDataCallback';
import { useMatrixClient } from './useMatrixClient';

const serverKey = (server: string): string => server.toLowerCase();

const hasServer = (servers: string[], server: string): boolean =>
  servers.some((entry) => serverKey(entry) === serverKey(server));

const readAddedServers = (content: unknown): string[] => {
  if (!content || typeof content !== 'object') return [];
  const servers = (content as AddedServersContent).servers;
  if (!Array.isArray(servers)) return [];
  return servers.filter((server): server is string => typeof server === 'string');
};

export const useExploreServers = () => {
  const mx = useMatrixClient();
  const [servers, setServers] = useState<string[]>(() =>
    readAddedServers(mx.getAccountData(CustomAccountDataEvent.SableAddedServers)?.getContent())
  );

  useAccountDataCallback(
    mx,
    useCallback((mEvent) => {
      if (mEvent.getType() !== (CustomAccountDataEvent.SableAddedServers as string)) return;
      setServers(readAddedServers(mEvent.getContent()));
    }, [])
  );

  const addServer = useCallback(
    async (server: string): Promise<boolean> => {
      const normalized = server.trim();
      if (!isServerName(normalized)) return false;

      const current = readAddedServers(
        mx.getAccountData(CustomAccountDataEvent.SableAddedServers)?.getContent()
      );
      if (hasServer(current, normalized)) return true;

      const next: AddedServersContent = { servers: [...current, normalized] };
      await mx.setAccountData(CustomAccountDataEvent.SableAddedServers, next);
      setServers(next.servers);
      return true;
    },
    [mx]
  );

  const removeServer = useCallback(
    async (server: string): Promise<boolean> => {
      const current = readAddedServers(
        mx.getAccountData(CustomAccountDataEvent.SableAddedServers)?.getContent()
      );
      const nextServers = current.filter((entry) => serverKey(entry) !== serverKey(server));
      if (nextServers.length === current.length) return false;

      const next: AddedServersContent = { servers: nextServers };
      await mx.setAccountData(CustomAccountDataEvent.SableAddedServers, next);
      setServers(next.servers);
      return true;
    },
    [mx]
  );

  return { servers, addServer, removeServer };
};
