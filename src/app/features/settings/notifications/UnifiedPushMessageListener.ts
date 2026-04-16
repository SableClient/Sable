export type UnifiedPushMessageHandler = (data: Record<string, unknown>) => Promise<void>;
export type UnifiedPushMessageErrorHandler = (error: unknown) => void;

export function createUnifiedPushMessageListener(
  handler: UnifiedPushMessageHandler,
  onError: UnifiedPushMessageErrorHandler
) {
  return (data: Record<string, unknown>) => {
    handler(data).catch(onError);
  };
}
