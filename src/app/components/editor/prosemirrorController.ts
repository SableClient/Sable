import { baseKeymap, splitBlock } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState, Selection, TextSelection, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Fragment, Slice, type Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorDocument, InlineToken } from './model';
import { emptyEditorDocument, isEditorText } from './model';
import type { EditorRenderContext } from './prosemirrorNodeViews';
import {
  beginCommandPlugin,
  buildEditorNodeViews,
  defaultEditorRenderContext,
} from './prosemirrorNodeViews';
import {
  editorSchema,
  fromProseMirrorDocument,
  toProseMirrorDocument,
  toProseMirrorInline,
} from './prosemirrorSchema';
import { markdownPreviewPlugin, setMarkdownPreviewDispatch } from './markdown';

const isProseMirrorDocumentEmpty = (doc: ProseMirrorNode): boolean =>
  doc.childCount === 1 && doc.firstChild?.content.size === 0;

// Mirrors prosemirror-view's own Android gate for its backspace fallback.
const isAndroid = (): boolean => /Android \d/.test(navigator.userAgent);

const androidBackspaceKeyEvent = (): KeyboardEvent =>
  new KeyboardEvent('keydown', {
    key: 'Backspace',
    code: 'Backspace',
    bubbles: true,
    cancelable: true,
  });

/**
 * prosemirror-view resyncs an Android backspace that left the DOM untouched by
 * blurring and refocusing the editable, which flashes the soft keyboard shut.
 * Delete through the state instead.
 */
const handleAndroidDeleteBackward = (view: EditorView): void => {
  const cursor =
    view.state.selection instanceof TextSelection ? view.state.selection.$cursor : null;
  if (!cursor || cursor.pos <= 0) return;
  const pos = cursor.pos;
  const contentSize = view.state.doc.content.size;
  window.setTimeout(() => {
    // The IME deleted in the DOM; leave it to the DOM observer.
    const cursorAfter =
      view.state.selection instanceof TextSelection ? view.state.selection.$cursor : null;
    if (!cursorAfter || cursorAfter.pos !== pos) return;
    if (view.state.doc.content.size !== contentSize) return;
    // Prefer the keymap so atom nodes follow desktop Backspace behavior.
    if (view.someProp('handleKeyDown', (handler) => handler(view, androidBackspaceKeyEvent())))
      return;
    view.dispatch(view.state.tr.delete(pos - 1, pos));
  }, 50);
};

const paragraphToPreviewText = (paragraph: ProseMirrorNode): string => {
  let text = '';
  paragraph.content.forEach((child) => {
    if (child.isText) {
      text += child.text ?? '';
    } else if (child.type.name === 'mention') {
      text += `@${(child.attrs.name as string | undefined) ?? ''}`;
    } else if (child.type.name === 'emoticon') {
      text += (child.attrs.shortcode as string | undefined) ?? '';
    } else if (child.type.name === 'command') {
      text += (child.attrs.name as string | undefined) ?? '';
    } else {
      text += child.textContent ?? '';
    }
  });
  return text;
};

export type EditorAutocompleteQuery<TPrefix extends string> = {
  from: number;
  prefix: TPrefix;
  text: string;
  to: number;
};

export type EditorDomEventHandlers = {
  blur?: (event: FocusEvent) => void;
  focus?: (event: FocusEvent) => void;
};

/**
 * The sole editor-engine seam. Consumers exchange Sable documents and never
 * retain an EditorState or EditorView.
 */
export class ProseMirrorEditorController {
  private attributes: Record<string, string> = {};
  private document: EditorDocument;
  private domEventHandlers: EditorDomEventHandlers = {};
  private listeners = new Set<(document: EditorDocument) => void>();
  private renderContext: EditorRenderContext = defaultEditorRenderContext;
  private view: EditorView | undefined;

  constructor(initialDocument: EditorDocument = emptyEditorDocument()) {
    this.document = structuredClone(initialDocument);
  }

  setAttributes(attributes: Record<string, string>): void {
    const unchanged =
      Object.keys(attributes).length === Object.keys(this.attributes).length &&
      Object.entries(attributes).every(([key, value]) => this.attributes[key] === value);
    if (unchanged) return;
    this.attributes = attributes;
    this.view?.setProps({ attributes: this.viewAttributes });
  }

  private viewAttributes = (state: EditorState): Record<string, string> => ({
    ...this.attributes,
    'data-placeholder-visible': String(isProseMirrorDocumentEmpty(state.doc)),
  });

  /** Rebuilding node views is a full redraw, so only react to a real change. */
  setRenderContext(context: EditorRenderContext): void {
    if (context === this.renderContext) return;
    this.renderContext = context;
    this.view?.setProps({ nodeViews: buildEditorNodeViews(() => this.renderContext) });
  }

  setDomEventHandlers(handlers: EditorDomEventHandlers): void {
    this.domEventHandlers = handlers;
  }

  get children(): EditorDocument {
    return this.getDocument();
  }

  getDocument(): EditorDocument {
    return structuredClone(this.document);
  }

  isEmpty(): boolean {
    const firstParagraph = this.document[0];
    const firstToken = firstParagraph?.children[0];
    return (
      this.document.length === 1 &&
      firstParagraph?.children.length === 1 &&
      !!firstToken &&
      isEditorText(firstToken) &&
      firstToken.text === ''
    );
  }

  isSelectionAtStart(): boolean {
    const view = this.view;
    return !!view && view.state.selection.empty && view.state.selection.from === 1;
  }

  getText(): string {
    const view = this.view;
    if (view) return view.state.doc.textBetween(0, view.state.doc.content.size, '\n', '\0');
    return this.document
      .map((paragraph) =>
        paragraph.children.map((child) => (isEditorText(child) ? child.text : '')).join('')
      )
      .join('\n');
  }

  /** Like getText, but atoms (mentions, emoticons, commands) contribute their
   * display text instead of the \0 placeholder. */
  getMarkdownPreviewText(): string {
    const view = this.view;
    if (!view) return this.getText();
    const paragraphs: string[] = [];
    view.state.doc.content.forEach((paragraph) =>
      paragraphs.push(paragraphToPreviewText(paragraph))
    );
    return paragraphs.join('\n');
  }

  setDocument(document: EditorDocument): void {
    this.document = structuredClone(document.length ? document : emptyEditorDocument());
    if (this.view) {
      const nextDocument = toProseMirrorDocument(this.document);
      if (this.view.state.doc.eq(nextDocument)) return;
      const transaction = this.view.state.tr.replaceWith(
        0,
        this.view.state.doc.content.size,
        nextDocument.content
      );
      // Put the caret after the new content rather than wherever the old ended.
      transaction.setSelection(Selection.atEnd(transaction.doc));
      this.view.dispatch(transaction);
      return;
    }
    this.notify();
  }

  appendDocument(document: EditorDocument): void {
    if (!document.length) return;
    this.setDocument(this.isEmpty() ? document : [...this.document, ...document]);
  }

  private createState(): EditorState {
    return EditorState.create({
      doc: toProseMirrorDocument(this.document),
      plugins: [
        beginCommandPlugin,
        markdownPreviewPlugin,
        history(),
        keymap({ 'Mod-z': undo, 'Mod-Shift-z': redo, 'Mod-y': redo }),
        // Enter is withheld on purpose: the host decides send vs newline.
        // Binding it here also splits the paragraph, on top of whatever it did.
        keymap(Object.fromEntries(Object.entries(baseKeymap).filter(([key]) => key !== 'Enter'))),
      ],
      schema: editorSchema,
    });
  }

  mount(element: HTMLElement, attributes?: Record<string, string>): () => void {
    this.view?.destroy();
    this.attributes = attributes ?? {};
    const state = this.createState();
    this.view = new EditorView(
      { mount: element },
      {
        attributes: this.viewAttributes,
        handleDOMEvents: {
          focus: (_view, event) => {
            this.domEventHandlers.focus?.(event as FocusEvent);
            return false;
          },
          blur: (_view, event) => {
            this.domEventHandlers.blur?.(event as FocusEvent);
            return false;
          },
          beforeinput: (view, event) => {
            if (!isAndroid() || (event as InputEvent).inputType !== 'deleteContentBackward')
              return false;
            handleAndroidDeleteBackward(view);
            return true;
          },
        },
        handlePaste: (view, event) => {
          const text = event.clipboardData?.getData('text/plain');
          if (text === undefined || text === '') return false;

          const paragraphs = text
            .split(/\r\n?|\n/)
            .map((line) =>
              editorSchema.nodes.paragraph.create(
                undefined,
                line ? editorSchema.text(line) : undefined
              )
            );
          view.dispatch(
            view.state.tr.replaceSelection(Slice.maxOpen(Fragment.from(paragraphs), true))
          );
          return true;
        },
        nodeViews: buildEditorNodeViews(() => this.renderContext),
        state,
        dispatchTransaction: (transaction: Transaction) => {
          const view = this.view;
          if (!view) return;
          view.updateState(view.state.apply(transaction));
          if (transaction.docChanged) {
            this.document = fromProseMirrorDocument(view.state.doc);
            this.notify();
          }
        },
      }
    );
    setMarkdownPreviewDispatch(() => {
      const view = this.view;
      if (view) view.dispatch(view.state.tr);
    });
    return () => {
      setMarkdownPreviewDispatch(null);
      this.view?.destroy();
      this.view = undefined;
    };
  }

  focus(): void {
    this.view?.focus();
  }

  /** Drops the undo stack too: cleared content was sent, consumed, or abandoned. */
  clear(): void {
    this.setDocument(emptyEditorDocument());
    if (this.view) this.view.updateState(this.createState());
  }

  blur(): void {
    (this.view?.dom as HTMLElement | undefined)?.blur();
  }

  undo(): void {
    if (this.view) undo(this.view.state, this.view.dispatch);
  }

  redo(): void {
    if (this.view) redo(this.view.state, this.view.dispatch);
  }

  insertText(text: string): void {
    const view = this.view;
    if (view) view.dispatch(view.state.tr.insertText(text));
  }

  insertNewline(): void {
    const view = this.view;
    if (view) splitBlock(view.state, view.dispatch);
  }

  insertInline(token: InlineToken, from?: number, to?: number): void {
    const view = this.view;
    const node = toProseMirrorInline(token);
    if (!view || !node) return;
    const start = from ?? view.state.selection.from;
    const end = to ?? view.state.selection.to;
    const transaction = view.state.tr.replaceWith(start, end, node);
    transaction.setSelection(TextSelection.create(transaction.doc, start + node.nodeSize));
    view.dispatch(transaction);
  }

  getAutocompleteQuery<TPrefix extends string>(
    prefixes: readonly TPrefix[],
    atDocumentStart = false
  ): EditorAutocompleteQuery<TPrefix> | undefined {
    const view = this.view;
    if (!view || !view.state.selection.empty) return undefined;
    const { $from, from } = view.state.selection;
    const precedingText = view.state.doc.textBetween($from.start(), from, '\n', '\0');
    const word = precedingText.match(/(?:^|\s)(\S*)$/)?.[1];
    if (!word) return undefined;
    const prefix = prefixes.find((candidate) => word.startsWith(candidate));
    if (!prefix) return undefined;
    const queryFrom = from - word.length;
    if (
      atDocumentStart &&
      ($from.parent !== view.state.doc.firstChild ||
        view.state.doc.textBetween(1, queryFrom, '\n', '\0').trim() !== '')
    ) {
      return undefined;
    }
    return { from: queryFrom, to: from, prefix, text: word.slice(prefix.length) };
  }

  applyMarkdownInline(marker: string): void {
    const view = this.view;
    if (!view) return;
    const { from, to, empty } = view.state.selection;
    const selectedText = empty ? '' : view.state.doc.textBetween(from, to, '\n', '\0');
    const transaction = view.state.tr.insertText(`${marker}${selectedText}${marker}`, from, to);
    transaction.setSelection(
      TextSelection.create(transaction.doc, from + marker.length + selectedText.length)
    );
    view.dispatch(transaction);
  }

  applyMarkdownBlockPrefix(prefix: string): void {
    const view = this.view;
    if (view) view.dispatch(view.state.tr.insertText(prefix, view.state.selection.$from.start()));
  }

  subscribe(listener: (document: EditorDocument) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener(this.getDocument()));
  }
}
