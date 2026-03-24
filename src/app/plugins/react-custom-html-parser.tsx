/* eslint-disable jsx-a11y/alt-text */
import {
  ComponentPropsWithoutRef,
  lazy,
  ReactEventHandler,
  ReactNode,
  Suspense,
  useMemo,
  useState,
} from 'react';
import {
  attributesToProps,
  domToReact,
  Element,
  HTMLReactParserOptions,
  Text as DOMText,
} from 'html-react-parser';
import { MatrixClient } from '$types/matrix-sdk';
import classNames from 'classnames';
import { Box, Chip, config, Header, IconButton, Scroll, Text, toRem } from 'folds';
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
import { CaretUpIcon } from '@phosphor-icons/react/dist/csr/CaretUp';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { IntermediateRepresentation, OptFn, Opts as LinkifyOpts } from 'linkifyjs';
import Linkify from 'linkify-react';
import { ErrorBoundary } from 'react-error-boundary';
import { ChildNode } from 'domhandler';
import * as css from '$styles/CustomHtml.css';
import {
  getCanonicalAliasRoomId,
  getMxIdLocalPart,
  isRoomAlias,
  mxcUrlToHttp,
} from '$utils/matrix';
import { getMemberDisplayName } from '$utils/room';
import { Nicknames } from '$state/nicknames';
import { EMOJI_PATTERN, sanitizeForRegex, URL_NEG_LB } from '$utils/regex';
import { findAndReplace } from '$utils/findAndReplace';
import { onEnterOrSpace } from '$utils/keyboard';
import { copyToClipboard } from '$utils/dom';
import { useTimeoutToggle } from '$hooks/useTimeoutToggle';
import { ClientSideHoverFreeze } from '$components/ClientSideHoverFreeze';
import { PhosphorIcon } from '$components/PhosphorIcon';
import {
  parseMatrixToRoom,
  parseMatrixToRoomEvent,
  parseMatrixToUser,
  testMatrixTo,
} from './matrix-to';
import { getHexcodeForEmoji, getShortcodeFor } from './emoji';

const ReactPrism = lazy(() => import('./react-prism/ReactPrism'));

const EMOJI_REG_G = new RegExp(`${URL_NEG_LB}(${EMOJI_PATTERN})`, 'g');

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
        {customProps.children ? customProps.children : fallbackContent}
      </a>
    );
  }

  const matrixToRoomEvent = parseMatrixToRoomEvent(href);
  if (matrixToRoomEvent) {
    const { roomIdOrAlias, eventId, viaServers } = matrixToRoomEvent;
    const mentionRoom = mx.getRoom(
      isRoomAlias(roomIdOrAlias) ? getCanonicalAliasRoomId(mx, roomIdOrAlias) : roomIdOrAlias
    );

    return (
      <a
        href={href}
        {...customProps}
        className={css.Mention({
          highlight: currentRoomId === (mentionRoom?.roomId ?? roomIdOrAlias),
        })}
        data-mention-id={mentionRoom?.roomId ?? roomIdOrAlias}
        data-mention-event-id={eventId}
        data-mention-via={viaServers?.join(',')}
      >
        {customProps.children
          ? customProps.children
          : `Message: ${mentionRoom ? `#${mentionRoom.name}` : roomIdOrAlias}`}
      </a>
    );
  }

  return undefined;
};

export const factoryRenderLinkifyWithMention = (
  mentionRender: (href: string) => JSX.Element | undefined
): OptFn<(ir: IntermediateRepresentation) => any> => {
  const renderLink: OptFn<(ir: IntermediateRepresentation) => any> = ({
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

    return <a {...attributes}>{content}</a>;
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
  let text = '';

  nodes.forEach((node) => {
    if (node.type === 'text') {
      text += node.data;
    } else if (node instanceof Element && node.children) {
      text += extractTextFromChildren(node.children);
    }
  });

  return text;
};

export function CodeBlock({
  children,
  opts,
}: {
  children: ChildNode[];
  opts: HTMLReactParserOptions;
}) {
  const code = children[0];
  const languageClass =
    code instanceof Element && code.name === 'code' ? code.attribs.class : undefined;
  const language =
    languageClass && languageClass.startsWith('language-')
      ? languageClass.replace('language-', '')
      : languageClass;

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
            before={copied && <PhosphorIcon as={CheckIcon} size="50" />}
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
              <PhosphorIcon size="50" as={expanded ? CaretUpIcon : CaretDownIcon} />
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
          {domToReact(children as any, opts)}
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
    linkifyOpts: LinkifyOpts;
    highlightRegex?: RegExp;
    handleSpoilerClick?: ReactEventHandler<HTMLElement>;
    handleMentionClick?: ReactEventHandler<HTMLElement>;
    useAuthentication?: boolean;
    nicknames?: Nicknames;
    autoplayEmojis?: boolean;
  }
): HTMLReactParserOptions => {
  const opts: HTMLReactParserOptions = {
    replace: (domNode) => {
      if (domNode instanceof Element && 'name' in domNode) {
        const { name, attribs, children, parent } = domNode;
        const renderChildren = () => domToReact(children as any, opts);
        const props = attributesToProps(attribs);

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
          return <CodeBlock opts={opts}>{children}</CodeBlock>;
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
            const codeReact = renderChildren();
            if (typeof codeReact === 'string') {
              let lang = typeof props.className === 'string' ? props.className : undefined;
              if (lang === 'language-rs') lang = 'language-rust';
              else if (lang === 'language-js') lang = 'language-javascript';
              else if (lang === 'language-ts') lang = 'language-typescript';
              return (
                <ErrorBoundary fallback={<code {...props}>{codeReact}</code>}>
                  <Suspense fallback={<code {...props}>{codeReact}</code>}>
                    <ReactPrism>
                      {(ref) => (
                        <code ref={ref} {...props} className={lang}>
                          {codeReact}
                        </code>
                      )}
                    </ReactPrism>
                  </Suspense>
                </ErrorBoundary>
              );
            }
          } else {
            return (
              <Text as="code" size="T300" className={css.Code} {...props}>
                {renderChildren()}
              </Text>
            );
          }
        }

        if (name === 'a' && typeof props.href === 'string') {
          const encodedHref = props.href;
          const decodedHref = encodedHref && safeDecodeUrl(encodedHref);
          if (!decodedHref || !testMatrixTo(decodedHref)) {
            return undefined;
          }

          const content = children.find((child) => !(child instanceof DOMText))
            ? undefined
            : children.map((c) => (c instanceof DOMText ? c.data : '')).join();

          const mention = renderMatrixMention(
            mx,
            roomId,
            safeDecodeUrl(props.href),
            makeMentionCustomProps(params.handleMentionClick, content),
            params.nicknames
          );

          if (mention) return mention;
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
              style={{ cursor: 'pointer' }}
            >
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
                      fallback={
                        <span className={css.EmoticonBase}>{props.alt || props.title || '?'}</span>
                      }
                    />
                  )}
                </span>
              </span>
            );
          }

          if (htmlSrc)
            return (
              <FallbackImg
                {...props}
                className={css.Img}
                src={htmlSrc}
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
        const linkify =
          !(domNode.parent && 'name' in domNode.parent && domNode.parent.name === 'code') &&
          !(domNode.parent && 'name' in domNode.parent && domNode.parent.name === 'a');

        let jsx = scaleSystemEmoji(domNode.data);

        if (params.highlightRegex) {
          jsx = highlightText(params.highlightRegex, jsx);
        }

        if (linkify) {
          return <Linkify options={params.linkifyOpts}>{jsx}</Linkify>;
        }
        return jsx;
      }
      return undefined;
    },
  };
  return opts;
};
