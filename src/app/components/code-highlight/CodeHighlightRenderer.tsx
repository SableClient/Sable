import { useEffect, useState } from 'react';

import { highlightCode, type HighlightResult, useArboriumThemeStatus } from '$plugins/arborium';
import * as css from './CodeHighlightRenderer.css';

type CodeHighlightRendererProps = {
  code: string;
  language?: string;
  allowDetect?: boolean;
  className?: string;
};

type RenderState = {
  key: string;
  result: HighlightResult;
};

const createRequestKey = (code: string, language?: string, allowDetect = false) =>
  JSON.stringify([code, language ?? null, allowDetect]);

const createPlainResult = (code: string, language?: string): HighlightResult => {
  const result: HighlightResult = {
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
  const requestKey = createRequestKey(code, language, allowDetect);
  const [state, setState] = useState<RenderState>(() => ({
    key: requestKey,
    result: createPlainResult(code, language),
  }));

  useEffect(() => {
    let cancelled = false;

    setState({
      key: requestKey,
      result: createPlainResult(code, language),
    });

    highlightCode({ code, language, allowDetect }).then((next) => {
      if (!cancelled) {
        setState({
          key: requestKey,
          result: next,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [code, language, allowDetect, requestKey]);

  const currentResult = state.key === requestKey ? state.result : createPlainResult(code, language);
  const codeClassName = [css.CodeHighlightCode, className].filter(Boolean).join(' ');

  if (!ready || currentResult.mode === 'plain') {
    return <code className={codeClassName}>{code}</code>;
  }

  return (
    <code className={codeClassName} dangerouslySetInnerHTML={{ __html: currentResult.html }} />
  );
}
