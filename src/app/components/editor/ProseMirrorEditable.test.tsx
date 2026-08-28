import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorDocument } from './model';
import { BlockType } from './types';
import { ProseMirrorEditable, type ProseMirrorEditableHandle } from './ProseMirrorEditable';
import { ProseMirrorEditorController } from './prosemirrorController';

describe('ProseMirrorEditable', () => {
  it('renders and updates the Sable document through its handle', () => {
    const controller = new ProseMirrorEditorController();
    const ref = createRef<ProseMirrorEditableHandle>();
    const { container } = render(<ProseMirrorEditable controller={controller} ref={ref} />);

    act(() => {
      ref.current?.setDocument([
        { type: BlockType.Paragraph, children: [{ text: 'hello from ProseMirror' }] },
      ]);
    });

    expect(container.querySelector('.ProseMirror')).toHaveTextContent('hello from ProseMirror');
    expect(container.firstElementChild).toHaveClass('ProseMirror');
    expect(ref.current?.getDocument()).toEqual([
      { type: BlockType.Paragraph, children: [{ text: 'hello from ProseMirror' }] },
    ]);
  });

  it('emits one document change for a programmatic replacement while mounted', () => {
    const controller = new ProseMirrorEditorController();
    const onDocumentChange = vi.fn<(document: EditorDocument) => void>();
    const ref = createRef<ProseMirrorEditableHandle>();
    render(
      <ProseMirrorEditable controller={controller} onDocumentChange={onDocumentChange} ref={ref} />
    );

    act(() => {
      ref.current?.setDocument([
        { type: BlockType.Paragraph, children: [{ text: 'replacement' }] },
      ]);
    });

    expect(onDocumentChange).toHaveBeenCalledTimes(1);
    expect(onDocumentChange).toHaveBeenLastCalledWith([
      { type: BlockType.Paragraph, children: [{ text: 'replacement' }] },
    ]);
  });

  it('removes browser paragraph margins from the editable document', () => {
    const { container } = render(
      <ProseMirrorEditable controller={new ProseMirrorEditorController()} />
    );

    expect(container.querySelector('.ProseMirror > p')).toHaveStyle({ margin: '0px' });
  });

  it('places editable semantics on the ProseMirror document', () => {
    const { container } = render(
      <ProseMirrorEditable
        controller={new ProseMirrorEditorController()}
        editableName="RoomInput"
        enterKeyHint="send"
      />
    );

    const editable = container.querySelector('.ProseMirror')!;
    expect(editable).toHaveAttribute('role', 'textbox');
    expect(editable).toHaveAttribute('data-editable-name', 'RoomInput');
    expect(editable).toHaveAttribute('enterkeyhint', 'send');
    expect(container.firstElementChild).toBe(editable);
  });

  it('updates editable semantics without rebuilding the document', () => {
    const controller = new ProseMirrorEditorController();
    const ref = createRef<ProseMirrorEditableHandle>();
    const { container, rerender } = render(
      <ProseMirrorEditable controller={controller} placeholder="Send a message" ref={ref} />
    );

    act(() => {
      ref.current?.setDocument([{ type: BlockType.Paragraph, children: [{ text: 'draft' }] }]);
    });
    const paragraph = container.querySelector('.ProseMirror > p');

    rerender(
      <ProseMirrorEditable controller={controller} placeholder="Reply to Alice" ref={ref} />
    );

    expect(container.querySelector('.ProseMirror > p')).toBe(paragraph);
    expect(container.querySelector('.ProseMirror')).toHaveAttribute(
      'data-placeholder',
      'Reply to Alice'
    );
  });
});
