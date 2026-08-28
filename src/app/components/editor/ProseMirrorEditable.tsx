import type { HTMLAttributes, KeyboardEventHandler } from 'react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { EditorDocument } from './model';
import type { ProseMirrorEditorController } from './prosemirrorController';

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

    // ProseMirror does not bind Enter; a consumer that sends calls
    // preventDefault, so anything left over is a line break.
    const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
      onKeyDown?.(event);
      if (event.defaultPrevented || event.key !== 'Enter') return;
      if (event.nativeEvent.isComposing) return;
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
