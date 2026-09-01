import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Selection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { EditorDocument } from './model';
import { markEventConsumedByHost, ProseMirrorEditable } from './ProseMirrorEditable';
import { ProseMirrorEditorController } from './prosemirrorController';
import { BlockType } from './types';

// ProseMirror scrolls the selection into view after a transaction, which needs
// client rects jsdom does not implement.
const emptyClientRects = () => [] as unknown as DOMRectList;
const emptyClientRect = () =>
  ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }) as DOMRect;
beforeAll(() => {
  Element.prototype.getClientRects ??= emptyClientRects;
  (Text.prototype as unknown as Element).getClientRects ??= emptyClientRects;
  (Range.prototype as unknown as Element).getClientRects ??= emptyClientRects;
  (Range.prototype as unknown as Element).getBoundingClientRect ??= emptyClientRect;
});

const doc = (...texts: string[]): EditorDocument =>
  texts.map((text) => ({ type: BlockType.Paragraph, children: [{ text }] }));

const beforeinput = (el: HTMLElement, inputType: string) => {
  const event = new Event('beforeinput', { bubbles: true, cancelable: true });
  Object.assign(event, { inputType });
  fireEvent(el, event);
};

const mount = (initial: EditorDocument = doc('')) => {
  const controller = new ProseMirrorEditorController(initial);
  const result = render(<ProseMirrorEditable controller={controller} />);
  const editable = result.container.querySelector('.ProseMirror') as HTMLElement;
  const view = (controller as unknown as { view: EditorView }).view;
  const caretToEnd = () =>
    view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)));
  return { caretToEnd, controller, editable, view };
};

describe('ProseMirrorEditorController empty-document invariant', () => {
  it('reports empty after the user deletes every character', () => {
    const { controller, view } = mount(doc('hi'));

    view.dispatch(view.state.tr.delete(1, view.state.doc.content.size - 1));

    expect(controller.getDocument()).toEqual(doc(''));
    expect(controller.isEmpty()).toBe(true);
  });

  it('reports empty after clear() on a document that had content', () => {
    const { controller } = mount(doc('sent message'));

    controller.clear();

    expect(controller.getDocument()).toEqual(doc(''));
    expect(controller.isEmpty()).toBe(true);
  });

  it('keeps one text token per paragraph so serializers see a well-formed document', () => {
    const { controller, view } = mount(doc('a', 'b'));

    view.dispatch(view.state.tr.delete(1, 2));

    expect(controller.getDocument()).toEqual(doc('', 'b'));
  });
});

describe('ProseMirrorEditorController appendDocument', () => {
  it('appends after existing content instead of before it', () => {
    const { controller } = mount(doc('existing'));

    controller.appendDocument(doc('restored'));

    expect(controller.getDocument()).toEqual(doc('existing', 'restored'));
  });

  it('replaces the document outright when the composer is empty', () => {
    const { controller } = mount(doc(''));

    controller.appendDocument(doc('draft text'));

    expect(controller.getDocument()).toEqual(doc('draft text'));
  });

  it('appends multiple paragraphs in order without inserting a blank one', () => {
    const { controller } = mount(doc('existing'));

    controller.appendDocument(doc('one', 'two'));

    expect(controller.getDocument()).toEqual(doc('existing', 'one', 'two'));
  });

  it('ignores an empty append', () => {
    const { controller } = mount(doc('existing'));

    controller.appendDocument([]);

    expect(controller.getDocument()).toEqual(doc('existing'));
  });
});

describe('ProseMirrorEditorController getText', () => {
  it('returns the full text so callers can slice a leading prefix', () => {
    const { controller } = mount(doc('+#hello'));

    expect(controller.getText()).toBe('+#hello');
    expect(controller.getText().slice(0, 2)).toBe('+#');
  });

  it('joins paragraphs with newlines', () => {
    const { controller } = mount(doc('one', 'two'));

    expect(controller.getText()).toBe('one\ntwo');
  });
});

describe('ProseMirrorEditorController autocomplete queries', () => {
  it('only returns beginning-only prefixes from the first paragraph', () => {
    const { caretToEnd, controller } = mount(doc('message +:wave'));
    caretToEnd();

    expect(controller.getAutocompleteQuery(['+:'], true)).toBeUndefined();
  });

  it('allows beginning-only prefixes after leading whitespace', () => {
    const { caretToEnd, controller } = mount(doc('  +:wave'));
    caretToEnd();

    expect(controller.getAutocompleteQuery(['+:'], true)).toMatchObject({
      prefix: '+:',
      text: 'wave',
    });
  });
});

describe('placeholder', () => {
  it('exposes the placeholder to assistive tech and to the overlay', () => {
    const controller = new ProseMirrorEditorController(doc(''));
    const { container } = render(
      <ProseMirrorEditable controller={controller} placeholder="Write a message" />
    );
    const editable = container.querySelector('.ProseMirror')!;

    expect(editable).toHaveAttribute('aria-label', 'Write a message');
    expect(editable).toHaveAttribute('data-placeholder', 'Write a message');
    expect(editable).toHaveAttribute('data-placeholder-visible', 'true');
  });

  it('hides the placeholder once the document has content', () => {
    const controller = new ProseMirrorEditorController(doc(''));
    const { container } = render(
      <ProseMirrorEditable controller={controller} placeholder="Write a message" />
    );

    act(() => controller.insertText('typed'));

    expect(container.querySelector('.ProseMirror')).toHaveAttribute(
      'data-placeholder-visible',
      'false'
    );
  });

  it('shows the placeholder again after the composer is cleared', () => {
    const controller = new ProseMirrorEditorController(doc('sent'));
    const { container } = render(
      <ProseMirrorEditable controller={controller} placeholder="Write a message" />
    );

    act(() => controller.clear());

    expect(container.querySelector('.ProseMirror')).toHaveAttribute(
      'data-placeholder-visible',
      'true'
    );
  });
});

describe('Enter handling', () => {
  it('does not split the paragraph when the host consumes Enter', () => {
    const controller = new ProseMirrorEditorController(doc('hello'));
    const onKeyDown = vi.fn<(event: { preventDefault: () => void; nativeEvent: Event }) => void>(
      (event) => {
        event.preventDefault();
        markEventConsumedByHost(event.nativeEvent);
      }
    );
    const { container } = render(
      <ProseMirrorEditable controller={controller} onKeyDown={onKeyDown} />
    );

    fireEvent.keyDown(container.querySelector('.ProseMirror')!, { key: 'Enter', keyCode: 13 });

    expect(onKeyDown).toHaveBeenCalled();
    expect(controller.getDocument()).toEqual(doc('hello'));
  });

  it('breaks the line when the host leaves Enter unhandled', () => {
    const { caretToEnd, controller, editable } = mount(doc('hello'));
    caretToEnd();

    fireEvent.keyDown(editable, { key: 'Enter', keyCode: 13 });

    expect(controller.getDocument()).toEqual(doc('hello', ''));
  });

  it('breaks the line on Shift+Enter', () => {
    const { caretToEnd, controller, editable } = mount(doc('hello'));
    caretToEnd();

    fireEvent.keyDown(editable, { key: 'Enter', keyCode: 13, shiftKey: true });

    expect(controller.getDocument()).toEqual(doc('hello', ''));
  });

  it('leaves an in-flight IME composition alone', () => {
    const { controller, editable } = mount(doc('hello'));

    fireEvent.keyDown(editable, { key: 'Enter', keyCode: 13, isComposing: true });

    expect(controller.getDocument()).toEqual(doc('hello'));
  });
});

describe('clipboard', () => {
  it('uses plain text instead of a structural HTML clipboard payload', () => {
    const { caretToEnd, controller, editable } = mount(doc('hello'));
    caretToEnd();

    fireEvent.paste(editable, {
      clipboardData: {
        getData: (type: string) =>
          type === 'text/plain' ? ' copied text' : '<p> copied text</p><p>unexpected line</p>',
      },
    });

    expect(controller.getDocument()).toEqual(doc('hello copied text'));
  });

  it('preserves pasted line breaks', () => {
    const { controller, editable } = mount();

    fireEvent.paste(editable, {
      clipboardData: { getData: () => 'first\n\nthird' },
    });

    expect(controller.getDocument()).toEqual(doc('first', '', 'third'));
  });
});

describe('ProseMirrorEditorController clear', () => {
  it('keeps undo working while composing, then wipes it once cleared', () => {
    const { controller } = mount();

    controller.insertText('hello');
    controller.undo();
    expect(controller.getDocument()).toEqual(doc(''));

    controller.insertText('draft');
    controller.clear();
    controller.undo();
    expect(controller.getDocument()).toEqual(doc(''));
  });

  it('reuses the focused editable so rebuilding state does not steal focus', () => {
    const { controller, editable } = mount(doc('draft'));
    editable.focus();

    act(() => controller.clear());

    expect(editable).toBe(document.activeElement);
    expect(editable).toHaveAttribute('data-placeholder-visible', 'true');
  });
});

describe('Android backspace fallback', () => {
  const originalUserAgent = navigator.userAgent;

  const setAndroid = (android: boolean) => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: android
        ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36'
        : originalUserAgent,
    });
  };

  afterEach(() => {
    setAndroid(false);
    vi.useRealTimers();
  });

  it('deletes backward via the state when the IME leaves the DOM untouched, without blurring', () => {
    setAndroid(true);
    vi.useFakeTimers();
    const { caretToEnd, controller, editable } = mount(doc('hi'));
    caretToEnd();
    editable.focus();
    const onBlur = vi.fn<() => void>();
    editable.addEventListener('blur', onBlur);

    beforeinput(editable, 'deleteContentBackward');
    act(() => vi.advanceTimersByTime(50));

    expect(controller.getDocument()).toEqual(doc('h'));
    expect(onBlur).not.toHaveBeenCalled();
  });

  it('leaves the deletion to the observer once the state already changed', () => {
    setAndroid(true);
    vi.useFakeTimers();
    const { caretToEnd, controller, editable, view } = mount(doc('hi'));
    caretToEnd();

    beforeinput(editable, 'deleteContentBackward');
    // The IME deleted in the DOM and the observer applied it first.
    act(() => {
      const from = view.state.selection.from;
      view.dispatch(view.state.tr.delete(from - 1, from));
      vi.advanceTimersByTime(50);
    });

    expect(controller.getDocument()).toEqual(doc('h'));
  });

  it('does not intercept Android input other than backward deletes', () => {
    setAndroid(true);
    vi.useFakeTimers();
    const { caretToEnd, controller, editable } = mount(doc('hi'));
    caretToEnd();

    beforeinput(editable, 'insertText');
    act(() => vi.advanceTimersByTime(50));

    expect(controller.getDocument()).toEqual(doc('hi'));
  });

  it('leaves non-Android devices to the built-in handler', () => {
    vi.useFakeTimers();
    const { caretToEnd, controller, editable } = mount(doc('hi'));
    caretToEnd();

    beforeinput(editable, 'deleteContentBackward');
    act(() => vi.advanceTimersByTime(50));

    expect(controller.getDocument()).toEqual(doc('hi'));
  });
});
