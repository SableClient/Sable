import { engineInvoke as invokeEngineCommand } from '$generated/tauri/commands';

export type EngineIdentity = {
  userId: string;
  deviceId: string;
};

export const engineInvoke = async (
  identity: EngineIdentity,
  method: string,
  args: Record<string, unknown> = {}
): Promise<unknown> => {
  const raw = await invokeEngineCommand({
    userId: identity.userId,
    deviceId: identity.deviceId,
    method,
    argsJson: JSON.stringify(args),
  });
  return JSON.parse(raw) as unknown;
};
