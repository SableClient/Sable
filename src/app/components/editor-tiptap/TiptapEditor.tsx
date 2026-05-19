import type { ReactNode, KeyboardEventHandler, ClipboardEventHandler } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { Box, Scroll } from 'folds';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import type { Editor as TiptapEditorInstance } from '@tiptap/core';

import { mobileOrTablet } from '$utils/user-agent';
import { MatrixMentionExtension } from './extensions/MentionExtension';
import { EmoticonExtension } from './extensions/EmoticonExtension';
import { CommandExtension } from './extensions/CommandExtension';
import * as css from './TiptapEditor.css';

export type { TiptapEditorInstance };

/** Imperative handle exposed via ref for parent components. */
export type TiptapEditorHandle = {
  // eslint-disable-next-line typescript-eslint/no-redundant-type-constituents
  editor: TiptapEditorInstance | null;
  focus: () => void;
  reset: () => void;
  isEmpty: () => boolean;
};

type TiptapEditorProps = {
  editableName?: string;
  top?: ReactNode;
  bottom?: ReactNode;
  before?: ReactNode;
  after?: ReactNode;
  responsiveAfter?: ReactNode;
  forceMultilineLayout?: boolean;
  maxHeight?: string;
  placeholder?: string;
  onKeyDown?: KeyboardEventHandler;
  onKeyUp?: KeyboardEventHandler;
  onChange?: (editor: TiptapEditorInstance) => void;
  onPaste?: ClipboardEventHandler;
  className?: string;
  variant?: 'Surface' | 'SurfaceVariant' | 'Background';
};

export const TiptapEditor = forwardRef<TiptapEditorHandle, TiptapEditorProps>(
  (
    {
      editableName,
      top,
      bottom,
      before,
      after,
      responsiveAfter,
      forceMultilineLayout = false,
      maxHeight = '50vh',
      placeholder,
      onKeyDown,
      onKeyUp,
      onChange,
      onPaste,
      className,
      variant = 'SurfaceVariant',
    },
    ref
  ) => {
    const [isMultiline, setIsMultiline] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          // Disable block-level elements we don't need in a chat composer
          heading: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
          hardBreak: {
            // Shift+Enter inserts a hard break (newline within paragraph)
            keepMarks: true,
          },
        }),
        Link.configure({
          openOnClick: false,
          autolink: true,
        }),
        Placeholder.configure({
          placeholder: placeholder ?? '',
        }),
        MatrixMentionExtension.configure({
          suggestion: {
            // Disable the built-in suggestion popup — we handle autocomplete at the
            // RoomInputTiptap level using our own React-based UI.
            render: () => ({
              onStart: () => {},
              onUpdate: () => {},
              onKeyDown: () => false,
              onExit: () => {},
            }),
          },
        }),
        EmoticonExtension,
        CommandExtension,
      ],

      onUpdate({ editor: updatedEditor }) {
        // Detect multiline (more than one paragraph or hard break in first paragraph)
        const { doc } = updatedEditor.state;
        let multiline = doc.childCount > 1;
        if (!multiline) {
          doc.forEach((node) => {
            if (!multiline) {
              node.forEach((child) => {
                if (child.type.name === 'hardBreak') multiline = true;
              });
            }
          });
        }
        setIsMultiline(multiline || forceMultilineLayout);
        onChange?.(updatedEditor);
      },

      editorProps: {
        attributes: {
          ...(editableName ? { 'data-editable-name': editableName } : {}),
          class: css.TiptapEditorContent,
          autocapitalize: 'sentences',
        },
        handleKeyDown(_, event) {
          onKeyDown?.(event as unknown as React.KeyboardEvent);
          return false; // let Tiptap handle the event normally as well
        },
        handleDOMEvents: {
          keyup: (_, event) => {
            onKeyUp?.(event as unknown as React.KeyboardEvent);
            return false;
          },
          paste: (_, event) => {
            onPaste?.(event as unknown as React.ClipboardEvent);
            return false;
          },
          blur: () => {
            if (mobileOrTablet() && editor) {
              editor.commands.focus();
            }
            return false;
          },
        },
      },
    });

    // Keep multiline in sync with forceMultilineLayout changes
    useEffect(() => {
      if (forceMultilineLayout && !isMultiline) setIsMultiline(true);
    }, [forceMultilineLayout, isMultiline]);

    useImperativeHandle(
      ref,
      () => ({
        editor,
        focus: () => editor?.commands.focus(),
        reset: () => editor?.commands.clearContent(true),
        isEmpty: () => editor?.isEmpty ?? true,
      }),
      [editor]
    );

    const layoutIsMultiline = isMultiline || forceMultilineLayout;
    const hasBefore = Boolean(before);
    const hasAfter = Boolean(after);
    const hasResponsiveAfter = Boolean(responsiveAfter);
    const showResponsiveAfterInFooter = hasResponsiveAfter && layoutIsMultiline;
    const showResponsiveAfterInline = hasResponsiveAfter && !showResponsiveAfterInFooter;

    const handlePaste = useCallback<ClipboardEventHandler>(
      (e) => {
        onPaste?.(e);
      },
      [onPaste]
    );

    return (
      <div
        ref={rootRef}
        className={`${css.TiptapEditorRoot} ${className ?? ''}`}
        onPaste={handlePaste}
      >
        {top}
        <Box
          className={`${css.TiptapEditorRow} ${layoutIsMultiline ? css.TiptapEditorRowMultiline : ''}`}
          alignItems="Start"
          style={{ display: after ? 'grid' : 'flex' }}
        >
          {hasBefore && (
            <Box
              className={`${css.TiptapEditorOptions} ${layoutIsMultiline ? css.TiptapEditorOptionsMultiline : ''}`}
              alignItems="Center"
              gap="100"
              shrink="No"
            >
              {before}
            </Box>
          )}
          <Scroll
            className={`${css.TiptapEditorScrollArea} ${layoutIsMultiline ? css.TiptapEditorScrollAreaMultiline : ''}`}
            variant={variant}
            style={{ maxHeight: showResponsiveAfterInFooter ? undefined : maxHeight }}
            size="300"
            visibility="Always"
            hideTrack
          >
            <div className={css.TiptapProseMirrorWrapper}>
              <EditorContent editor={editor} />
            </div>
          </Scroll>
          {(hasAfter || showResponsiveAfterInline) && (
            <Box
              className={`${css.TiptapEditorOptions} ${layoutIsMultiline ? css.TiptapEditorOptionsMultiline : ''} ${layoutIsMultiline ? css.TiptapEditorOptionsAfterMultiline : ''}`}
              alignItems="Center"
              gap="100"
              shrink="No"
            >
              {showResponsiveAfterInline && responsiveAfter}
              {after}
            </Box>
          )}
        </Box>
        {bottom}
      </div>
    );
  }
);
