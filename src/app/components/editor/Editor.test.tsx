import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { Transforms } from 'slate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useEditor, CustomEditor } from './Editor';
import { BlockType } from './types';
import * as css from './Editor.css';

let shouldWrapToggleHarness = false;

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

const nativeScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');

beforeEach(() => {
  shouldWrapToggleHarness = false;
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      if (
        this instanceof HTMLElement &&
        this.getAttribute('data-editable-name') === 'ToggleRecorderHarness'
      ) {
        return shouldWrapToggleHarness ? 40 : 20;
      }
      return nativeScrollHeight?.get?.call(this) ?? 0;
    },
  });
});

afterEach(() => {
  shouldWrapToggleHarness = false;
  if (nativeScrollHeight) {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', nativeScrollHeight);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  }
});

describe('CustomEditor', () => {
  it('moves responsive after content into the multiline footer without keeping the textarea max height', async () => {
    render(<EditorHarness />);
    const editable = document.querySelector('[data-editable-name="EditorHarness"]');
    const scroll = editable?.parentElement as HTMLElement | null;

    expect(scroll).not.toBeNull();
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
});
