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

/**
 * Options for the imperative confirm() API.
 *
 * Destructive confirms stay CENTRED ALERTS on mobile, never bottom sheets.
 * This is the verified mobile presentation rule for irreversible actions.
 */
export type ConfirmOptions = {
  /** Dialog heading. */
  title: string;
  /** Body text below the heading. */
  description: string;
  /** Label on the primary (destructive) button. */
  action: string;
  /** Button variant — 'Critical' for destructive, 'Warning' for risky. */
  variant: 'Critical' | 'Warning' | 'Primary';
};

export type ConfirmRequest = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

const emitter = new Emitter<ConfirmRequest>();

/**
 * Imperative confirm dialog.
 *
 * Returns Promise<boolean>: `true` when the user clicks the destructive button,
 * `false` when they dismiss the dialog (close button, Escape, Android back,
 * or click-outside).
 *
 * Does NOT manage async operation state (loading spinner / error display)
 * — the caller is responsible for its own async logic after confirmation.
 *
 * Usage:
 *   const ok = await confirm({ title: 'Leave Room', description: '…', action: 'Leave', variant: 'Critical' });
 *   if (ok) { await mx.leave(roomId); }
 */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    emitter.emit({ ...opts, resolve });
  });
}

/** Exported for ConfirmHost and tests only. Not part of the public API. */
export const confirmEmitter = emitter;
