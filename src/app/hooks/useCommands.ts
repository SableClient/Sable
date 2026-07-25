import type { MatrixClient, Room } from '$types/matrix-sdk';
import { useCallback, useMemo } from 'react';

import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useOpenShallowRoute } from '$pages/client/useShallowRoute';
import { getBugReportPath } from '$pages/pathUtils';
import { PKitCommandMessageHandler } from '$plugins/pluralkit-handler/PKitCommandMessageHandler';
import { useRoomNavigate } from './useRoomNavigate';
import { useUserProfile } from './useUserProfile';

import type { CommandContext, CommandRecord } from './commands/types';
import { createFunCommands } from './commands/fun';
import { createMembershipCommands } from './commands/membership';
import { createModerationCommands } from './commands/moderation';
import { createProfileCommands } from './commands/profile';
import { createPmpCommands } from './commands/pmp';
import { createRainbowCommands } from './commands/rainbow';
import { createRawCommands } from './commands/raw';
import { createMiscCommands } from './commands/misc';

export type { CommandExe, CommandContent, CommandRecord } from './commands/types';
export { Command } from './commands/types';
export { SHRUG, TABLEFLIP, UNFLIP } from './commands/fun';

export const useCommands = (mx: MatrixClient, room: Room): CommandRecord => {
  const { navigateRoom } = useRoomNavigate();
  const [developerTools] = useSetting(settingsAtom, 'developerTools');
  const [enableMSC4268CMD] = useSetting(settingsAtom, 'enableMSC4268CMD');
  // helper for pkit commands
  const pkitcmdHandler = useMemo(() => new PKitCommandMessageHandler(mx, room), [mx, room]);
  const profile = useUserProfile(mx.getSafeUserId());
  const openShallowRoute = useOpenShallowRoute();
  const openBugReport = useCallback(() => openShallowRoute(getBugReportPath()), [openShallowRoute]);

  const commands: CommandRecord = useMemo(() => {
    const ctx: CommandContext = {
      mx,
      room,
      navigateRoom,
      profileDisplayName: profile.displayName,
      pkitcmdHandler,
      developerTools,
      enableMSC4268CMD,
      openBugReport,
    };

    return {
      ...createFunCommands(ctx),
      ...createMembershipCommands(ctx),
      ...createModerationCommands(ctx),
      ...createProfileCommands(ctx),
      ...createPmpCommands(ctx),
      ...createRainbowCommands(ctx),
      ...createRawCommands(ctx),
      ...createMiscCommands(ctx),
    } as CommandRecord;
  }, [
    mx,
    navigateRoom,
    room,
    profile.displayName,
    pkitcmdHandler,
    developerTools,
    enableMSC4268CMD,
    openBugReport,
  ]);

  return commands;
};
