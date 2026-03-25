import { MouseEventHandler, useEffect, useState } from 'react';
import parse, { HTMLReactParserOptions } from 'html-react-parser';
import Linkify from 'linkify-react';
import { Opts } from 'linkifyjs';
import { PopOut, RectCords, Text, Tooltip, TooltipProvider, toRem } from 'folds';
import { sanitizeCustomHtml } from '$utils/sanitize';
import { highlightText, scaleSystemEmoji } from '$plugins/react-custom-html-parser';
import { useRoomAbbreviationsContext } from '$hooks/useRoomAbbreviations';
import { splitByAbbreviations } from '$utils/abbreviations';
import { MessageEmptyContent } from './content';

type AbbreviationTermProps = {
  text: string;
  definition: string;
};
function AbbreviationTerm({ text, definition }: AbbreviationTermProps) {
  const [anchor, setAnchor] = useState<RectCords | undefined>();

  const handleClick: MouseEventHandler<HTMLElement> = (e) => {
    e.stopPropagation();
    setAnchor((prev) => (prev ? undefined : e.currentTarget.getBoundingClientRect()));
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
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
          <abbr
            ref={triggerRef as React.Ref<HTMLElement>}
            onClick={handleClick}
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
  abbrMap: Map<string, string>
): ((text: string) => JSX.Element | undefined) | undefined {
  if (abbrMap.size === 0) return undefined;
  return function replaceTextNode(text: string) {
    const segments = splitByAbbreviations(text, abbrMap);
    if (!segments.some((s) => s.termKey !== undefined)) return undefined;
    return (
      <>
        {segments.map((seg, i) =>
          seg.termKey !== undefined ? (
            // eslint-disable-next-line react/no-array-index-key
            <AbbreviationTerm key={i} text={seg.text} definition={abbrMap.get(seg.termKey) ?? ''} />
          ) : (
            seg.text
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
    if (customBody === '') return <MessageEmptyContent />;
    return parse(sanitizeCustomHtml(customBody), htmlReactParserOptions);
  }
  if (body === '') return <MessageEmptyContent />;

  if (abbrMap.size > 0) {
    const segments = splitByAbbreviations(body, abbrMap);
    if (segments.some((s) => s.termKey !== undefined)) {
      return (
        <>
          {segments.map((seg, i) => {
            if (seg.termKey !== undefined) {
              const definition = abbrMap.get(seg.termKey) ?? '';
              return (
                // eslint-disable-next-line react/no-array-index-key
                <AbbreviationTerm key={i} text={seg.text} definition={definition} />
              );
            }
            return (
              // eslint-disable-next-line react/no-array-index-key
              <Linkify key={i} options={linkifyOpts}>
                {highlightRegex
                  ? highlightText(highlightRegex, scaleSystemEmoji(seg.text))
                  : scaleSystemEmoji(seg.text)}
              </Linkify>
            );
          })}
        </>
      );
    }
  }

  return (
    <Linkify options={linkifyOpts}>
      {highlightRegex
        ? highlightText(highlightRegex, scaleSystemEmoji(body))
        : scaleSystemEmoji(body)}
    </Linkify>
  );
}
