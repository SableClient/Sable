import { useState, useCallback, useRef } from 'react';
import type { ProseMirrorEditorController } from '$components/editor/prosemirrorController';

export interface UseMessageEditOptions {
  onReset?: () => void;
  alive?: () => boolean;
  focusOnCancel?: boolean;
}

/**
 * Manages the "edit mode" state for a message composer.
 *
 * Centralises the `editId` state and the `handleEdit` callback so both
 * `RoomTimeline` and `ThreadDrawer` share identical behaviour: setting an
 * edit target activates the editor for that event; clearing it resets the
 * editor and returns focus.
 */
export function useMessageEdit(
  editor: ProseMirrorEditorController,
  options?: UseMessageEditOptions
): { editId: string | undefined; handleEdit: (editId?: string) => void } {
  const [editId, setEditId] = useState<string | undefined>(undefined);

  // Use refs so the callback never goes stale on options changes.
  const aliveRef = useRef(options?.alive);
  aliveRef.current = options?.alive;
  const onResetRef = useRef(options?.onReset);
  onResetRef.current = options?.onReset;
  const focusOnCancelRef = useRef(options?.focusOnCancel ?? true);
  focusOnCancelRef.current = options?.focusOnCancel ?? true;

  const handleEdit = useCallback(
    (targetEditId?: string) => {
      if (targetEditId) {
        setEditId(targetEditId);
        return;
      }
      setEditId(undefined);
      if (!focusOnCancelRef.current) return;
      requestAnimationFrame(() => {
        if (aliveRef.current && !aliveRef.current()) return;
        if (onResetRef.current && editor.isEmpty()) onResetRef.current();
        editor.focus();
      });
    },
    [editor]
  );

  return { editId, handleEdit };
}
