import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomEditor } from './Editor';
import { ProseMirrorEditorController } from './prosemirrorController';
import * as css from './Editor.css';

const platformState = vi.hoisted(() => ({ isIosApp: false, isMobile: false }));
let nativeClipboardText = '';

vi.mock(import('$utils/platform'), async (importOriginal) => ({
  ...(await importOriginal()),
  iosApp: () => platformState.isIosApp,
  isMobileOrTablet: () => platformState.isMobile,
}));

vi.mock(import('$utils/dom'), async (importOriginal) => ({
  ...(await importOriginal()),
  readClipboardText: () => Promise.resolve(nativeClipboardText),
}));

const emptyClientRects = () => [] as unknown as DOMRectList;
beforeAll(() => {
  Element.prototype.getClientRects ??= emptyClientRects;
  (Text.prototype as unknown as Element).getClientRects ??= emptyClientRects;
});

beforeEach(() => {
  platformState.isIosApp = false;
  platformState.isMobile = false;
  nativeClipboardText = '';
});

// vanilla-extract composed styles resolve to several class names, so a plain
// `.${style}` selector would read as a descendant selector.
const byStyle = (container: HTMLElement, className: string) =>
  container.querySelector(`.${className.trim().split(/\s+/).join('.')}`);

const renderEditor = (props: Partial<Parameters<typeof CustomEditor>[0]> = {}) => {
  const editor = props.editor ?? new ProseMirrorEditorController();
  const result = render(
    <CustomEditor
      editableName="TestEditor"
      editor={editor}
      placeholder="Write a message"
      {...props}
    />
  );
  return { editor, ...result };
};

const row = (container: HTMLElement) => byStyle(container, css.EditorRow)!;
const maxHeightOf = (container: HTMLElement) =>
  (byStyle(container, css.EditorTextareaScroll) as HTMLElement).style.maxHeight;

describe('CustomEditor', () => {
  it('mounts a ProseMirror editable surface with the placeholder', () => {
    const { container } = renderEditor();

    expect(container.querySelector('[aria-label="Write a message"]')).toBeTruthy();
    expect(container.querySelector('.ProseMirror')).toBeTruthy();
  });

  it('keeps focus on the editable when the document is cleared', () => {
    const { container, editor } = renderEditor();
    const editable = container.querySelector('.ProseMirror') as HTMLElement;
    editable.focus();

    act(() => editor.insertText('some text'));
    act(() => editor.clear());

    expect(editor.isEmpty()).toBe(true);
    expect(document.activeElement).toBe(editable);
  });

  it('notifies document-change consumers when cleared so autocomplete closes', () => {
    const { editor } = renderEditor();
    const changes: string[] = [];
    editor.subscribe(() => changes.push(editor.getText()));

    act(() => editor.insertText('hello'));
    expect(editor.getAutocompleteQuery(['h', 'he'])).toBeDefined();

    act(() => editor.clear());

    expect(changes).toEqual(['hello', '']);
    expect(editor.getAutocompleteQuery(['h', 'he'])).toBeUndefined();
  });
});

describe('CustomEditor layout', () => {
  it('keeps buttons inline for a single line', () => {
    const { container } = renderEditor({ after: <button type="button">Send</button> });

    expect(row(container)).not.toHaveClass(css.EditorRowMultiline);
  });

  it('moves buttons below text when a single line wraps', async () => {
    const { container, editor } = renderEditor({ after: <button type="button">Send</button> });
    Object.defineProperty(row(container), 'clientWidth', { configurable: true, value: 100 });
    const measurer = container.querySelector('[data-editor-measurer]')!;
    Object.defineProperty(measurer, 'scrollHeight', {
      configurable: true,
      get: () => (measurer.textContent === 'M' ? 20 : 40),
    });

    act(() => editor.insertText('text long enough to wrap several times over in the composer'));

    await waitFor(() => expect(row(container)).toHaveClass(css.EditorRowMultiline));
  });

  it('keeps buttons inline across many paragraphs', async () => {
    const { container, editor } = renderEditor({ after: <button type="button">Send</button> });

    act(() => editor.insertText('one'));
    act(() => editor.insertNewline());
    act(() => editor.insertText('two'));

    await waitFor(() => expect(editor.getText()).toBe('one\ntwo'));
    expect(row(container)).toHaveClass(css.EditorRowMultiline);
  });

  it('installs a hidden measurer for text layout', () => {
    const { container, editor } = renderEditor({ after: <button type="button">Send</button> });

    act(() => editor.insertText('some text'));

    expect(container.querySelector('[data-editor-measurer]')).toBeInTheDocument();
  });

  it('stacks the layout and moves responsive content into the footer when forced', () => {
    const { container } = renderEditor({
      after: <button type="button">Send</button>,
      responsiveAfter: <div data-testid="recorder">Recorder</div>,
      forceMultilineLayout: true,
    });

    expect(row(container)).toHaveClass(css.EditorRowMultiline);
    expect(row(container)).toHaveClass(css.EditorRowMultilineWithResponsiveAfter);
    expect(byStyle(container, css.EditorResponsiveAfterMultiline)).toContainElement(
      screen.getByTestId('recorder')
    );
    expect(maxHeightOf(container)).toBe('');
  });

  it('keeps responsive content inline when not forced', () => {
    const { container } = renderEditor({
      after: <button type="button">Send</button>,
      responsiveAfter: <div data-testid="recorder">Recorder</div>,
    });

    expect(byStyle(container, css.EditorResponsiveAfterMultiline)).toBeNull();
    expect(screen.getByTestId('recorder')).toBeInTheDocument();
    expect(maxHeightOf(container)).toBe('50dvh');
  });
});

const pasteWith = (container: HTMLElement, clipboardData: Record<string, string>) => {
  fireEvent.paste(container.querySelector('.ProseMirror')!, {
    clipboardData: {
      getData: (format: string) => clipboardData[format] ?? '',
      files: [],
      types: Object.keys(clipboardData),
    },
  });
};

// prosemirror's capturePaste schedules a 50ms `view.focus()`; run it out before
// teardown so it cannot fire against a destroyed document.
const flushPasteTimer = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });

describe('CustomEditor paste', () => {
  it('reads the native clipboard when the ios webview delivers an empty paste event', async () => {
    platformState.isIosApp = true;
    nativeClipboardText = 'from the native clipboard';
    const { container, editor } = renderEditor();

    pasteWith(container, { 'text/plain': '' });

    await waitFor(() => expect(editor.getText()).toBe('from the native clipboard'));
    await flushPasteTimer();
  });

  it('leaves an empty paste event alone outside the ios webview', async () => {
    platformState.isIosApp = false;
    nativeClipboardText = 'from the native clipboard';
    const { container, editor } = renderEditor();

    pasteWith(container, { 'text/plain': '' });

    await Promise.resolve();
    expect(editor.getText()).toBe('');
    await flushPasteTimer();
  });

  it('does not read the native clipboard when the event already carries text', async () => {
    platformState.isIosApp = true;
    nativeClipboardText = 'from the native clipboard';
    const { container, editor } = renderEditor();

    pasteWith(container, { 'text/plain': 'real clipboard text' });

    await Promise.resolve();
    expect(editor.getText()).not.toBe('from the native clipboard');
    await flushPasteTimer();
  });

  it('lets a consumer handler pre-empt the native clipboard fallback', async () => {
    platformState.isIosApp = true;
    nativeClipboardText = 'from the native clipboard';
    const { container, editor } = renderEditor({
      onPaste: (event) => event.preventDefault(),
    });

    pasteWith(container, { 'text/plain': '' });

    await Promise.resolve();
    expect(editor.getText()).toBe('');
    await flushPasteTimer();
  });
});

const focusableRival = () => document.body.appendChild(document.createElement('button'));

describe('CustomEditor mobile keyboard', () => {
  it('refocuses the editor when focus moves within the composer on mobile', () => {
    platformState.isMobile = true;
    const { container, editor } = renderEditor({ after: <button type="button">Send</button> });
    const focusSpy = vi.spyOn(editor, 'focus');
    const editable = container.querySelector('.ProseMirror') as HTMLElement;
    const composerButton = screen.getByRole('button', { name: 'Send' });
    editable.focus();
    composerButton.focus();
    expect(focusSpy).toHaveBeenCalledOnce();
  });

  it('yields focus when it moves outside the composer on mobile', () => {
    platformState.isMobile = true;
    const { container, editor } = renderEditor();
    const focusSpy = vi.spyOn(editor, 'focus');
    const editable = container.querySelector('.ProseMirror') as HTMLElement;
    const rival = focusableRival();
    try {
      editable.focus();
      rival.focus();
      expect(focusSpy).not.toHaveBeenCalled();
    } finally {
      rival.remove();
    }
  });

  it('does not refocus on desktop', () => {
    const { container, editor } = renderEditor();
    const focusSpy = vi.spyOn(editor, 'focus');
    const editable = container.querySelector('.ProseMirror') as HTMLElement;
    const rival = focusableRival();
    try {
      editable.focus();
      rival.focus();
      expect(focusSpy).not.toHaveBeenCalled();
    } finally {
      rival.remove();
    }
  });

  it('keeps a programmatic blur so sheets can dismiss the keyboard', () => {
    platformState.isMobile = true;
    const { container, editor } = renderEditor();
    const focusSpy = vi.spyOn(editor, 'focus');
    const editable = container.querySelector('.ProseMirror') as HTMLElement;
    editable.focus();
    editable.blur();
    expect(focusSpy).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(editable);
  });

  it('does not refocus while the composer suppresses it', () => {
    platformState.isMobile = true;
    const { container, editor } = renderEditor({ suppressBlurRefocusRef: { current: true } });
    const focusSpy = vi.spyOn(editor, 'focus');
    const editable = container.querySelector('.ProseMirror') as HTMLElement;
    const rival = focusableRival();
    try {
      editable.focus();
      rival.focus();
      expect(focusSpy).not.toHaveBeenCalled();
    } finally {
      rival.remove();
    }
  });

  it('refocuses when an autocomplete menu holds focus so picking a suggestion keeps the keyboard', () => {
    platformState.isMobile = true;
    const { container, editor } = renderEditor();
    const focusSpy = vi.spyOn(editor, 'focus');
    const editable = container.querySelector('.ProseMirror') as HTMLElement;
    const menuItem = document.createElement('button');
    menuItem.dataset.autocompleteMenu = 'true';
    document.body.appendChild(menuItem);
    try {
      editable.focus();
      menuItem.focus();
      expect(focusSpy).toHaveBeenCalledOnce();
    } finally {
      menuItem.remove();
    }
  });
});
