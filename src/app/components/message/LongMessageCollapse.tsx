import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Box, Button, Text, config } from 'folds';

const LONG_MESSAGE_LINE_LIMIT = 30;

type LongMessageCollapseProps = {
  children: ReactNode;
};

export function LongMessageCollapse({ children }: LongMessageCollapseProps) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const lineHeight = parseFloat(getComputedStyle(body).lineHeight) || 20;
    // In the clamped (-webkit-box) state scrollHeight holds the unclamped
    // height; in the inline-block state clientHeight is the full height.
    const height = Math.max(body.scrollHeight, body.clientHeight);
    setOverflowing(height / lineHeight > LONG_MESSAGE_LINE_LIMIT + 0.5);
  }, [children]);

  // A block wrapper would push inline siblings (like the "(edited)" indicator)
  // onto a new line, so keep the body inline-block and only switch to the
  // line-clamped box once it is known to overflow.
  const collapsedStyle: CSSProperties | undefined =
    expanded || !overflowing
      ? { display: 'inline-block' }
      : {
          display: '-webkit-box',
          WebkitLineClamp: LONG_MESSAGE_LINE_LIMIT,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        };

  return (
    <>
      <div ref={bodyRef} style={collapsedStyle}>
        {children}
      </div>
      {overflowing && (
        <Box style={{ marginTop: config.space.S200 }}>
          <Button
            as="button"
            type="button"
            variant="Secondary"
            fill="Soft"
            size="300"
            radii="300"
            onClick={() => setExpanded((current) => !current)}
          >
            <Text size="B300">{expanded ? 'Show less' : 'Show more'}</Text>
          </Button>
        </Box>
      )}
    </>
  );
}
