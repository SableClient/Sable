import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import type { Decoration, NodeView, NodeViewConstructor } from 'prosemirror-view';
import { Decoration as NodeDecoration, DecorationSet } from 'prosemirror-view';
import * as css from '$styles/CustomHtml.css';
import { BlockType } from './types';
import type { MentionToken } from './model';
import { formatMentionElementDisplayName } from './utils';

/**
 * App data the atom node views render from. Plain functions, so the views stay
 * out of React and nothing inside the editable re-renders during composition.
 */
export type EditorRenderContext = {
  emoticonSrc: (key: string) => string | undefined;
  mentionDisplayName: (token: MentionToken) => string;
};

export const defaultEditorRenderContext: EditorRenderContext = {
  emoticonSrc: () => undefined,
  mentionDisplayName: (token) => formatMentionElementDisplayName(token),
};

const mentionTokenOf = (node: ProseMirrorNode): MentionToken => ({
  type: BlockType.Mention,
  id: node.attrs.id as string,
  eventId: (node.attrs.eventId as string | null) ?? undefined,
  viaServers: (node.attrs.viaServers as string[] | null) ?? undefined,
  highlight: Boolean(node.attrs.highlight),
  name: node.attrs.name as string,
  children: [{ text: '' }],
});

abstract class AtomNodeView implements NodeView {
  dom: HTMLElement;

  protected selected = false;

  constructor() {
    this.dom = document.createElement('span');
    // Otherwise the caret enters the pill and an IME can anchor inside it.
    this.dom.setAttribute('contenteditable', 'false');
  }

  selectNode(): void {
    this.selected = true;
    this.render();
  }

  deselectNode(): void {
    this.selected = false;
    this.render();
  }

  stopEvent(): boolean {
    return false;
  }

  protected abstract render(): void;
}

class MentionNodeView extends AtomNodeView {
  constructor(
    private node: ProseMirrorNode,
    private context: () => EditorRenderContext
  ) {
    super();
    this.render();
  }

  protected render(): void {
    const token = mentionTokenOf(this.node);
    this.dom.className = css.Mention({ highlight: token.highlight, focus: this.selected });
    this.dom.textContent = this.context().mentionDisplayName(token);
  }
}

class CommandNodeView extends AtomNodeView {
  private active: boolean;

  constructor(
    private node: ProseMirrorNode,
    decorations: readonly Decoration[]
  ) {
    super();
    this.active = hasBeginCommandDecoration(decorations);
    this.render();
  }

  // Active depends on surrounding text, not the node, so it arrives as a
  // decoration — which is what makes this run on edits elsewhere.
  update(node: ProseMirrorNode, decorations: readonly Decoration[]): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.active = hasBeginCommandDecoration(decorations);
    this.render();
    return true;
  }

  protected render(): void {
    this.dom.className = css.Command({ focus: this.selected, active: this.active });
    this.dom.textContent = `/${this.node.attrs.command as string}`;
  }
}

const BEGIN_COMMAND_DECORATION = 'sableBeginCommand';

const hasBeginCommandDecoration = (decorations: readonly Decoration[]): boolean =>
  decorations.some((decoration) => decoration.spec[BEGIN_COMMAND_DECORATION] === true);

/** Mirrors getDocumentBeginCommand: first paragraph, only whitespace before. */
export const beginCommandPlugin = new Plugin({
  props: {
    decorations: (state) => {
      const firstParagraph = state.doc.firstChild;
      if (!firstParagraph) return null;
      let offset = 1;
      let prefix = '';
      for (let index = 0; index < firstParagraph.childCount; index += 1) {
        const child = firstParagraph.child(index);
        if (child.type.name === 'command') {
          return prefix.trim() === ''
            ? DecorationSet.create(state.doc, [
                NodeDecoration.node(
                  offset,
                  offset + child.nodeSize,
                  {},
                  { [BEGIN_COMMAND_DECORATION]: true }
                ),
              ])
            : null;
        }
        if (!child.isText) return null;
        prefix += child.text ?? '';
        offset += child.nodeSize;
      }
      return null;
    },
  },
});

class EmoticonNodeView extends AtomNodeView {
  constructor(
    private node: ProseMirrorNode,
    private context: () => EditorRenderContext
  ) {
    super();
    this.dom.className = css.EmoticonBase;
    this.render();
  }

  protected render(): void {
    const key = this.node.attrs.key as string;
    const shortcode = this.node.attrs.shortcode as string;
    const inner = document.createElement('span');
    inner.className = css.Emoticon({ focus: this.selected });
    inner.setAttribute('contenteditable', 'false');

    const src = key.startsWith('mxc://') ? this.context().emoticonSrc(key) : undefined;
    if (src) {
      const img = document.createElement('img');
      img.className = css.EmoticonImg;
      img.style.width = 'auto';
      img.style.height = '1em';
      img.src = src;
      img.alt = shortcode;
      inner.append(img);
    } else {
      inner.textContent = key.startsWith('mxc://') ? `:${shortcode}:` : key;
    }

    this.dom.replaceChildren(inner);
  }
}

export const buildEditorNodeViews = (
  context: () => EditorRenderContext
): Record<string, NodeViewConstructor> => ({
  mention: (node) => new MentionNodeView(node, context),
  emoticon: (node) => new EmoticonNodeView(node, context),
  command: (node, _view, _getPos, decorations) => new CommandNodeView(node, decorations),
});
