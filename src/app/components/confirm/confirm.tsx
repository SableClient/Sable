type Listener = () => void;

class Emitter<T> {
  private listeners = new Set<(value: T) => void>();

  emit(value: T) {
    for (const fn of this.listeners) fn(value);
  }

  on(fn: (value: T) => void): Listener {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}

/** Destructive confirms stay centred alerts on mobile, never bottom sheets. */
export type ConfirmOptions = {
  title: string;
  description: string;
  /** Label on the primary (destructive) button. */
  action: string;
  /** 'Critical' for destructive, 'Warning' for risky. */
  variant: 'Critical' | 'Warning' | 'Primary';
};

export type ConfirmRequest = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

const emitter = new Emitter<ConfirmRequest>();

/**
 * Resolves `true` on the destructive button, `false` on any dismissal — close
 * button, Escape, Android back, or click-outside.
 *
 * Carries no async state: the caller owns any spinner or error handling after
 * confirmation.
 */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    emitter.emit({ ...opts, resolve });
  });
}

/** Exported for ConfirmHost and tests only. Not part of the public API. */
export const confirmEmitter = emitter;
