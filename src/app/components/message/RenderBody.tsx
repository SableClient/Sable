import parse, { HTMLReactParserOptions } from 'html-react-parser';
import Linkify from 'linkify-react';
import { Opts } from 'linkifyjs';
import { Text, Tooltip, TooltipProvider, toRem } from 'folds';
import { sanitizeCustomHtml } from '$utils/sanitize';
import { highlightText, scaleSystemEmoji } from '$plugins/react-custom-html-parser';
import { useRoomAbbreviationsContext } from '$hooks/useRoomAbbreviations';
import { splitByAbbreviations } from '$utils/abbreviations';
import { MessageEmptyContent } from './content';

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
                <TooltipProvider
                  // eslint-disable-next-line react/no-array-index-key
                  key={i}
                  position="Bottom"
                  tooltip={
                    <Tooltip style={{ maxWidth: toRem(250) }}>
                      <Text size="T200">{definition}</Text>
                    </Tooltip>
                  }
                >
                  {(triggerRef) => (
                    <abbr ref={triggerRef as React.Ref<HTMLElement>} title={definition}>
                      {seg.text}
                    </abbr>
                  )}
                </TooltipProvider>
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
