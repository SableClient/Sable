import type {
  ClipboardEventHandler,
  KeyboardEventHandler,
  MutableRefObject,
  ReactNode,
} from 'react';
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box, Scroll } from 'folds';
import { iosApp, isMobileOrTablet } from '$utils/platform';
import { readClipboardText } from '$utils/dom';
import { createLogger } from '$utils/debug';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import type { EditorDocument } from './model';
import { ProseMirrorEditable } from './ProseMirrorEditable';
import { ProseMirrorEditorController } from './prosemirrorController';
import { toggleProseMirrorKeyboardShortcut } from './keyboard';
import { useEditorRenderContext } from './useEditorRenderContext';
import * as css from './Editor.css';

export const useEditor = (): ProseMirrorEditorController => {
  const [editor] = useState(() => new ProseMirrorEditorController());
  const renderContext = useEditorRenderContext();
  useEffect(() => {
    editor.setRenderContext(renderContext);
  }, [editor, renderContext]);
  return editor;
};

const log = createLogger('Editor');
const MULTILINE_HEIGHT_EPSILON = 1;
const TRAILING_SPACE_SENTINEL = '\u200B';

const normalizeMeasurementText = (text: string): string =>
  /[ \t]+$/.test(text) ? `${text}${TRAILING_SPACE_SENTINEL}` : text;

type CustomEditorProps = {
  after?: ReactNode;
  before?: ReactNode;
  bottom?: ReactNode;
  className?: string;
  editableName?: string;
  editor: ProseMirrorEditorController;
  enterKeyHint?: 'enter' | 'send';
  forceMultilineLayout?: boolean;
  maxHeight?: string;
  onChange?: (value: EditorDocument) => void;
  onKeyDown?: KeyboardEventHandler;
  onKeyUp?: KeyboardEventHandler;
  onPaste?: ClipboardEventHandler;
  placeholder?: string;
  responsiveAfter?: ReactNode;
  suppressBlurRefocusRef?: MutableRefObject<boolean>;
  top?: ReactNode;
  variant?: 'Surface' | 'SurfaceVariant' | 'Background';
};

/**
 * Visual shell for the Sable editor. Its interface is engine-neutral: callers
 * interact with a controller and Sable documents, never an editor engine state.
 */
export const CustomEditor = forwardRef<HTMLDivElement, CustomEditorProps>(
  (
    {
      after,
      before,
      bottom,
      className,
      editableName,
      editor,
      enterKeyHint,
      forceMultilineLayout = false,
      maxHeight = '50dvh',
      onChange,
      onKeyDown,
      onKeyUp,
      onPaste,
      placeholder,
      responsiveAfter,
      suppressBlurRefocusRef,
      variant = 'SurfaceVariant',
      top,
    },
    ref
  ) => {
    const [shortcutOverrides] = useSetting(settingsAtom, 'shortcutOverrides');
    const [alwaysInlineEditor] = useSetting(settingsAtom, 'alwaysInlineEditor');
    const rootRef = useRef<HTMLDivElement | null>(null);
    const rowRef = useRef<HTMLDivElement | null>(null);
    const beforeRef = useRef<HTMLDivElement | null>(null);
    const afterRef = useRef<HTMLDivElement | null>(null);
    const editableRef = useRef<HTMLDivElement | null>(null);
    const measurerRef = useRef<HTMLDivElement | null>(null);
    const latestTextRef = useRef(editor.getText());
    const focusScrollTimerRef = useRef<number | undefined>(undefined);
    const layoutFrameRef = useRef<number | undefined>(undefined);
    const [isMultiline, setIsMultiline] = useState(false);

    const hasBefore = Boolean(before);
    const hasAfter = Boolean(after);
    const layoutIsMultiline = !alwaysInlineEditor && (isMultiline || forceMultilineLayout);
    const showResponsiveAfterInFooter = Boolean(responsiveAfter) && layoutIsMultiline;

    const updateMultilineLayout = useCallback(() => {
      const text = latestTextRef.current;
      const row = rowRef.current;
      const measurer = measurerRef.current;
      const editable = editableRef.current;
      if (!row || !measurer || !editable) return;

      let nextMultiline = text.includes('\n');
      if (!nextMultiline && text.length > 0) {
        const computedStyle = getComputedStyle(editable);
        const beforeWidth = beforeRef.current?.offsetWidth ?? 0;
        const afterWidth = afterRef.current?.offsetWidth ?? 0;
        const width = Math.max(0, row.clientWidth - beforeWidth - afterWidth);
        if (width > 0) {
          Object.assign(measurer.style, {
            font: computedStyle.font,
            lineHeight: computedStyle.lineHeight,
            letterSpacing: computedStyle.letterSpacing,
            fontKerning: computedStyle.fontKerning,
            fontFeatureSettings: computedStyle.fontFeatureSettings,
            fontVariationSettings: computedStyle.fontVariationSettings,
            textTransform: computedStyle.textTransform,
            textIndent: computedStyle.textIndent,
            tabSize: computedStyle.tabSize,
            width: 'max-content',
          });
          measurer.textContent = 'M';
          const singleLineHeight = measurer.scrollHeight;
          measurer.style.width = `${width}px`;
          measurer.textContent = normalizeMeasurementText(text);
          nextMultiline = measurer.scrollHeight > singleLineHeight + MULTILINE_HEIGHT_EPSILON;
        }
      }
      setIsMultiline((currentMultiline) =>
        currentMultiline === nextMultiline ? currentMultiline : nextMultiline
      );
    }, []);

    const scheduleMultilineLayout = useCallback(() => {
      if (layoutFrameRef.current !== undefined) return;
      layoutFrameRef.current = requestAnimationFrame(() => {
        layoutFrameRef.current = undefined;
        updateMultilineLayout();
      });
    }, [updateMultilineLayout]);

    useEffect(() => {
      const root = rootRef.current;
      if (!root) return undefined;
      const measurerHost = document.createElement('div');
      const measurer = document.createElement('div');
      measurer.dataset.editorMeasurer = editableName ?? '';
      Object.assign(measurerHost.style, {
        position: 'absolute',
        width: '0',
        height: '0',
        overflow: 'hidden',
        pointerEvents: 'none',
        visibility: 'hidden',
      });
      Object.assign(measurer.style, {
        padding: '0',
        border: '0',
        margin: '0',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
        wordBreak: 'break-word',
        boxSizing: 'border-box',
      });
      measurerHost.appendChild(measurer);
      root.appendChild(measurerHost);
      measurerRef.current = measurer;
      return () => {
        measurerRef.current = null;
        measurerHost.remove();
      };
    }, [editableName]);

    useLayoutEffect(() => {
      scheduleMultilineLayout();
      return () => {
        if (layoutFrameRef.current !== undefined) {
          cancelAnimationFrame(layoutFrameRef.current);
          layoutFrameRef.current = undefined;
        }
      };
    }, [scheduleMultilineLayout]);

    useEffect(() => {
      if (typeof ResizeObserver === 'undefined') return undefined;
      const observer = new ResizeObserver(scheduleMultilineLayout);
      [rowRef.current, beforeRef.current, afterRef.current].forEach((element) => {
        if (element) observer.observe(element);
      });
      return () => observer.disconnect();
    }, [scheduleMultilineLayout, hasBefore, hasAfter]);

    useEffect(() => () => window.clearTimeout(focusScrollTimerRef.current), []);
    const handleKeyDown: KeyboardEventHandler = useCallback(
      (event) => {
        onKeyDown?.(event);
        if (
          !event.defaultPrevented &&
          toggleProseMirrorKeyboardShortcut(editor, event, shortcutOverrides)
        ) {
          event.preventDefault();
        }
      },
      [editor, onKeyDown, shortcutOverrides]
    );
    const handlePaste: ClipboardEventHandler = useCallback(
      (event) => {
        onPaste?.(event);
        if (event.defaultPrevented || !iosApp() || event.clipboardData.getData('text/plain'))
          return;
        event.preventDefault();
        readClipboardText()
          .then((text) => text && editor.insertText(text))
          .catch((error: unknown) =>
            log.warn('Failed to read the native clipboard on paste:', error)
          );
      },
      [editor, onPaste]
    );

    useEffect(() => {
      editor.setDomEventHandlers({
        blur: (event) => {
          if (!isMobileOrTablet() || suppressBlurRefocusRef?.current) return;
          const next = event.relatedTarget as HTMLElement | null;
          if (!next || next.isContentEditable) return;
          // Only reclaim focus when it moved within the composer, so taps on
          // the timeline (e.g. images) dismiss the keyboard.
          if (!rootRef.current?.contains(next) && !next.closest('[data-autocomplete-menu]')) return;
          editor.focus();
        },
        focus: () => {
          if (!isMobileOrTablet()) return;
          const editable = document.activeElement;
          window.clearTimeout(focusScrollTimerRef.current);
          const scrollIntoView = () => {
            if (editable && editable === document.activeElement) {
              rootRef.current?.scrollIntoView({ block: 'nearest' });
            }
          };
          window.visualViewport?.addEventListener('resize', scrollIntoView, { once: true });
          focusScrollTimerRef.current = window.setTimeout(scrollIntoView, 500);
        },
      });
      return () => editor.setDomEventHandlers({});
    }, [editor, suppressBlurRefocusRef]);

    const setRootRef = useCallback(
      (element: HTMLDivElement | null) => {
        rootRef.current = element;
        if (typeof ref === 'function') ref(element);
        else if (ref) ref.current = element;
      },
      [ref]
    );
    const handleDocumentChange = useCallback(
      (document: EditorDocument) => {
        latestTextRef.current = editor.getText();
        scheduleMultilineLayout();
        onChange?.(document);
      },
      [editor, onChange, scheduleMultilineLayout]
    );

    return (
      <div ref={setRootRef} className={`${css.Editor} ${className ?? ''}`}>
        {top}
        <Box
          ref={rowRef}
          className={`${css.EditorRow} ${layoutIsMultiline ? css.EditorRowMultiline : ''} ${showResponsiveAfterInFooter ? css.EditorRowMultilineWithResponsiveAfter : ''}`}
          alignItems="Start"
          style={{ display: after ? 'grid' : 'flex' }}
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
            style={{ maxHeight: showResponsiveAfterInFooter ? undefined : maxHeight }}
            size="300"
            visibility="Always"
            hideTrack
          >
            <ProseMirrorEditable
              onHostChange={(element) => {
                editableRef.current = element;
              }}
              controller={editor}
              editableName={editableName}
              editorClassName={css.EditorTextarea}
              placeholder={placeholder}
              enterKeyHint={enterKeyHint}
              onDocumentChange={handleDocumentChange}
              onKeyDown={handleKeyDown}
              onKeyUp={onKeyUp}
              onPaste={handlePaste}
            />
          </Scroll>
          {(after || (responsiveAfter && !showResponsiveAfterInFooter)) && (
            <Box
              ref={afterRef}
              className={`${css.EditorOptions} ${layoutIsMultiline ? `${css.EditorOptionsMultiline} ${css.EditorOptionsAfterMultiline}` : ''}`}
              alignItems="Center"
              gap="100"
              shrink="No"
            >
              {!showResponsiveAfterInFooter && responsiveAfter}
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
      </div>
    );
  }
);
