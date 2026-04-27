import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import type { ContainerColor } from 'folds';
import { Avatar, Box, as, color, toRem } from 'folds';
import { randomNumberBetween } from '$utils/common';
import { ModernLayout } from '$components/message/layout';
import { LinePlaceholder } from './LinePlaceholder';

const contentMargin: CSSProperties = { marginTop: toRem(3) };

type DefaultPlaceholderProps = {
  variant?: ContainerColor;
};

export const DefaultPlaceholder = as<'div', DefaultPlaceholderProps>(
  ({ variant, ...props }, ref) => {
    const nameSize = useMemo(() => randomNumberBetween(40, 100), []);
    const msgSize = useMemo(() => randomNumberBetween(80, 200), []);
    const msg2Size = useMemo(() => randomNumberBetween(80, 200), []);

    return (
      <ModernLayout
        {...props}
        ref={ref}
        before={
          <Avatar
            style={{
              backgroundColor: color[variant ?? 'SurfaceVariant'].Container,
            }}
            size="300"
          />
        }
      >
        <Box style={contentMargin} grow="Yes" direction="Column" gap="200">
          <Box grow="Yes" gap="200" alignItems="Center" justifyContent="SpaceBetween">
            <LinePlaceholder variant={variant} style={{ maxWidth: toRem(nameSize) }} />
            <LinePlaceholder variant={variant} style={{ maxWidth: toRem(50) }} />
          </Box>
          <Box grow="Yes" gap="200" wrap="Wrap">
            <LinePlaceholder variant={variant} style={{ maxWidth: toRem(msgSize) }} />
            <LinePlaceholder variant={variant} style={{ maxWidth: toRem(msg2Size) }} />
          </Box>
        </Box>
      </ModernLayout>
    );
  }
);
