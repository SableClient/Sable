type VisibilityChangeHandler = (isVisible: boolean) => void;
type VisibilityHiddenHandler = () => void;

const visibilityChangeHandlers = new Set<VisibilityChangeHandler>();
const visibilityHiddenHandlers = new Set<VisibilityHiddenHandler>();

export const appEvents = {
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
