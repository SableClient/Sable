/* oxlint-disable jsx-a11y/alt-text */
import type { CSSProperties, ComponentPropsWithoutRef, ReactEventHandler, ReactNode } from 'react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { HTMLReactParserOptions } from 'html-react-parser';
import { attributesToProps, domToReact, Element, Text as DOMText } from 'html-react-parser';
import type { MatrixClient } from '$types/matrix-sdk';
import classNames from 'classnames';
import { Box, Chip, config, Header, Icon, IconButton, Icons, Scroll, Text, toRem } from 'folds';
import type { IntermediateRepresentation, OptFn, Opts as LinkifyOpts } from 'linkifyjs';
import Linkify from 'linkify-react';
import type { ChildNode } from 'domhandler';

import * as css from '$styles/CustomHtml.css';
import {
  getCanonicalAliasRoomId,
  getMxIdLocalPart,
  isRoomAlias,
  mxcUrlToHttp,
} from '$utils/matrix';
import { getMemberDisplayName } from '$utils/room';
import type { Nicknames } from '$state/nicknames';
import { EMOJI_PATTERN, sanitizeForRegex, URL_NEG_LB } from '$utils/regex';
import { findAndReplace } from '$utils/findAndReplace';
import { onEnterOrSpace } from '$utils/keyboard';
import { copyToClipboard } from '$utils/dom';
import { isMatrixHexColor } from '$utils/matrixHtml';
import { useTimeoutToggle } from '$hooks/useTimeoutToggle';
import { getSettingsLinkChipLabel, parseSettingsLink } from '$features/settings/settingsLink';
import { ClientSideHoverFreeze } from '$components/ClientSideHoverFreeze';
import { CodeHighlightRenderer } from '$components/code-highlight';
import {
  isRedundantMatrixToAnchorText,
  parseMatrixToRoom,
  parseMatrixToRoomEvent,
  parseMatrixToUser,
  testMatrixTo,
} from './matrix-to';
import { getHexcodeForEmoji, getShortcodeFor } from './emoji';

const EMOJI_REG_G = new RegExp(`${URL_NEG_LB}(${EMOJI_PATTERN})`, 'g');

const shouldLinkifyDomText = (domNode: DOMText): boolean =>
  !(domNode.parent && 'name' in domNode.parent && domNode.parent.name === 'code') &&
  !(domNode.parent && 'name' in domNode.parent && domNode.parent.name === 'a');

export const LINKIFY_OPTS: LinkifyOpts = {
  attributes: {
    target: '_blank',
    rel: 'noreferrer noopener',
  },
  validate: {
    url: (value) => /^(https|http|ftp|mailto|magnet)?:/.test(value),
  },
  ignoreTags: ['span'],
};

export const safeDecodeUrl = (url: string) => {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
};

const getMatrixColorStyle = (attribs: Record<string, string>): CSSProperties | undefined => {
  const color = attribs['data-mx-color'];
  const backgroundColor = attribs['data-mx-bg-color'];

  const style: CSSProperties = {};

  if (typeof color === 'string' && isMatrixHexColor(color)) {
    style.color = color;
  }

  if (typeof backgroundColor === 'string' && isMatrixHexColor(backgroundColor)) {
    style.backgroundColor = backgroundColor;
  }

  return Object.keys(style).length > 0 ? style : undefined;
};

const stripIncomingStyle = (
  attribs: Record<string, string>
): Omit<ReturnType<typeof attributesToProps>, 'style'> => {
  const { style, ...props } = attributesToProps(attribs);

  return props;
};

const ensureNoopenerRel = (rel: unknown): string => {
  if (typeof rel !== 'string') return 'noopener';

  const parts = rel.split(/\s+/).filter(Boolean);
  if (!parts.includes('noopener')) {
    parts.push('noopener');
  }

  return parts.join(' ');
};

function KatexRenderer({
  math,
  displayMode,
  style,
}: {
  math: string;
  displayMode: boolean;
  style?: CSSProperties;
}) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([katex]) => {
      if (mounted) {
        setHtml(katex.default.renderToString(math, { throwOnError: false, displayMode }));
      }
    });
    return () => {
      mounted = false;
    };
  }, [math, displayMode]);

  if (html === null) {
    return (
      <code style={style}>
        {displayMode ? '$$\n' : '$'}
        {math}
        {displayMode ? '\n$$' : '$'}
      </code>
    );
  }

  const Tag = displayMode ? 'div' : 'span';
  return <Tag style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}

export const makeMentionCustomProps = (
  handleMentionClick?: ReactEventHandler<HTMLElement>,
  content?: string
): ComponentPropsWithoutRef<'a'> => ({
  style: { cursor: 'pointer' },
  target: '_blank',
  rel: 'noreferrer noopener',
  role: 'link',
  tabIndex: handleMentionClick ? 0 : -1,
  onKeyDown: handleMentionClick ? onEnterOrSpace(handleMentionClick) : undefined,
  onClick: handleMentionClick,
  children: content,
});

const matrixPermalinkDisplayLabel = (
  href: string,
  customChildren: ReactNode | undefined,
  fallback: ReactNode
): ReactNode => {
  if (customChildren === undefined || customChildren === null) return fallback;
  if (typeof customChildren === 'string') {
    return isRedundantMatrixToAnchorText(href, customChildren) ? fallback : customChildren;
  }
  return customChildren;
};

export const renderMatrixMention = (
  mx: MatrixClient,
  currentRoomId: string | undefined,
  href: string,
  customProps: ComponentPropsWithoutRef<'a'>,
  nicknames?: Nicknames
) => {
  const userId = parseMatrixToUser(href);
  if (userId) {
    const currentRoom = mx.getRoom(currentRoomId);

    return (
      <a
        href={href}
        {...customProps}
        className={css.Mention({ highlight: mx.getUserId() === userId })}
        data-mention-id={userId}
      >
        {`@${
          (currentRoom && getMemberDisplayName(currentRoom, userId, nicknames)) ??
          getMxIdLocalPart(userId)
        }`}
      </a>
    );
  }

  const matrixToRoom = parseMatrixToRoom(href);
  if (matrixToRoom) {
    const { roomIdOrAlias, viaServers } = matrixToRoom;
    const mentionRoom = mx.getRoom(
      isRoomAlias(roomIdOrAlias) ? getCanonicalAliasRoomId(mx, roomIdOrAlias) : roomIdOrAlias
    );

    const fallbackContent = mentionRoom ? `#${mentionRoom.name}` : roomIdOrAlias;
    const label = matrixPermalinkDisplayLabel(href, customProps.children, fallbackContent);

    return (
      <a
        href={href}
        {...customProps}
        className={css.Mention({
          highlight: currentRoomId === (mentionRoom?.roomId ?? roomIdOrAlias),
        })}
        data-mention-id={mentionRoom?.roomId ?? roomIdOrAlias}
        data-mention-via={viaServers?.join(',')}
      >
        {label}
      </a>
    );
  }

  const matrixToRoomEvent = parseMatrixToRoomEvent(href);
  if (matrixToRoomEvent) {
    const { roomIdOrAlias, eventId, viaServers } = matrixToRoomEvent;
    const mentionRoom = mx.getRoom(
      isRoomAlias(roomIdOrAlias) ? getCanonicalAliasRoomId(mx, roomIdOrAlias) : roomIdOrAlias
    );
    let fallbackContent = mentionRoom ? `#${mentionRoom.name}` : roomIdOrAlias;
    if (mentionRoom) {
      const linkedEvent = mentionRoom.findEventById?.(eventId);
      if (linkedEvent) {
        const raw = linkedEvent.getContent() as { body?: unknown };
        const body = typeof raw.body === 'string' ? raw.body.trim() : '';
        if (body) {
          const singleLine = body.replace(/\s+/g, ' ');
          const short = singleLine.length > 72 ? `${singleLine.slice(0, 69)}…` : singleLine;
          fallbackContent = `#${mentionRoom.name}: ${short}`;
        }
      }
    }
    const label = matrixPermalinkDisplayLabel(href, customProps.children, fallbackContent);

    return (
      <a
        href={href}
        {...customProps}
        className={classNames(
          css.Mention({
            highlight: currentRoomId === (mentionRoom?.roomId ?? roomIdOrAlias),
          }),
          css.MentionWithIcon
        )}
        data-mention-id={mentionRoom?.roomId ?? roomIdOrAlias}
        data-mention-event-id={eventId}
        data-mention-via={viaServers?.join(',')}
      >
        <span aria-hidden="true" className={css.MentionIcon}>
          <Icon size="50" src={Icons.Message} />
        </span>
        {label}
      </a>
    );
  }

  return undefined;
};

const renderSettingsLink = ({
  href,
  section,
  focus,
  handleMentionClick,
}: {
  href: string;
  section: Parameters<typeof getSettingsLinkChipLabel>[0];
  focus?: string;
  handleMentionClick?: ReactEventHandler<HTMLElement>;
}) => (
  <a
    href={href}
    {...makeMentionCustomProps(handleMentionClick)}
    className={classNames(css.Mention({}), css.MentionWithIcon)}
    data-settings-link-section={section}
    data-settings-link-focus={focus}
  >
    <span aria-hidden="true" className={css.MentionIcon}>
      <Icon size="50" src={Icons.Setting} />
    </span>
    {getSettingsLinkChipLabel(section, focus)}
  </a>
);

export const factoryRenderLinkifyWithMention = (
  settingsLinkBaseUrl: string,
  mentionRender: (href: string) => JSX.Element | undefined,
  handleMentionClick?: ReactEventHandler<HTMLElement>
): OptFn<(ir: IntermediateRepresentation) => unknown> => {
  const renderLink: OptFn<(ir: IntermediateRepresentation) => unknown> = ({
    tagName,
    attributes,
    content,
  }) => {
    const encodedHref = attributes.href;
    const decodedHref = encodedHref && safeDecodeUrl(encodedHref);

    if (tagName === 'a' && decodedHref && testMatrixTo(decodedHref)) {
      const mention = mentionRender(decodedHref);
      if (mention) return mention;
    }

    if (tagName === 'a' && decodedHref) {
      const settingsLink = parseSettingsLink(settingsLinkBaseUrl, decodedHref);
      if (settingsLink) {
        const { section, focus } = settingsLink;
        return renderSettingsLink({
          href: decodedHref,
          section,
          focus,
          handleMentionClick,
        });
      }
    }

    return (
      <a {...attributes} target="_blank" rel="noreferrer noopener">
        {content}
      </a>
    );
  };

  return renderLink;
};

export const scaleSystemEmoji = (text: string): (string | JSX.Element)[] =>
  findAndReplace(
    text,
    EMOJI_REG_G,
    (match, pushIndex) => (
      <span key={`scaleSystemEmoji-${pushIndex}`} className={css.EmoticonBase}>
        <span className={css.Emoticon()} title={getShortcodeFor(getHexcodeForEmoji(match[0]))}>
          {match[0]}
        </span>
      </span>
    ),
    (txt) => txt
  );

export const makeHighlightRegex = (highlights: string[]): RegExp | undefined => {
  const pattern = highlights.map(sanitizeForRegex).join('|');
  if (!pattern) return undefined;
  return new RegExp(pattern, 'gi');
};

export const highlightText = (
  regex: RegExp,
  data: (string | JSX.Element)[]
): (string | JSX.Element)[] =>
  data.flatMap((text) => {
    if (typeof text !== 'string') return text;

    return findAndReplace(
      text,
      regex,
      (match, pushIndex) => (
        <span key={`highlight-${pushIndex}`} className={css.highlightText}>
          {match[0]}
        </span>
      ),
      (txt) => txt
    );
  });

/**
 * Recursively extracts and concatenates all text content from an array of ChildNode objects.
 *
 * @param {ChildNode[]} nodes - An array of ChildNode objects to extract text from.
 * @returns {string} The concatenated plain text content of all descendant text nodes.
 */
const extractTextFromChildren = (nodes: ChildNode[]): string => {
  const worker = (n: ChildNode[]): string => {
    let text = '';
    n.forEach((node) => {
      if ((node.type as unknown as string) === 'text') {
        text += (node as unknown as Text).data;
      } else if (node instanceof Element && node.children) {
        text += worker(node.children);
      }
    });
    return text;
  };

  return worker(nodes).replace(/\n$/, '');
};

const getLanguageFromClassName = (className?: string): string | undefined => {
  if (!className) return undefined;

  return className
    .split(/\s+/)
    .find((token) => token.startsWith('language-'))
    ?.replace('language-', '');
};

const getCodeBlockLanguage = (
  children: ChildNode[],
  attribs?: Record<string, string | undefined>
): string | undefined => {
  const code = children.find((child) => child instanceof Element && child.name === 'code');
  const codeAttribs = code instanceof Element ? code.attribs : undefined;

  return (
    codeAttribs?.['data-lang'] ??
    attribs?.['data-lang'] ??
    getLanguageFromClassName(codeAttribs?.class) ??
    getLanguageFromClassName(attribs?.class)
  );
};

export function CodeBlock({
  children,
  attribs,
  opts,
}: {
  children: ChildNode[];
  attribs?: Record<string, string | undefined>;
  opts: HTMLReactParserOptions;
}) {
  const language = getCodeBlockLanguage(children, attribs);

  const LINE_LIMIT = 14;
  const largeCodeBlock = useMemo(
    () => extractTextFromChildren(children).split('\n').length > LINE_LIMIT,
    [children]
  );

  const [expanded, setExpand] = useState(false);
  const [copied, setCopied] = useTimeoutToggle();

  const handleCopy = () => {
    copyToClipboard(extractTextFromChildren(children));
    setCopied();
  };

  const toggleExpand = () => {
    setExpand(!expanded);
  };

  return (
    <Text size="T300" as="pre" className={css.CodeBlock}>
      <Header variant="Surface" size="400" className={css.CodeBlockHeader}>
        <Box grow="Yes">
          <Text size="L400" truncate>
            {language ?? 'Code'}
          </Text>
        </Box>
        <Box shrink="No" gap="200">
          <Chip
            variant={copied ? 'Success' : 'Surface'}
            fill="None"
            radii="Pill"
            onClick={handleCopy}
            before={copied && <Icon size="50" src={Icons.Check} />}
          >
            <Text size="B300">{copied ? 'Copied' : 'Copy'}</Text>
          </Chip>
          {largeCodeBlock && (
            <IconButton
              size="300"
              variant="SurfaceVariant"
              outlined
              radii="300"
              onClick={toggleExpand}
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              <Icon size="50" src={expanded ? Icons.ChevronTop : Icons.ChevronBottom} />
            </IconButton>
          )}
        </Box>
      </Header>
      <Scroll
        style={{
          maxHeight: largeCodeBlock && !expanded ? toRem(300) : undefined,
          paddingBottom: largeCodeBlock ? config.space.S400 : undefined,
        }}
        direction="Both"
        variant="SurfaceVariant"
        size="300"
        visibility="Hover"
        hideTrack
      >
        <div id="code-block-content" className={css.CodeBlockInternal}>
          {domToReact(children as unknown as Parameters<typeof domToReact>[0], opts)}
        </div>
      </Scroll>
      {largeCodeBlock && !expanded && <Box className={css.CodeBlockBottomShadow} />}
    </Text>
  );
}

/**
 * Thin wrapper around <img> that gracefully swaps in a fallback node when the
 * image fails to load (e.g. federation down, mxc URL unavailable).  Avoids the
 * silent browser broken-image icon showing up in message bodies.
 */
function FallbackImg({
  fallback,
  ...props
}: ComponentPropsWithoutRef<'img'> & { fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return <img {...props} onError={() => setFailed(true)} />;
}

export const getReactCustomHtmlParser = (
  mx: MatrixClient,
  roomId: string | undefined,
  params: {
    settingsLinkBaseUrl: string;
    linkifyOpts: LinkifyOpts;
    highlightRegex?: RegExp;
    handleSpoilerClick?: ReactEventHandler<HTMLElement>;
    handleMentionClick?: ReactEventHandler<HTMLElement>;
    useAuthentication?: boolean;
    nicknames?: Nicknames;
    autoplayEmojis?: boolean;
    incomingInlineImagesDefaultHeight?: number;
    incomingInlineImagesMaxHeight?: number;
    replaceTextNode?: (
      text: string,
      renderText: (text: string, key?: string) => JSX.Element
    ) => JSX.Element | undefined;
  }
): HTMLReactParserOptions => {
  const { replaceTextNode } = params;

  const defaultIncomingImgHeight = params.incomingInlineImagesDefaultHeight ?? 32;
  const maxIncomingImgHeight = params.incomingInlineImagesMaxHeight ?? 64;

  const normalizeIncomingImgHeight = (raw: unknown): number => {
    const parsed =
      typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
    const fallback = defaultIncomingImgHeight;
    const safe = Number.isFinite(parsed) ? parsed : fallback;
    // Clamp to sane bounds first, then apply the user max.
    const bounded = Math.max(1, Math.min(4096, Math.round(safe)));
    const max = Math.max(1, Math.min(4096, Math.round(maxIncomingImgHeight)));
    return Math.min(bounded, max);
  };

  const decorateText = (text: string) => {
    let jsx = scaleSystemEmoji(text);

    if (params.highlightRegex) {
      jsx = highlightText(params.highlightRegex, jsx);
    }

    return jsx;
  };

  const renderReplacementText = (text: string, linkify: boolean, key?: string): JSX.Element => {
    const decoratedText = decorateText(text);

    if (linkify) {
      return (
        <Linkify key={key} options={params.linkifyOpts}>
          {decoratedText}
        </Linkify>
      );
    }

    return <Fragment key={key}>{decoratedText}</Fragment>;
  };

  const opts: HTMLReactParserOptions = {
    replace: (domNode) => {
      if (replaceTextNode && domNode instanceof DOMText) {
        const replacement = replaceTextNode(domNode.data, (text, key) =>
          renderReplacementText(text, shouldLinkifyDomText(domNode), key)
        );

        if (replacement !== undefined) {
          return replacement;
        }
      }
      if (domNode instanceof Element && 'name' in domNode) {
        const { name, attribs, children, parent } = domNode;
        const renderChildren = () =>
          domToReact(children as unknown as Parameters<typeof domToReact>[0], opts);
        const props = stripIncomingStyle(attribs);
        const matrixColorStyle = getMatrixColorStyle(attribs);

        if (name === 'h1') {
          return (
            <Text {...props} className={css.Heading} size="H2">
              {renderChildren()}
            </Text>
          );
        }

        if (name === 'h2') {
          return (
            <Text {...props} className={css.Heading} size="H3">
              {renderChildren()}
            </Text>
          );
        }

        if (name === 'h3') {
          return (
            <Text {...props} className={css.Heading} size="H4">
              {renderChildren()}
            </Text>
          );
        }

        if (name === 'h4') {
          return (
            <Text {...props} className={css.Heading} size="H4">
              {renderChildren()}
            </Text>
          );
        }

        if (name === 'h5') {
          return (
            <Text {...props} className={css.Heading} size="H5">
              {renderChildren()}
            </Text>
          );
        }

        if (name === 'h6') {
          return (
            <Text {...props} className={css.Heading} size="H6">
              {renderChildren()}
            </Text>
          );
        }

        if (name === 'p') {
          return (
            <Text {...props} className={classNames(css.Paragraph, css.MarginSpaced)} size="Inherit">
              {renderChildren()}
            </Text>
          );
        }

        if (name === 'sub') {
          return (
            <Text {...props} className={css.Small} size="Inherit">
              {renderChildren()}
            </Text>
          );
        }

        if (name === 'hr') {
          return <hr {...props} className={css.HorizontalRule} />;
        }

        if (name === 'pre') {
          return (
            <CodeBlock attribs={attribs} opts={opts}>
              {children}
            </CodeBlock>
          );
        }

        if (name === 'blockquote') {
          return (
            <Text {...props} size="Inherit" as="blockquote" className={css.BlockQuote}>
              {renderChildren()}
            </Text>
          );
        }

        if (name === 'ul') {
          return (
            <ul {...props} className={css.List}>
              {renderChildren()}
            </ul>
          );
        }
        if (name === 'ol') {
          return (
            <ol {...props} className={css.List}>
              {renderChildren()}
            </ol>
          );
        }

        if (name === 'code') {
          if (parent && 'name' in parent && parent.name === 'pre') {
            const codeContent = renderChildren();
            if (typeof codeContent !== 'string') {
              return undefined;
            }

            const language = getCodeBlockLanguage(
              parent instanceof Element ? parent.children : [],
              parent instanceof Element ? parent.attribs : undefined
            );
            const trimmedCode = codeContent.replace(/\n$/, '');
            return (
              <CodeHighlightRenderer
                code={trimmedCode}
                language={language}
                allowDetect={false}
                className={typeof props.className === 'string' ? props.className : undefined}
              />
            );
          }

          return (
            <Text as="code" size="T300" className={css.Code} {...props}>
              {renderChildren()}
            </Text>
          );
        }

        if (name === 'a' && typeof props.href === 'string') {
          const encodedHref = props.href;
          const decodedHref = encodedHref && safeDecodeUrl(encodedHref);
          const renderedChildren = renderChildren();
          const anchorProps = {
            ...props,
            target: '_blank',
            rel: ensureNoopenerRel(props.rel),
          };

          const content = children.find((child) => !(child instanceof DOMText))
            ? undefined
            : children.map((c) => (c instanceof DOMText ? c.data : '')).join();

          if (decodedHref && testMatrixTo(decodedHref)) {
            const mention = renderMatrixMention(
              mx,
              roomId,
              decodedHref,
              makeMentionCustomProps(params.handleMentionClick, content),
              params.nicknames
            );

            if (mention) return mention;
          }

          if (decodedHref) {
            const settingsLink = parseSettingsLink(params.settingsLinkBaseUrl, decodedHref);
            if (settingsLink) {
              const { section, focus } = settingsLink;
              return renderSettingsLink({
                href: decodedHref,
                section,
                focus,
                handleMentionClick: params.handleMentionClick,
              });
            }
          }

          return <a {...anchorProps}>{renderedChildren}</a>;
        }

        if (name === 'span' && 'data-mx-spoiler' in props) {
          return (
            <span
              {...props}
              role="button"
              tabIndex={params.handleSpoilerClick ? 0 : -1}
              onKeyDown={params.handleSpoilerClick}
              onClick={params.handleSpoilerClick}
              className={css.Spoiler()}
              aria-pressed
              style={{ ...matrixColorStyle, cursor: 'pointer' }}
            >
              {renderChildren()}
            </span>
          );
        }

        if (name === 'span' && 'data-mx-maths' in props) {
          const math = props['data-mx-maths'];
          if (typeof math === 'string') {
            return <KatexRenderer math={math} displayMode={false} style={matrixColorStyle} />;
          }
        }

        if (name === 'div' && 'data-mx-maths' in props) {
          const math = props['data-mx-maths'];
          if (typeof math === 'string') {
            return <KatexRenderer math={math} displayMode={true} style={matrixColorStyle} />;
          }
        }

        if (name === 'span' && matrixColorStyle) {
          return (
            <span {...props} style={matrixColorStyle}>
              {renderChildren()}
            </span>
          );
        }

        if (name === 'img') {
          // Guard: img without a src survives sanitisation (fix for crash #1731)
          // but we can't convert it — skip rendering rather than passing
          // undefined into mxcUrlToHttp where it would throw.
          if (!props.src) return null;

          const htmlSrc = mxcUrlToHttp(mx, props.src, params.useAuthentication) ?? undefined;
          const fallbackLabel = props.alt || props.title || '[media]';
          const failedToResolveMxc = props.src.startsWith('mxc://') && !htmlSrc;

          // Non-mxc images were already converted to <a> links by the sanitiser,
          // but handle the edge case defensively here too.
          if (htmlSrc && !props.src.startsWith('mxc://')) {
            return (
              <a href={htmlSrc} target="_blank" rel="noreferrer noopener">
                {props.alt || props.title || htmlSrc}
              </a>
            );
          }

          if ('data-mx-emoticon' in props) {
            // When the mxc URL can't be resolved (e.g. federation unavailable),
            // fall back to rendering the shortcode text so the message stays readable.
            if (!htmlSrc) {
              const label = props.alt || props.title || '';
              return (
                <span title={label} className={css.EmoticonBase}>
                  {label ? `:${label}:` : ''}
                </span>
              );
            }

            const height = normalizeIncomingImgHeight(props.height);

            const siblingCount = domNode.parent?.children.length ?? 0;

            // seperate style for bundled emojis
            // seperate style for bundled emojis
            if (siblingCount > 5) {
              return (
                <span className={css.EmoticonBase}>
                  <span className={css.Emoticon()}>
                    {!params.autoplayEmojis ? (
                      <ClientSideHoverFreeze src={htmlSrc}>
                        <FallbackImg
                          {...props}
                          src={htmlSrc}
                          className={css.EmoticonImg}
                          height={height}
                          style={{ verticalAlign: 'middle' }}
                          fallback={
                            <span className={css.EmoticonBase}>
                              {props.alt || props.title || '?'}
                            </span>
                          }
                        />
                      </ClientSideHoverFreeze>
                    ) : (
                      <FallbackImg
                        {...props}
                        src={htmlSrc}
                        className={css.EmoticonImg}
                        height={height}
                        style={{ verticalAlign: 'middle' }}
                        fallback={
                          <span className={css.EmoticonBase}>
                            {props.alt || props.title || '?'}
                          </span>
                        }
                      />
                    )}
                  </span>
                </span>
              );
            }

            // old style for just a few... what is this even for? React components or something?
            return (
              <span className={css.EmoticonBase}>
                <span className={css.Emoticon()}>
                  {!params.autoplayEmojis ? (
                    <ClientSideHoverFreeze src={htmlSrc}>
                      <FallbackImg
                        {...props}
                        src={htmlSrc}
                        className={css.EmoticonImg}
                        height={height}
                        fallback={
                          <span className={css.EmoticonBase}>
                            {props.alt || props.title || '?'}
                          </span>
                        }
                      />
                    </ClientSideHoverFreeze>
                  ) : (
                    <FallbackImg
                      {...props}
                      src={htmlSrc}
                      className={css.EmoticonImg}
                      height={height}
                      fallback={
                        <span className={css.EmoticonBase}>{props.alt || props.title || '?'}</span>
                      }
                    />
                  )}
                </span>
              </span>
            );
          }

          if (failedToResolveMxc) {
            return (
              <span title={`Failed to load media${props.alt ? `: ${props.alt}` : ''}`}>
                {fallbackLabel}
              </span>
            );
          }

          if (htmlSrc)
            return (
              <FallbackImg
                {...props}
                className={css.Img}
                src={htmlSrc}
                height={normalizeIncomingImgHeight(props.height)}
                fallback={
                  <span title={`Failed to load media${props.alt ? `: ${props.alt}` : ''}`}>
                    {props.alt || '[media]'}
                  </span>
                }
              />
            );
        }
      }

      if (domNode instanceof DOMText) {
        const linkify = shouldLinkifyDomText(domNode);
        const decoratedText = decorateText(domNode.data);

        if (linkify) {
          return <Linkify options={params.linkifyOpts}>{decoratedText}</Linkify>;
        }

        return decoratedText;
      }
      return undefined;
    },
  };
  return opts;
};
