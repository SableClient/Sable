import { ReactNode } from 'react';
import { Box, Text } from 'folds';
import { BreakWord } from '$styles/Text.css';

type SettingTileProps = {
  focusId?: string;
  className?: string;
  title?: ReactNode;
  description?: ReactNode;
  before?: ReactNode;
  after?: ReactNode;
  children?: ReactNode;
};
export function SettingTile({
  focusId,
  className,
  title,
  description,
  before,
  after,
  children,
}: SettingTileProps) {
  return (
    <Box
      id={focusId}
      data-settings-focus={focusId}
      className={className}
      alignItems="Center"
      gap="300"
    >
      {before && <Box shrink="No">{before}</Box>}
      <Box grow="Yes" direction="Column" gap="100">
        {title && (
          <Text className={BreakWord} size="T300">
            {title}
          </Text>
        )}
        {description && (
          <Text className={BreakWord} size="T200" priority="300">
            {description}
          </Text>
        )}
        {children}
      </Box>
      {after && <Box shrink="No">{after}</Box>}
    </Box>
  );
}
