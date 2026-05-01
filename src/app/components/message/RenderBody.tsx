import type { KeyboardEventHandler, MouseEventHandler } from 'react';
import { useEffect, useState } from 'react';
import type { HTMLReactParserOptions } from 'html-react-parser';
import parse from 'html-react-parser';
import Linkify from 'linkify-react';
import type { Opts } from 'linkifyjs';
import { find } from 'linkifyjs';
import type { RectCords } from 'folds';
import { PopOut, Text, Tooltip, TooltipProvider, toRem } from 'folds';
import { sanitizeCustomHtml } from '$utils/sanitize';
import { highlightText, scaleSystemEmoji } from '$plugins/react-custom-html-parser';
import { useRoomAbbreviationsContext } from '$hooks/useRoomAbbreviations';
import type { TextSegment } from '$utils/abbreviations';
import { splitByAbbreviations } from '$utils/abbreviations';
import { MessageEmptyContent } from './content';

function getRenderedBodyText(text: string, highlightRegex?: RegExp): (string | JSX.Element)[] {
  const emojiScaledText = scaleSystemEmoji(text);

  return highlightRegex ? highlightText(highlightRegex, emojiScaledText) : emojiScaledText;
}

function renderLinkifiedBodyText(
  text: string,
  linkifyOpts: Opts,
  highlightRegex: RegExp | undefined,
  key?: string
): JSX.Element {
  return (
    <Linkify key={key} options={linkifyOpts}>
      {getRenderedBodyText(text, highlightRegex)}
    </Linkify>
  );
}

type RenderTextFn = (text: string, key?: string) => JSX.Element;

function splitBodyTextByAbbreviations(
  text: string,
  abbrMap: Map<string, string>,
  linkifyOpts?: Opts
): TextSegment[] {
  if (abbrMap.size === 0) return [{ id: 'txt-0', text }];

  const linkMatches = find(text, linkifyOpts).filter((match) => match.isLink);
  if (linkMatches.length === 0) return splitByAbbreviations(text, abbrMap);

  const segments: Array<Omit<TextSegment, 'id'>> = [];
  let lastIndex = 0;

  linkMatches.forEach(({ start, end }) => {
    if (start > lastIndex) {
      splitByAbbreviations(text.slice(lastIndex, start), abbrMap).forEach(
        ({ text: segmentText, termKey }) => {
          segments.push({ text: segmentText, termKey });
        }
      );
    }

    segments.push({ text: text.slice(start, end) });
    lastIndex = end;
  });

  if (lastIndex < text.length) {
    splitByAbbreviations(text.slice(lastIndex), abbrMap).forEach(
      ({ text: segmentText, termKey }) => {
        segments.push({ text: segmentText, termKey });
      }
    );
  }

  if (segments.length === 0) {
    return [{ id: 'txt-0', text }];
  }
  const result = segments as TextSegment[];
  for (let i = 0; i < result.length; i += 1) {
    result[i]!.id = `txt-${i}`;
  }
  return result;
}

type AbbreviationTermProps = {
  text: string;
  definition: string;
};
function AbbreviationTerm({ text, definition }: AbbreviationTermProps) {
  const [anchor, setAnchor] = useState<RectCords | undefined>();

  const toggleAnchor = (target: HTMLElement) => {
    setAnchor((prev) => (prev ? undefined : target.getBoundingClientRect()));
  };

  const handleClick: MouseEventHandler<HTMLElement> = (e) => {
    e.stopPropagation();
    toggleAnchor(e.currentTarget);
  };

  const handleKeyDown: KeyboardEventHandler<HTMLElement> = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    toggleAnchor(e.currentTarget);
  };

  // On mobile, tapping an abbreviation pins the tooltip open.
  // Tapping anywhere else (outside the abbr) dismisses it.
  useEffect(() => {
    if (!anchor) return undefined;
    const dismiss = () => setAnchor(undefined);
    document.addEventListener('click', dismiss, { once: true });
    return () => document.removeEventListener('click', dismiss);
  }, [anchor]);

  const tooltipContent = (
    <Tooltip style={{ maxWidth: toRem(250) }}>
      <Text size="T200">{definition}</Text>
    </Tooltip>
  );

  return (
    <>
      <TooltipProvider position="Top" tooltip={tooltipContent}>
        {(triggerRef) => (
          <abbr
            ref={triggerRef as React.Ref<HTMLElement>}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            style={{ textDecoration: 'underline dotted', cursor: 'help' }}
          >
            {text}
          </abbr>
        )}
      </TooltipProvider>
      {anchor && (
        <PopOut anchor={anchor} position="Top" align="Center" content={tooltipContent}>
          {null}
        </PopOut>
      )}
    </>
  );
}

/**
 * Builds a `replaceTextNode` callback for use with {@link getReactCustomHtmlParser}.
 * Returns `undefined` when there are no abbreviations to apply (avoids creating
 * extra closures in the common case).
 */
export function buildAbbrReplaceTextNode(
  abbrMap: Map<string, string>,
  linkifyOpts?: Opts
): ((text: string, renderText: RenderTextFn) => JSX.Element | undefined) | undefined {
  if (abbrMap.size === 0) return undefined;
  return function replaceTextNode(text: string, renderText: RenderTextFn) {
    const segments = splitBodyTextByAbbreviations(text, abbrMap, linkifyOpts);
    if (!segments.some((s) => s.termKey !== undefined)) return undefined;
    return (
      <>
        {segments.map((seg) =>
          seg.termKey !== undefined ? (
            <AbbreviationTerm
              key={seg.id}
              text={seg.text}
              definition={abbrMap.get(seg.termKey) ?? ''}
            />
          ) : (
            renderText(seg.text, seg.id)
          )
        )}
      </>
    );
  };
}

type RenderBodyProps = {
  body: string;
  customBody?: string;
  highlightRegex?: RegExp;
  htmlReactParserOptions: HTMLReactParserOptions;
  linkifyOpts: Opts;
};
export function RenderBody({
  body,
  customBody,
  highlightRegex,
  htmlReactParserOptions,
  linkifyOpts,
}: Readonly<RenderBodyProps>) {
  const abbrMap = useRoomAbbreviationsContext();

  if (customBody) {
    return parse(sanitizeCustomHtml(customBody), htmlReactParserOptions);
  }
  if (body === '') return <MessageEmptyContent />;

  if (abbrMap.size > 0) {
    const segments = splitBodyTextByAbbreviations(body, abbrMap, linkifyOpts);
    if (segments.some((s) => s.termKey !== undefined)) {
      return (
        <>
          {segments.map((seg) => {
            if (seg.termKey !== undefined) {
              const definition = abbrMap.get(seg.termKey) ?? '';
              return <AbbreviationTerm key={seg.id} text={seg.text} definition={definition} />;
            }
            return renderLinkifiedBodyText(seg.text, linkifyOpts, highlightRegex, seg.id);
          })}
        </>
      );
    }
  }

  return renderLinkifiedBodyText(body, linkifyOpts, highlightRegex);
}
