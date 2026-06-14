import classNames from 'classnames';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Text } from 'folds';
import { scaleSystemEmoji } from '$plugins/react-custom-html-parser';
import { buildMessageDiffDisplay, type MessageDiffRow, type TextDiffPart } from '$utils/textDiff';

import * as css from './InlineTextDiff.css';

const SKIP_EXPAND_CHUNK = 20;

type InlineTextDiffProps = {
  oldText: string;
  newText: string;
};

type CodeDiffRow = Exclude<MessageDiffRow, { type: 'skip' }>;

const renderInlineParts = (parts: TextDiffPart[]) =>
  parts.map((part, index) => {
    const content = scaleSystemEmoji(part.value);
    const key = `diff-${index}-${part.type}`;
    if (part.type === 'delete') {
      return (
        <span key={key} className={css.DiffInlineDelete}>
          {content}
        </span>
      );
    }
    if (part.type === 'insert') {
      return (
        <span key={key} className={css.DiffInlineInsert}>
          {content}
        </span>
      );
    }
    return <span key={key}>{content}</span>;
  });

const renderCodeLine = (row: CodeDiffRow, key: string) => {
  const prefix = row.type === 'delete' ? '-' : row.type === 'insert' ? '+' : ' ';
  const lineClass =
    row.type === 'delete'
      ? css.DiffLineDelete
      : row.type === 'insert'
        ? css.DiffLineInsert
        : css.DiffLineEqual;

  return (
    <div key={key} className={classNames(css.DiffLine, lineClass)}>
      <span className={css.DiffLinePrefix} aria-hidden>
        {prefix}
      </span>
      <span className={css.DiffLineText}>{scaleSystemEmoji(row.text)}</span>
    </div>
  );
};

type DiffSkipRowsProps = {
  skipIndex: number;
  lines: string[];
  placement: 'before' | 'after' | 'between';
  revealed: number;
  onReveal: (skipIndex: number, amount: number) => void;
};

function DiffSkipRows({ skipIndex, lines, placement, revealed, onReveal }: DiffSkipRowsProps) {
  const remaining = lines.length - revealed;
  const nextReveal = Math.min(SKIP_EXPAND_CHUNK, remaining);
  const expandUp = placement === 'before';
  const arrow = expandUp ? '↑' : '↓';
  const revealedLines =
    placement === 'before'
      ? lines.slice(Math.max(0, lines.length - revealed))
      : lines.slice(0, revealed);

  const label = `Expand ${remaining <= SKIP_EXPAND_CHUNK ? `all ${remaining}` : nextReveal} unchanged ${remaining === 1 ? 'line' : 'lines'}`;

  const expandRow =
    remaining > 0 ? (
      <button
        type="button"
        className={css.DiffExpand}
        onClick={() => onReveal(skipIndex, nextReveal)}
      >
        <span className={css.DiffLinePrefix} aria-hidden>
          {' '}
        </span>
        <span className={css.DiffLineText}>
          {arrow} {label}
        </span>
      </button>
    ) : null;

  const revealedRows = revealedLines.map((line, lineIndex) =>
    renderCodeLine({ type: 'equal', text: line }, `skip-${skipIndex}-line-${lineIndex}`)
  );

  if (expandUp) {
    return (
      <>
        {expandRow}
        {revealedRows}
      </>
    );
  }

  return (
    <>
      {revealedRows}
      {expandRow}
    </>
  );
}

function InlineDiffBlock({ children }: { children: ReactNode }) {
  return (
    <Text as="pre" size="T200" className={css.DiffCodeBlock}>
      <code className={css.DiffCodeBlockInner}>{children}</code>
    </Text>
  );
}

export function InlineTextDiff({ oldText, newText }: InlineTextDiffProps) {
  const display = useMemo(() => buildMessageDiffDisplay(oldText, newText), [oldText, newText]);
  const [revealedBySkip, setRevealedBySkip] = useState<Record<number, number>>({});

  const revealSkip = useCallback((skipIndex: number, amount: number) => {
    setRevealedBySkip((prev) => ({
      ...prev,
      [skipIndex]: (prev[skipIndex] ?? 0) + amount,
    }));
  }, []);

  if (display.mode === 'inline') {
    if (display.parts.length === 0) {
      return <InlineDiffBlock>(empty)</InlineDiffBlock>;
    }

    return (
      <InlineDiffBlock>
        <div className={classNames(css.DiffLine, css.DiffLineEqual)}>
          <span className={css.DiffLinePrefix} aria-hidden>
            {' '}
          </span>
          <span className={css.DiffLineText}>{renderInlineParts(display.parts)}</span>
        </div>
      </InlineDiffBlock>
    );
  }

  if (display.rows.length === 0) {
    return <InlineDiffBlock>(empty)</InlineDiffBlock>;
  }

  let skipIndex = 0;

  return (
    <InlineDiffBlock>
      {display.rows.map((row, index) => {
        if (row.type === 'skip') {
          const currentSkipIndex = skipIndex;
          skipIndex += 1;
          return (
            <DiffSkipRows
              key={`skip-${currentSkipIndex}`}
              skipIndex={currentSkipIndex}
              lines={row.lines}
              placement={row.placement}
              revealed={revealedBySkip[currentSkipIndex] ?? 0}
              onReveal={revealSkip}
            />
          );
        }

        return renderCodeLine(row, `${row.type}-${row.text}-${index}`);
      })}
    </InlineDiffBlock>
  );
}
