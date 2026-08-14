import type { HTMLAttributes, KeyboardEventHandler } from 'react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { EditorDocument } from './model';
import type { ProseMirrorEditorController } from './prosemirrorController';

const hostConsumedEvents = new WeakSet<Event>();

/** Hosts mark keydowns they fully handled (e.g. sending on Enter) so the
 * editable won't also act on them. The view preventDefaults every Enter
 * (captureKeyDown in prosemirror-view), so defaultPrevented is not a
 * reliable host-consumption signal. */
export const markEventConsumedByHost = (event: Event): void => {
  hostConsumedEvents.add(event);
};

const isEventConsumedByHost = (event: Event): boolean => hostConsumedEvents.has(event);

export type ProseMirrorEditableHandle = {
  clear: () => void;
  focus: () => void;
  getDocument: () => EditorDocument;
  setDocument: (document: EditorDocument) => void;
};

type ProseMirrorEditableProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> & {
  controller: ProseMirrorEditorController;
  editableName?: string;
  editorClassName?: string;
  onHostChange?: (element: HTMLDivElement | null) => void;
  onDocumentChange?: (document: EditorDocument) => void;
  placeholder?: string;
};

/** React host for the private ProseMirror controller seam. */
export const ProseMirrorEditable = forwardRef<ProseMirrorEditableHandle, ProseMirrorEditableProps>(
  (
    {
      controller,
      editorClassName,
      onHostChange,
      onDocumentChange,
      onKeyDown,
      placeholder,
      enterKeyHint,
      editableName,
      ...props
    },
    ref
  ) => {
    const rootRef = useRef<HTMLDivElement | null>(null);

    // The view preventDefaults every Enter, so defaultPrevented cannot tell
    // host consumption apart from the view; the host marks the event instead.
    const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
      onKeyDown?.(event);
      if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
      if (isEventConsumedByHost(event.nativeEvent)) return;
      event.preventDefault();
      controller.insertNewline();
    };

    const setRootRef = (element: HTMLDivElement | null) => {
      rootRef.current = element;
      onHostChange?.(element);
    };

    useImperativeHandle(
      ref,
      () => ({
        clear: () => controller.clear(),
        focus: () => controller.focus(),
        getDocument: () => controller.getDocument(),
        setDocument: (document) => controller.setDocument(document),
      }),
      [controller]
    );

    // ProseMirror owns these; React must not also render them.
    const attributes = useMemo(
      () => ({
        ...(editorClassName ? { class: editorClassName } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder, 'aria-label': placeholder } : {}),
        ...(editableName ? { 'data-editable-name': editableName } : {}),
        ...(enterKeyHint ? { enterkeyhint: enterKeyHint } : {}),
        role: 'textbox',
      }),
      [editableName, editorClassName, enterKeyHint, placeholder]
    );
    const attributesRef = useRef(attributes);
    attributesRef.current = attributes;

    useEffect(() => {
      const root = rootRef.current;
      if (!root) return undefined;
      return controller.mount(root, attributesRef.current);
    }, [controller]);

    useEffect(() => {
      controller.setAttributes(attributes);
    }, [attributes, controller]);

    useEffect(
      () => controller.subscribe((document) => onDocumentChange?.(document)),
      [controller, onDocumentChange]
    );

    return <div {...props} onKeyDownCapture={handleKeyDown} ref={setRootRef} />;
  }
);
