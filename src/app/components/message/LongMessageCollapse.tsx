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
    setOverflowing(body.scrollHeight > body.clientHeight);
  }, [children]);

  const collapsedStyle: CSSProperties | undefined = expanded
    ? undefined
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
