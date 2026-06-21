import type { ClipboardEventHandler, KeyboardEventHandler, ReactNode } from 'react';
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box, Scroll, Text } from 'folds';
import type { Descendant, Editor, Node, NodeEntry, BaseRange } from 'slate';
import { Node as SlateNode, createEditor, Text as SlateText } from 'slate';
import type { RenderLeafProps, RenderElementProps, RenderPlaceholderProps } from 'slate-react';
import { Slate, Editable, withReact, ReactEditor } from 'slate-react';
import { withHistory } from 'slate-history';
import { isPhone, mobileOrTablet } from '$utils/user-agent';
import { getHexcodeForEmoji, getShortcodeFor, isFixedCellEmoji } from '$plugins/emoji';
import { findSystemEmojiMatches } from '$plugins/react-custom-html-parser';
import { BlockType } from './types';
import { RenderElement, RenderLeaf } from './Elements';
import type { CustomElement } from './slate';
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
const MAX_MULTILINE_MEASURE_RETRIES = 2;
const MULTILINE_HEIGHT_EPSILON = 1;
const TRAILING_SPACE_SENTINEL = '\u200B';

const normalizeMeasurementText = (text: string): string =>
  /[ \t]+$/.test(text) ? `${text}${TRAILING_SPACE_SENTINEL}` : text;

type MultilineMeasurementCache = {
  result: boolean;
  singleLineWidth: number;
  styleKey: string;
  text: string;
};

const decorateSystemEmoji = ([node, path]: NodeEntry<Node>): BaseRange[] => {
  if (!SlateText.isText(node) || node.text.length === 0) {
    return [];
  }

  return findSystemEmojiMatches(node.text).map(({ emoji, start, end }) => ({
    anchor: { path, offset: start },
    focus: { path, offset: end },
    systemEmoji: emoji,
    systemEmojiFixedCell: isFixedCellEmoji(emoji),
    systemEmojiTitle: getShortcodeFor(getHexcodeForEmoji(emoji)),
  }));
};

type CustomEditorProps = {
  editableName?: string;
  top?: ReactNode;
  bottom?: ReactNode;
  before?: ReactNode;
  after?: ReactNode;
  responsiveAfter?: ReactNode;
  forceMultilineLayout?: boolean;
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
      responsiveAfter,
      forceMultilineLayout = false,
      maxHeight = 'min(50vh, calc(var(--sable-visible-height, 100vh) * 0.5))',
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
    const rootRef = useRef<HTMLDivElement | null>(null);
    const editableRef = useRef<HTMLDivElement>(null);
    const rowRef = useRef<HTMLDivElement>(null);
    const beforeRef = useRef<HTMLDivElement>(null);
    const afterRef = useRef<HTMLDivElement>(null);
    const textMeasurerRef = useRef<HTMLDivElement | null>(null);
    const measurementCacheRef = useRef<MultilineMeasurementCache | null>(null);
    const multilineMeasureFrameRef = useRef<number | null>(null);
    const multilineMeasureRetryRef = useRef(0);
    const singleLineWidthOffsetRef = useRef(0);
    const latestValueRef = useRef<Descendant[]>(editor.children);
    const isMultilineRef = useRef(false);
    // Tracks whether a triggerAutoCapitalize rAF is already queued to avoid stacking
    // multiple rAFs when content changes fire rapidly (e.g. IME composition).
    const autocapPendingRef = useRef(false);
    const [isMultiline, setIsMultiline] = useState(false);
    const [measurementVersion, setMeasurementVersion] = useState(0);
    const hasBefore = Boolean(before);
    const hasAfter = Boolean(after);
    const hasResponsiveAfter = Boolean(responsiveAfter);
    const layoutIsMultiline = isMultiline || forceMultilineLayout;
    const showResponsiveAfterInFooter = hasResponsiveAfter && layoutIsMultiline;
    const showResponsiveAfterInline = hasResponsiveAfter && !showResponsiveAfterInFooter;

    const setRootRef = useCallback(
      (node: HTMLDivElement | null) => {
        rootRef.current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          Reflect.set(ref, 'current', node);
        }
      },
      [ref]
    );

    const updateMultilineLayout = useCallback(
      (value: Descendant[] = editor.children) => {
        const hasMultipleBlocks = value.length > 1;
        const text = value.map((node) => SlateNode.string(node)).join('');
        const hasExplicitNewlines = text.includes('\n');

        const editable = editableRef.current;
        const row = rowRef.current;
        const textMeasurer = textMeasurerRef.current;
        if (editable && row && textMeasurer) {
          const scroll = editable.parentElement as HTMLDivElement | null;
          const computedStyle = getComputedStyle(editable);
          const beforeWidth = beforeRef.current?.offsetWidth ?? 0;
          const afterWidth = afterRef.current?.offsetWidth ?? 0;
          const rowSingleLineWidth = row.offsetWidth - beforeWidth - afterWidth;
          const isRenderedSingleLine = !layoutIsMultiline;

          if (isRenderedSingleLine && scroll) {
            // Scroll.clientWidth is the width the editable actually gets after padding and
            // scrollbar math. Cache that delta while we are rendered single-line so later
            // hidden measurements can compare against the same usable width.
            const renderedSingleLineWidth = scroll.clientWidth;
            if (renderedSingleLineWidth > 0) {
              singleLineWidthOffsetRef.current = Math.max(
                0,
                rowSingleLineWidth - renderedSingleLineWidth
              );
            }
          }

          const singleLineWidth = Math.max(
            0,
            rowSingleLineWidth - singleLineWidthOffsetRef.current
          );

          if (
            text.length > 0 &&
            singleLineWidth <= 0 &&
            multilineMeasureRetryRef.current < MAX_MULTILINE_MEASURE_RETRIES
          ) {
            multilineMeasureRetryRef.current += 1;
            if (multilineMeasureFrameRef.current !== null) {
              cancelAnimationFrame(multilineMeasureFrameRef.current);
            }
            multilineMeasureFrameRef.current = requestAnimationFrame(() => {
              multilineMeasureFrameRef.current = null;
              updateMultilineLayout();
            });
            return;
          }

          multilineMeasureRetryRef.current = 0;
          let nextMultiline = hasMultipleBlocks || hasExplicitNewlines;
          if (!nextMultiline && text.length > 0) {
            const styleKey = [
              computedStyle.font,
              computedStyle.lineHeight,
              computedStyle.letterSpacing,
              computedStyle.fontKerning,
              computedStyle.fontFeatureSettings,
              computedStyle.fontVariationSettings,
              computedStyle.textTransform,
              computedStyle.textIndent,
              computedStyle.tabSize,
            ].join('|');
            const cachedMeasurement = measurementCacheRef.current;

            if (
              cachedMeasurement?.text === text &&
              cachedMeasurement.singleLineWidth === singleLineWidth &&
              cachedMeasurement.styleKey === styleKey
            ) {
              nextMultiline = cachedMeasurement.result;
            } else {
              textMeasurer.style.font = computedStyle.font;
              textMeasurer.style.lineHeight = computedStyle.lineHeight;
              textMeasurer.style.letterSpacing = computedStyle.letterSpacing;
              textMeasurer.style.fontKerning = computedStyle.fontKerning;
              textMeasurer.style.fontFeatureSettings = computedStyle.fontFeatureSettings;
              textMeasurer.style.fontVariationSettings = computedStyle.fontVariationSettings;
              textMeasurer.style.textTransform = computedStyle.textTransform;
              textMeasurer.style.textIndent = computedStyle.textIndent;
              textMeasurer.style.tabSize = computedStyle.tabSize;
              // Measure against a hidden clone instead of the live editable so we can ask
              // "would this wrap at single-line width?" without the current layout feeding
              // back into the answer.
              const measureHeight = (content: string, width: string): number => {
                textMeasurer.style.width = width;
                textMeasurer.textContent = normalizeMeasurementText(content);
                return textMeasurer.scrollHeight;
              };
              const singleLineHeight = measureHeight('M', 'max-content');
              const measuredHeight = measureHeight(text, `${Math.max(singleLineWidth, 0)}px`);
              nextMultiline = measuredHeight > singleLineHeight + MULTILINE_HEIGHT_EPSILON;
              measurementCacheRef.current = {
                result: nextMultiline,
                singleLineWidth,
                styleKey,
                text,
              };
            }
          } else {
            measurementCacheRef.current = null;
          }

          isMultilineRef.current = nextMultiline;
          setIsMultiline(nextMultiline);
        } else {
          const nextMultiline = hasMultipleBlocks || hasExplicitNewlines;
          isMultilineRef.current = nextMultiline;
          setIsMultiline(nextMultiline);
        }
      },
      [editor, layoutIsMultiline]
    );

    useEffect(() => {
      const root = rootRef.current;
      if (!root) {
        return undefined;
      }

      const measurerHost = document.createElement('div');
      const textMeasurer = document.createElement('div');
      measurerHost.setAttribute('aria-hidden', 'true');
      textMeasurer.setAttribute('aria-hidden', 'true');
      if (editableName) {
        textMeasurer.dataset.editorMeasurer = editableName;
      }
      Object.assign(measurerHost.style, {
        position: 'absolute',
        inset: '0',
        width: '0',
        height: '0',
        overflow: 'hidden',
        pointerEvents: 'none',
        visibility: 'hidden',
        zIndex: '-1',
      });
      Object.assign(textMeasurer.style, {
        padding: '0',
        border: '0',
        margin: '0',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
        wordBreak: 'break-word',
        boxSizing: 'border-box',
      });
      measurerHost.appendChild(textMeasurer);
      root.appendChild(measurerHost);
      textMeasurerRef.current = textMeasurer;

      return () => {
        measurementCacheRef.current = null;
        textMeasurerRef.current = null;
        measurerHost.remove();
      };
    }, [editableName]);

    useEffect(
      () => () => {
        if (multilineMeasureFrameRef.current !== null) {
          cancelAnimationFrame(multilineMeasureFrameRef.current);
        }
        measurementCacheRef.current = null;
        multilineMeasureRetryRef.current = 0;
      },
      []
    );

    const queueMultilineMeasurement = useCallback(
      (resetRetry = true) => {
        if (multilineMeasureFrameRef.current !== null) {
          cancelAnimationFrame(multilineMeasureFrameRef.current);
        }
        if (resetRetry) {
          multilineMeasureRetryRef.current = 0;
        }
        multilineMeasureFrameRef.current = requestAnimationFrame(() => {
          multilineMeasureFrameRef.current = null;
          updateMultilineLayout();
        });
      },
      [updateMultilineLayout]
    );

    useEffect(() => {
      if (typeof ResizeObserver === 'undefined') {
        return undefined;
      }

      const observer = new ResizeObserver(() => {
        queueMultilineMeasurement();
      });
      const observedElements = [rowRef.current, beforeRef.current, afterRef.current].filter(
        (element): element is HTMLDivElement => element !== null
      );

      observedElements.forEach((element) => observer.observe(element));

      return () => observer.disconnect();
    }, [
      queueMultilineMeasurement,
      updateMultilineLayout,
      hasBefore,
      hasAfter,
      showResponsiveAfterInline,
    ]);

    useLayoutEffect(() => {
      updateMultilineLayout(latestValueRef.current);
    }, [measurementVersion, updateMultilineLayout]);

    // Mobile OSes (iOS and Android) do not reliably capitalise the first letter in an empty
    // contenteditable. Both platforms render a zero-width placeholder character (\uFEFF)
    // inside the Slate DOM node to maintain the cursor, and their keyboards interpret this
    // as existing content — so they don't apply sentence-case to the next keystroke.
    // Toggling the autocapitalize attribute from 'none' → 'sentences' on the focused
    // contenteditable forces the keyboard to re-evaluate capitalisation state with no
    // content changes, no focus shifts, and no keyboard dismissal.
    const triggerAutoCapitalize = useCallback(() => {
      if (!mobileOrTablet()) return;
      if (autocapPendingRef.current) return;
      const el = editableRef.current;
      if (!el) return;
      autocapPendingRef.current = true;
      el.setAttribute('autocapitalize', 'none');
      requestAnimationFrame(() => {
        el.setAttribute('autocapitalize', 'sentences');
        autocapPendingRef.current = false;
      });
    }, []);

    const handleChange = useCallback(
      (value: Descendant[]) => {
        const prevText = latestValueRef.current.map((node) => SlateNode.string(node)).join('');
        latestValueRef.current = value;
        measurementCacheRef.current = null;
        if (multilineMeasureFrameRef.current !== null) {
          cancelAnimationFrame(multilineMeasureFrameRef.current);
          multilineMeasureFrameRef.current = null;
        }
        setMeasurementVersion((version) => version + 1);
        onChange?.(value);
        // After a send, content goes from non-empty to empty while the editor stays focused.
        // Trigger the autocap attribute toggle so the next message starts capitalised.
        // onBlur keeps focus on the editor so isFocused() is true when this fires.
        const nextText = value.map((node) => SlateNode.string(node)).join('');
        if (prevText.length > 0 && nextText.length === 0 && ReactEditor.isFocused(editor)) {
          triggerAutoCapitalize();
        }
      },
      [onChange, editor, triggerAutoCapitalize]
    );

    const renderElement = useCallback(
      (props: RenderElementProps) => <RenderElement {...props} />,
      []
    );

    const renderLeaf = useCallback((props: RenderLeafProps) => <RenderLeaf {...props} />, []);
    const decorate = useCallback((entry: NodeEntry<Node>) => decorateSystemEmoji(entry), []);

    const handleKeydown: KeyboardEventHandler = useCallback(
      (evt) => {
        // Phones (on-screen keyboard) ignore the enter-to-send config option.
        // Tablets with an external keyboard should still forward Enter to onKeyDown
        // so RoomInput can honour the enterForNewline / mod+enter settings.
        if (isPhone() && evt.key === 'Enter' && !evt.shiftKey) {
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
      <div className={`${css.Editor} ${className || ''}`} ref={setRootRef}>
        <Slate editor={editor} initialValue={slateInitialValue} onChange={handleChange}>
          {top}
          <Box
            ref={rowRef}
            className={`${css.EditorRow} ${layoutIsMultiline ? css.EditorRowMultiline : ''} ${showResponsiveAfterInFooter ? css.EditorRowMultilineWithResponsiveAfter : ''}`}
            alignItems={layoutIsMultiline ? 'Start' : 'Center'}
            style={{ display: after ? 'grid' : 'flex' }}
          >
            {hasBefore && (
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
              style={{
                maxHeight: showResponsiveAfterInFooter ? undefined : maxHeight,
              }}
              size="300"
              visibility="Always"
              hideTrack
            >
              <Editable
                ref={editableRef}
                data-editable-name={editableName}
                className={css.EditorTextarea}
                placeholder={placeholder}
                renderPlaceholder={renderPlaceholder}
                renderElement={renderElement}
                renderLeaf={renderLeaf}
                decorate={decorate}
                onKeyDown={handleKeydown}
                onKeyUp={onKeyUp}
                onPaste={onPaste}
                // Defer to OS capitalization setting (respects iOS sentence-case toggle).
                autoCapitalize="sentences"
                // Detect text direction per-message so RTL languages (Arabic, Hebrew, etc.)
                // automatically right-align without any toggle.
                dir="auto"
                // Trigger autocap re-evaluation when the editor gains focus empty.
                // This handles the initial tap-to-focus case: Slate's DOM contains a
                // \uFEFF placeholder that the keyboard sees as existing content and so
                // skips sentence-case. The attribute toggle forces a re-evaluation.
                // autocapPendingRef prevents double-fire if handleChange also fires
                // (e.g. the send clears content while focus is transferred).
                onFocus={() => {
                  if (mobileOrTablet() && SlateNode.string(editor).length === 0) {
                    triggerAutoCapitalize();
                  }
                }}
                // keeps focus after pressing send.
                onBlur={() => {
                  if (mobileOrTablet()) ReactEditor.focus(editor);
                }}
              />
            </Scroll>
            {(hasAfter || showResponsiveAfterInline) && (
              <Box
                ref={afterRef}
                className={`${css.EditorOptions} ${layoutIsMultiline ? css.EditorOptionsMultiline : ''} ${layoutIsMultiline ? css.EditorOptionsAfterMultiline : ''}`}
                alignItems="Center"
                gap="100"
                shrink="No"
              >
                {showResponsiveAfterInline && responsiveAfter}
                {after}
              </Box>
            )}
            {showResponsiveAfterInFooter && (
              <Box
                className={css.EditorResponsiveAfterMultiline}
                alignItems="Center"
                justifyContent="End"
                gap="100"
              >
                {responsiveAfter}
              </Box>
            )}
          </Box>
          {bottom}
        </Slate>
      </div>
    );
  }
);
