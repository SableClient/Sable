/* eslint-disable no-param-reassign */
import {
  ClipboardEventHandler,
  KeyboardEventHandler,
  ReactNode,
  forwardRef,
  useCallback,
  useRef,
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
  replacementContent?: ReactNode;
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
      replacementContent,
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
    const editableRef = useRef<HTMLDivElement>(null);
    const beforeRef = useRef<HTMLDivElement>(null);
    const afterRef = useRef<HTMLDivElement>(null);
    const isMultilineRef = useRef(false);
    const [isMultiline, setIsMultiline] = useState(false);
    const layoutIsMultiline = isMultiline && !replacementContent;

    const handleChange = useCallback(
      (value: Descendant[]) => {
        const hasMultipleBlocks = editor.children.length > 1;
        const text = Editor.string(editor, []);
        const hasExplicitNewlines = text.includes('\n');

        const editable = editableRef.current;
        if (editable) {
          const computedStyle = getComputedStyle(editable);
          const lineHeight = parseFloat(computedStyle.lineHeight) || 20;
          const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
          const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
          const contentHeight = editable.scrollHeight - paddingTop - paddingBottom;
          const isWrappingNow = contentHeight > lineHeight * 1.5;

          let nextMultiline: boolean;

          if (!isMultilineRef.current) {
            nextMultiline = hasMultipleBlocks || hasExplicitNewlines || isWrappingNow;
          } else {
            const beforeWidth = beforeRef.current?.offsetWidth ?? 0;
            const afterWidth = afterRef.current?.offsetWidth ?? 0;
            const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
            const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
            const availableSingleLineWidth =
              editable.offsetWidth - beforeWidth - afterWidth - paddingLeft - paddingRight;

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            let wouldWrapInSingleLine = false;
            if (ctx) {
              ctx.font = computedStyle.font;
              const textWidth = ctx.measureText(text).width;
              wouldWrapInSingleLine = textWidth > availableSingleLineWidth;
            }

            nextMultiline = hasMultipleBlocks || hasExplicitNewlines || wouldWrapInSingleLine;
          }

          isMultilineRef.current = nextMultiline;
          setIsMultiline(nextMultiline);
        } else {
          const nextMultiline = hasMultipleBlocks || hasExplicitNewlines;
          isMultilineRef.current = nextMultiline;
          setIsMultiline(nextMultiline);
        }

        onChange?.(value);
      },
      [editor, onChange]
    );

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
        <Slate editor={editor} initialValue={slateInitialValue} onChange={handleChange}>
          {top}
          <Box
            className={`${css.EditorRow} ${layoutIsMultiline ? css.EditorRowMultiline : ''}`}
            alignItems="Start"
          >
            {before && (
              <Box
                ref={beforeRef}
                className={`${css.EditorOptions} ${layoutIsMultiline ? css.EditorOptionsMultiline : ''}`}
                alignItems="Center"
                gap="100"
                shrink="No"
              >
                {before}
              </Box>
            )}
            <Scroll
              className={`${css.EditorTextareaScroll} ${layoutIsMultiline ? css.EditorTextareaScrollMultiline : ''}`}
              variant={variant}
              style={{ maxHeight }}
              size="300"
              visibility="Always"
              hideTrack
            >
              {replacementContent ? (
                <div
                  className={`${css.EditorReplacementContent} ${layoutIsMultiline ? css.EditorReplacementContentMultiline : ''}`}
                >
                  {replacementContent}
                </div>
              ) : (
                <Editable
                  ref={editableRef}
                  data-editable-name={editableName}
                  className={`${css.EditorTextarea} ${layoutIsMultiline ? css.EditorTextareaMultiline : ''}`}
                  placeholder={placeholder}
                  renderPlaceholder={renderPlaceholder}
                  renderElement={renderElement}
                  renderLeaf={renderLeaf}
                  onKeyDown={handleKeydown}
                  onKeyUp={onKeyUp}
                  onPaste={onPaste}
                  autoCapitalize="sentences"
                  onBlur={() => {
                    if (mobileOrTablet()) ReactEditor.focus(editor);
                  }}
                />
              )}
            </Scroll>
            {after && (
              <Box
                ref={afterRef}
                className={`${css.EditorOptions} ${layoutIsMultiline ? css.EditorOptionsMultiline : ''} ${layoutIsMultiline ? css.EditorOptionsAfterMultiline : ''}`}
                alignItems="Center"
                gap="100"
                shrink="No"
              >
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
