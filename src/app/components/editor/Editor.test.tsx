import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { Transforms } from 'slate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useEditor, CustomEditor } from './Editor';
import { BlockType } from './types';
import * as css from './Editor.css';

let shouldWrapToggleHarness = false;
let measurementCacheScrollHeightReads = 0;

function EditorHarness() {
  const editor = useEditor();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          Transforms.insertNodes(editor, {
            type: BlockType.Paragraph,
            children: [{ text: 'Second line' }],
          });
        }}
      >
        Make multiline
      </button>
      <CustomEditor
        editableName="EditorHarness"
        editor={editor}
        before={<button type="button">Attach</button>}
        after={<button type="button">Send</button>}
        responsiveAfter={<div data-testid="recorder">Recorder</div>}
      />
    </>
  );
}

function ToggleRecorderHarness() {
  const editor = useEditor();
  const [showRecorder, setShowRecorder] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          Transforms.insertText(editor, 'Some text that still fits before recording');
        }}
      >
        Add text
      </button>
      <button
        type="button"
        onClick={() => {
          shouldWrapToggleHarness = true;
          setShowRecorder(true);
        }}
      >
        Start recorder
      </button>
      <CustomEditor
        editableName="ToggleRecorderHarness"
        editor={editor}
        before={<button type="button">Attach</button>}
        after={<button type="button">Send</button>}
        responsiveAfter={
          showRecorder ? <div data-testid="toggle-recorder">Recorder</div> : undefined
        }
      />
    </>
  );
}

function ForcedFooterHarness() {
  const editor = useEditor();

  return (
    <CustomEditor
      editableName="ForcedFooterHarness"
      editor={editor}
      before={<button type="button">Attach</button>}
      after={<button type="button">Send</button>}
      responsiveAfter={<div data-testid="forced-footer-recorder">Recorder</div>}
      forceMultilineLayout
    />
  );
}

function PasteWrapHarness() {
  const editor = useEditor();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          Transforms.insertText(editor, 'sadasdasdsadasdasdsadasdasd');
        }}
      >
        Paste wrapped text
      </button>
      <CustomEditor editableName="PasteWrapHarness" editor={editor} />
    </>
  );
}

function NearThresholdWrapHarness() {
  const editor = useEditor();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          Transforms.insertText(editor, 'near-threshold wrap text');
        }}
      >
        Paste near-threshold wrap
      </button>
      <CustomEditor editableName="NearThresholdWrapHarness" editor={editor} />
    </>
  );
}

function TrailingSpacesWrapHarness() {
  const editor = useEditor();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          Transforms.insertText(editor, 'trailing spaces ');
        }}
      >
        Paste trailing spaces
      </button>
      <CustomEditor editableName="TrailingSpacesWrapHarness" editor={editor} />
    </>
  );
}

function PasteNoWrapHarness() {
  const editor = useEditor();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          Transforms.insertText(editor, 'short pasted text');
        }}
      >
        Paste short text
      </button>
      <CustomEditor editableName="PasteNoWrapHarness" editor={editor} />
    </>
  );
}

function MeasurementCacheHarness() {
  const editor = useEditor();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          Transforms.insertText(editor, 'sadasdasdsadasdasdsadasdasd');
        }}
      >
        Add cached text
      </button>
      <CustomEditor editableName="MeasurementCacheHarness" editor={editor} />
    </>
  );
}

const createResizeObserverStub = (
  observedElements: Set<Element>,
  onCreate: (callback: ResizeObserverCallback) => void
) =>
  function ResizeObserverStub(callback: ResizeObserverCallback) {
    onCreate(callback);

    return {
      observe(target: Element) {
        observedElements.add(target);
      },
      unobserve(target: Element) {
        observedElements.delete(target);
      },
      disconnect() {
        observedElements.clear();
      },
    };
  } as unknown as typeof ResizeObserver;

const nativeScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
const nativeOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
const nativeClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const nativeRequestAnimationFrame = window.requestAnimationFrame;
const nativeCancelAnimationFrame = window.cancelAnimationFrame;
const nativeGlobalRequestAnimationFrame = globalThis.requestAnimationFrame;
const nativeGlobalCancelAnimationFrame = globalThis.cancelAnimationFrame;
const nativeResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  shouldWrapToggleHarness = false;
  measurementCacheScrollHeightReads = 0;

  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      if (this instanceof HTMLElement) {
        const measurerName = this.getAttribute('data-editor-measurer');
        const measuredText = this.textContent ?? '';
        const hasMeasuredText = measuredText.length > 0;
        const isSingleLineProbe = measuredText === 'M';

        if (measurerName === 'ToggleRecorderHarness') {
          if (!hasMeasuredText || isSingleLineProbe) return 20;
          return shouldWrapToggleHarness ? 40 : 20;
        }

        if (measurerName === 'PasteWrapHarness') {
          if (isSingleLineProbe) return 20;
          return hasMeasuredText ? 40 : 20;
        }

        if (measurerName === 'NearThresholdWrapHarness') {
          if (!hasMeasuredText || isSingleLineProbe) return 20;
          return this.style.width === '319px' ? 29 : 20;
        }

        if (measurerName === 'TrailingSpacesWrapHarness') {
          if (!hasMeasuredText || isSingleLineProbe) return 20;
          return measuredText.endsWith('\u200B') ? 29 : 20;
        }

        if (measurerName === 'PasteNoWrapHarness') {
          if (!hasMeasuredText || isSingleLineProbe) return 20;
          return 20;
        }

        if (measurerName === 'MeasurementCacheHarness') {
          if (!hasMeasuredText || isSingleLineProbe) return 20;
          measurementCacheScrollHeightReads += 1;
          return 40;
        }
      }

      return nativeScrollHeight?.get?.call(this) ?? 0;
    },
  });

  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get() {
      if (this instanceof HTMLElement && this.classList.contains(css.EditorRow)) {
        return 320;
      }
      return nativeOffsetWidth?.get?.call(this) ?? 0;
    },
  });

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      if (this instanceof HTMLElement && this.classList.contains(css.EditorTextareaScroll)) {
        if (this.querySelector('[data-editable-name="NearThresholdWrapHarness"]')) {
          return 319;
        }

        return 320;
      }

      return nativeClientWidth?.get?.call(this) ?? 0;
    },
  });
});

afterEach(() => {
  shouldWrapToggleHarness = false;
  measurementCacheScrollHeightReads = 0;
  window.requestAnimationFrame = nativeRequestAnimationFrame;
  window.cancelAnimationFrame = nativeCancelAnimationFrame;
  globalThis.requestAnimationFrame = nativeGlobalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = nativeGlobalCancelAnimationFrame;
  globalThis.ResizeObserver = nativeResizeObserver;
  if (nativeScrollHeight) {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', nativeScrollHeight);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  }

  if (nativeOffsetWidth) {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', nativeOffsetWidth);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'offsetWidth');
  }

  if (nativeClientWidth) {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', nativeClientWidth);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  }
});

describe('CustomEditor', () => {
  it('moves responsive after content into the multiline footer without keeping the textarea max height', async () => {
    render(<EditorHarness />);
    const editable = document.querySelector('[data-editable-name="EditorHarness"]');
    const scroll = editable?.parentElement as HTMLElement | null;
    const editorRoot = scroll?.parentElement?.parentElement as HTMLElement | null;
    const measurer = document.querySelector('[data-editor-measurer="EditorHarness"]');

    expect(scroll).not.toBeNull();
    expect(editorRoot).not.toBeNull();
    expect(editorRoot?.contains(measurer)).toBe(true);
    expect(measurer?.parentElement).not.toBe(document.body);
    expect(scroll?.style.maxHeight).toBe('50vh');
    expect(screen.getByText('Attach')).toBeVisible();
    expect(screen.getByText('Send')).toBeVisible();
    expect(screen.getByTestId('recorder').parentElement).toHaveClass(css.EditorOptions);

    fireEvent.click(screen.getByRole('button', { name: 'Make multiline' }));

    await waitFor(() => {
      expect(screen.getByTestId('recorder').parentElement).toHaveClass(
        css.EditorResponsiveAfterMultiline
      );
      expect(scroll?.style.maxHeight).toBe('');
    });

    expect(screen.getByText('Attach')).toBeVisible();
    expect(screen.getByText('Send')).toBeVisible();
  });

  it('recomputes multiline layout when inline responsive content makes existing text wrap', async () => {
    render(<ToggleRecorderHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Add text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start recorder' }));

    await waitFor(() => {
      expect(screen.getByTestId('toggle-recorder').parentElement).toHaveClass(
        css.EditorResponsiveAfterMultiline
      );
    });
  });

  it('supports forcing multiline layout so responsive content moves into the footer immediately', () => {
    render(<ForcedFooterHarness />);

    expect(screen.getByTestId('forced-footer-recorder').parentElement).toHaveClass(
      css.EditorResponsiveAfterMultiline
    );
  });

  it('detects pasted text that exceeds the single-line width after the deferred layout measurement', async () => {
    render(<PasteWrapHarness />);
    const editable = document.querySelector('[data-editable-name="PasteWrapHarness"]');
    const scroll = editable?.parentElement as HTMLElement | null;

    expect(scroll).not.toBeNull();
    expect(scroll).not.toHaveClass(css.EditorTextareaScrollMultiline);

    fireEvent.click(screen.getByRole('button', { name: 'Paste wrapped text' }));

    await waitFor(() => {
      expect(scroll).toHaveClass(css.EditorTextareaScrollMultiline);
    });
  });

  it('does not oscillate back to single-line when multiline layout slightly increases the available width', async () => {
    const queuedFrames = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    let resizeObserverCallback: ResizeObserverCallback | undefined;
    const observedElements = new Set<Element>();
    const flushQueuedFrames = () => {
      const pendingFrames = Array.from(queuedFrames.entries());
      queuedFrames.clear();
      pendingFrames.forEach(([, callback]) => {
        callback(performance.now());
      });
    };

    const requestAnimationFrameStub = ((callback: FrameRequestCallback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      queuedFrames.set(frameId, callback);
      return frameId;
    }) as typeof window.requestAnimationFrame;
    const cancelAnimationFrameStub = ((frameId: number) => {
      queuedFrames.delete(frameId);
    }) as typeof window.cancelAnimationFrame;

    window.requestAnimationFrame = requestAnimationFrameStub;
    window.cancelAnimationFrame = cancelAnimationFrameStub;
    globalThis.requestAnimationFrame = requestAnimationFrameStub;
    globalThis.cancelAnimationFrame = cancelAnimationFrameStub;
    globalThis.ResizeObserver = createResizeObserverStub(observedElements, (callback) => {
      resizeObserverCallback = callback;
    });

    render(<NearThresholdWrapHarness />);
    const editable = document.querySelector('[data-editable-name="NearThresholdWrapHarness"]');
    const scroll = editable?.parentElement as HTMLElement | null;

    expect(scroll).not.toBeNull();
    expect(scroll).not.toHaveClass(css.EditorTextareaScrollMultiline);

    fireEvent.click(screen.getByRole('button', { name: 'Paste near-threshold wrap' }));

    await waitFor(() => {
      expect(scroll).toHaveClass(css.EditorTextareaScrollMultiline);
    });
    expect(resizeObserverCallback).toBeDefined();

    act(() => {
      resizeObserverCallback?.(
        Array.from(observedElements).map((target) => ({ target }) as ResizeObserverEntry),
        {} as ResizeObserver
      );
    });

    act(() => {
      flushQueuedFrames();
    });

    expect(scroll).toHaveClass(css.EditorTextareaScrollMultiline);
  });

  it('counts trailing spaces toward the single-line wrap threshold', async () => {
    render(<TrailingSpacesWrapHarness />);
    const editable = document.querySelector('[data-editable-name="TrailingSpacesWrapHarness"]');
    const scroll = editable?.parentElement as HTMLElement | null;

    expect(scroll).not.toBeNull();
    expect(scroll).not.toHaveClass(css.EditorTextareaScrollMultiline);

    fireEvent.click(screen.getByRole('button', { name: 'Paste trailing spaces' }));

    await waitFor(() => {
      expect(scroll).toHaveClass(css.EditorTextareaScrollMultiline);
    });
  });

  it('keeps fitting pasted text in single-line mode without deferring to the next frame', () => {
    const queuedFrames = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;

    const requestAnimationFrameStub = ((callback: FrameRequestCallback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      queuedFrames.set(frameId, callback);
      return frameId;
    }) as typeof window.requestAnimationFrame;
    const cancelAnimationFrameStub = ((frameId: number) => {
      queuedFrames.delete(frameId);
    }) as typeof window.cancelAnimationFrame;
    window.requestAnimationFrame = requestAnimationFrameStub;
    window.cancelAnimationFrame = cancelAnimationFrameStub;
    globalThis.requestAnimationFrame = requestAnimationFrameStub;
    globalThis.cancelAnimationFrame = cancelAnimationFrameStub;

    render(<PasteNoWrapHarness />);
    const editable = document.querySelector('[data-editable-name="PasteNoWrapHarness"]');
    const scroll = editable?.parentElement as HTMLElement | null;

    expect(scroll).not.toBeNull();
    expect(scroll).not.toHaveClass(css.EditorTextareaScrollMultiline);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Paste short text' }));
    });

    expect(queuedFrames.size).toBe(0);
    expect(scroll).not.toHaveClass(css.EditorTextareaScrollMultiline);
  });

  it('reuses the cached measurement when resize observer fires without changing the single-line width', async () => {
    const queuedFrames = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    let resizeObserverCallback: ResizeObserverCallback | undefined;
    const observedElements = new Set<Element>();
    const flushQueuedFrames = () => {
      let safetyCounter = 0;
      while (queuedFrames.size > 0 && safetyCounter < 10) {
        const pendingFrames = Array.from(queuedFrames.entries());
        queuedFrames.clear();
        pendingFrames.forEach(([, callback]) => {
          callback(performance.now());
        });
        safetyCounter += 1;
      }
    };

    const requestAnimationFrameStub = ((callback: FrameRequestCallback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      queuedFrames.set(frameId, callback);
      return frameId;
    }) as typeof window.requestAnimationFrame;
    const cancelAnimationFrameStub = ((frameId: number) => {
      queuedFrames.delete(frameId);
    }) as typeof window.cancelAnimationFrame;

    window.requestAnimationFrame = requestAnimationFrameStub;
    window.cancelAnimationFrame = cancelAnimationFrameStub;
    globalThis.requestAnimationFrame = requestAnimationFrameStub;
    globalThis.cancelAnimationFrame = cancelAnimationFrameStub;
    globalThis.ResizeObserver = createResizeObserverStub(observedElements, (callback) => {
      resizeObserverCallback = callback;
    });

    render(<MeasurementCacheHarness />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Add cached text' }));
    });

    await waitFor(() => {
      expect(measurementCacheScrollHeightReads).toBe(1);
    });
    expect(resizeObserverCallback).toBeDefined();

    act(() => {
      resizeObserverCallback?.(
        Array.from(observedElements).map((target) => ({ target }) as ResizeObserverEntry),
        {} as ResizeObserver
      );
    });

    act(() => {
      flushQueuedFrames();
    });

    expect(measurementCacheScrollHeightReads).toBe(1);
  });
});
