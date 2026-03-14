/* eslint-disable no-param-reassign */
import {
  ClipboardEventHandler,
  KeyboardEventHandler,
  ReactNode,
  forwardRef,
  useCallback,
  useState,
} from 'react';
import { Box, Scroll, Text } from 'folds';
import { Descendant, Editor, createEditor } from 'slate';
import {
  Slate,
  Editable,
  withReact,
  RenderLeafProps,
  RenderElementProps,
  RenderPlaceholderProps,
  ReactEditor,
} from 'slate-react';
import { withHistory } from 'slate-history';
import { mobileOrTablet } from '$utils/user-agent';
import { BlockType } from './types';
import { RenderElement, RenderLeaf } from './Elements';
import { CustomElement } from './slate';
import * as css from './Editor.css';
import { toggleKeyboardShortcut } from './keyboard';

const withInline = (editor: Editor): Editor => {
  const { isInline } = editor;

  editor.isInline = (element) =>
    [BlockType.Mention, BlockType.Emoticon, BlockType.Link, BlockType.Command].includes(
      element.type
    ) || isInline(element);

  return editor;
};

const withVoid = (editor: Editor): Editor => {
  const { isVoid } = editor;

  editor.isVoid = (element) =>
    [BlockType.Mention, BlockType.Emoticon, BlockType.Command].includes(element.type) ||
    isVoid(element);

  return editor;
};

export const useEditor = (): Editor => {
  const [editor] = useState(() => withInline(withVoid(withReact(withHistory(createEditor())))));
  return editor;
};

export type EditorChangeHandler = (value: Descendant[]) => void;
type CustomEditorProps = {
  editableName?: string;
  top?: ReactNode;
  bottom?: ReactNode;
  before?: ReactNode;
  after?: ReactNode;
  maxHeight?: string;
  editor: Editor;
  placeholder?: string;
  onKeyDown?: KeyboardEventHandler;
  onKeyUp?: KeyboardEventHandler;
  onChange?: EditorChangeHandler;
  onPaste?: ClipboardEventHandler;
  className?: string;
  variant?: 'Surface' | 'SurfaceVariant' | 'Background';
};
export const CustomEditor = forwardRef<HTMLDivElement, CustomEditorProps>(
  (
    {
      editableName,
      top,
      bottom,
      before,
      after,
      maxHeight = '50vh',
      editor,
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
    // Each <Slate> instance must receive its own fresh node objects.
    // Sharing a module-level constant causes Slate's global NODE_TO_ELEMENT
    // WeakMap to be overwritten when multiple editors are mounted at the same
    // time (e.g. RoomInput + MessageEditor in the thread drawer), leading to
    // "Unable to find the path for Slate node" crashes.
    const [slateInitialValue] = useState<CustomElement[]>(() => [
      { type: BlockType.Paragraph, children: [{ text: '' }] },
    ]);

    const renderElement = useCallback(
      (props: RenderElementProps) => <RenderElement {...props} />,
      []
    );

    const renderLeaf = useCallback((props: RenderLeafProps) => <RenderLeaf {...props} />, []);

    const handleKeydown: KeyboardEventHandler = useCallback(
      (evt) => {
        // mobile ignores config option
        if (mobileOrTablet() && evt.key === 'Enter' && !evt.shiftKey) {
          return;
        }

        onKeyDown?.(evt);

        const shortcutToggled = toggleKeyboardShortcut(editor, evt);
        if (shortcutToggled) evt.preventDefault();
      },
      [editor, onKeyDown]
    );

    const renderPlaceholder = useCallback(
      ({ attributes, children }: RenderPlaceholderProps) => (
        <span {...attributes} className={css.EditorPlaceholderContainer}>
          {/* Inner component to style the actual text position and appearance */}
          <Text as="span" className={css.EditorPlaceholderTextVisual} truncate>
            {children}
          </Text>
        </span>
      ),
      []
    );

    return (
      <div className={`${css.Editor} ${className || ''}`} ref={ref}>
        <Slate editor={editor} initialValue={slateInitialValue} onChange={onChange}>
          {top}
          <Box alignItems="Start">
            {before && (
              <Box className={css.EditorOptions} alignItems="Center" gap="100" shrink="No">
                {before}
              </Box>
            )}
            <Scroll
              className={css.EditorTextareaScroll}
              variant={variant}
              style={{ maxHeight }}
              size="300"
              visibility="Always"
              hideTrack
            >
              <Editable
                data-editable-name={editableName}
                className={css.EditorTextarea}
                placeholder={placeholder}
                renderPlaceholder={renderPlaceholder}
                renderElement={renderElement}
                renderLeaf={renderLeaf}
                onKeyDown={handleKeydown}
                onKeyUp={onKeyUp}
                onPaste={onPaste}
                // keeps focus after pressing send.
                onBlur={() => {
                  if (mobileOrTablet()) ReactEditor.focus(editor);
                }}
              />
            </Scroll>
            {after && (
              <Box className={css.EditorOptions} alignItems="Center" gap="100" shrink="No">
                {after}
              </Box>
            )}
          </Box>
          {bottom}
        </Slate>
      </div>
    );
  }
);
