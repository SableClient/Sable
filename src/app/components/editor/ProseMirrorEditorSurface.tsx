import type { KeyboardEventHandler, ReactNode } from 'react';
import { Scroll } from 'folds';
import type { EditorDocument } from './model';
import { ProseMirrorEditable } from './ProseMirrorEditable';
import type { ProseMirrorEditorController } from './prosemirrorController';
import * as css from './Editor.css';

type ProseMirrorEditorSurfaceProps = {
  bottom?: ReactNode;
  controller: ProseMirrorEditorController;
  maxHeight?: string;
  onDocumentChange?: (document: EditorDocument) => void;
  onKeyDown?: KeyboardEventHandler;
  onKeyUp?: KeyboardEventHandler;
  placeholder: string;
  variant?: 'Surface' | 'SurfaceVariant' | 'Background';
};

/** Shared visual host for ProseMirror editors; feature code only sees the controller seam. */
export function ProseMirrorEditorSurface({
  bottom,
  controller,
  maxHeight = '50dvh',
  onDocumentChange,
  onKeyDown,
  onKeyUp,
  placeholder,
  variant = 'SurfaceVariant',
}: ProseMirrorEditorSurfaceProps) {
  return (
    <div className={css.Editor}>
      <Scroll
        className={css.EditorTextareaScroll}
        variant={variant}
        style={{ maxHeight }}
        size="300"
        visibility="Always"
        hideTrack
      >
        <ProseMirrorEditable
          controller={controller}
          editorClassName={css.EditorTextarea}
          placeholder={placeholder}
          onDocumentChange={onDocumentChange}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
        />
      </Scroll>
      {bottom}
    </div>
  );
}
