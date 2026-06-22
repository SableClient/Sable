export type VisibilityChangeHandler = (isVisible: boolean) => void;
type VisibilityHiddenHandler = () => void;
export type ForegroundRecoveryTrigger =
  | 'visibilitychange'
  | 'pageshow_persisted'
  | 'focus'
  | 'pointerdown'
  | 'keydown';
type ForegroundRecoveryRequestedHandler = (trigger: ForegroundRecoveryTrigger) => void;

const visibilityChangeHandlers = new Set<VisibilityChangeHandler>();
const visibilityHiddenHandlers = new Set<VisibilityHiddenHandler>();
const foregroundRecoveryRequestedHandlers = new Set<ForegroundRecoveryRequestedHandler>();

export const appEvents = {
  onForegroundRecoveryRequested(handler: ForegroundRecoveryRequestedHandler): () => void {
    foregroundRecoveryRequestedHandlers.add(handler);
    return () => {
      foregroundRecoveryRequestedHandlers.delete(handler);
    };
  },

  emitForegroundRecoveryRequested(trigger: ForegroundRecoveryTrigger): void {
    foregroundRecoveryRequestedHandlers.forEach((handler) => handler(trigger));
  },

  onVisibilityHidden(handler: VisibilityHiddenHandler): () => void {
    visibilityHiddenHandlers.add(handler);
    return () => {
      visibilityHiddenHandlers.delete(handler);
    };
  },

  emitVisibilityHidden(): void {
    visibilityHiddenHandlers.forEach((h) => h());
  },

  onVisibilityChange(handler: VisibilityChangeHandler): () => void {
    visibilityChangeHandlers.add(handler);
    return () => {
      visibilityChangeHandlers.delete(handler);
    };
  },

  emitVisibilityChange(isVisible: boolean): void {
    visibilityChangeHandlers.forEach((h) => h(isVisible));
  },
};
