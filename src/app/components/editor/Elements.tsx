import { Text } from 'folds';
import type { RenderElementProps, RenderLeafProps } from 'slate-react';
import { useFocused, useSelected, useSlate } from 'slate-react';
import { useAtomValue } from 'jotai';

import * as css from '$styles/CustomHtml.css';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { mxcUrlToHttp } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { nicknamesAtom } from '$state/nicknames';
import { BlockType } from './types';
import { getBeginCommand } from './utils';
import type { CommandElement, EmoticonElement, LinkElement, MentionElement } from './slate';

// Put this at the start and end of an inline component to work around this Chromium bug:
// https://bugs.chromium.org/p/chromium/issues/detail?id=1249405
function InlineChromiumBugfix() {
  return (
    <span className={css.InlineChromiumBugfix} contentEditable={false}>
      {String.fromCodePoint(160) /* Non-breaking space */}
    </span>
  );
}

function RenderMentionElement({
  attributes,
  element,
  children,
}: { element: MentionElement } & RenderElementProps) {
  const selected = useSelected();
  const focused = useFocused();
  const nicknames = useAtomValue(nicknamesAtom);

  const nickname = nicknames[element.id];
  const displayName = nickname ? `@${nickname}` : element.name;

  return (
    <span
      {...attributes}
      className={css.Mention({
        highlight: element.highlight,
        focus: selected && focused,
      })}
      contentEditable={false}
    >
      {displayName}
      {children}
    </span>
  );
}
function RenderCommandElement({
  attributes,
  element,
  children,
}: { element: CommandElement } & RenderElementProps) {
  const selected = useSelected();
  const focused = useFocused();
  const editor = useSlate();

  return (
    <span
      {...attributes}
      className={css.Command({
        focus: selected && focused,
        active: getBeginCommand(editor) === element.command,
      })}
      contentEditable={false}
    >
      {`/${element.command}`}
      {children}
    </span>
  );
}

function RenderEmoticonElement({
  attributes,
  element,
  children,
}: { element: EmoticonElement } & RenderElementProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const selected = useSelected();
  const focused = useFocused();

  return (
    <span className={css.EmoticonBase} {...attributes}>
      <span
        className={css.Emoticon({
          focus: selected && focused,
        })}
        contentEditable={false}
      >
        {element.key.startsWith('mxc://') ? (
          <img
            className={css.EmoticonImg}
            src={mxcUrlToHttp(mx, element.key, useAuthentication) ?? element.key}
            alt={element.shortcode}
          />
        ) : (
          element.key
        )}
        {children}
      </span>
    </span>
  );
}

function RenderLinkElement({
  attributes,
  element,
  children,
}: { element: LinkElement } & RenderElementProps) {
  return (
    <a href={element.href} {...attributes}>
      <InlineChromiumBugfix />
      {children}
    </a>
  );
}

export function RenderElement({ attributes, element, children }: RenderElementProps) {
  switch (element.type) {
    case BlockType.Paragraph:
      return (
        <Text
          {...attributes}
          className={css.Paragraph}
          style={{ fontSize: '1rem', lineHeight: 'inherit' }}
        >
          {children}
        </Text>
      );
    case BlockType.Mention:
      return (
        <RenderMentionElement attributes={attributes} element={element}>
          {children}
        </RenderMentionElement>
      );
    case BlockType.Emoticon:
      return (
        <RenderEmoticonElement attributes={attributes} element={element}>
          {children}
        </RenderEmoticonElement>
      );
    case BlockType.Link:
      return (
        <RenderLinkElement attributes={attributes} element={element}>
          {children}
        </RenderLinkElement>
      );
    case BlockType.Command:
      return (
        <RenderCommandElement attributes={attributes} element={element}>
          {children}
        </RenderCommandElement>
      );
    default:
      return (
        <Text
          className={css.Paragraph}
          {...attributes}
          style={{ fontSize: '1rem', lineHeight: 'inherit' }}
        >
          {children}
        </Text>
      );
  }
}

export function RenderLeaf({ attributes, children }: RenderLeafProps) {
  return <span {...attributes}>{children}</span>;
}
