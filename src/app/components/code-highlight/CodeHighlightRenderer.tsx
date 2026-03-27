import { useEffect, useState } from 'react';

import { highlightCode, type HighlightResult, useArboriumThemeStatus } from '$plugins/arborium';

type CodeHighlightRendererProps = {
  code: string;
  language?: string;
  allowDetect?: boolean;
  className?: string;
};

type RenderResult = HighlightResult;

const createPlainResult = (code: string, language?: string): RenderResult => {
  const result: RenderResult = {
    mode: 'plain',
    html: code,
  };

  if (language !== undefined) {
    result.language = language;
  }

  return result;
};

export function CodeHighlightRenderer({
  code,
  language,
  allowDetect = false,
  className,
}: CodeHighlightRendererProps) {
  const { ready } = useArboriumThemeStatus();
  const [result, setResult] = useState<RenderResult>(() => createPlainResult(code, language));

  useEffect(() => {
    let cancelled = false;

    setResult(createPlainResult(code, language));

    highlightCode({ code, language, allowDetect })
      .then((next) => {
        if (!cancelled) {
          setResult(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResult(createPlainResult(code, language));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code, language, allowDetect]);

  if (!ready || result.mode === 'plain') {
    return <code className={className}>{code}</code>;
  }

  // Arborium HTML is only rendered after both highlight and theme CSS are ready.
  /* eslint-disable-next-line react/no-danger */
  return <code className={className} dangerouslySetInnerHTML={{ __html: result.html }} />;
}
