import type { ReactNode } from 'react';
import type { RectCords } from 'folds';
import { Box, IconButton, Text } from 'folds';
import { composerIcon, DotsThreeOutlineVerticalIcon } from '$components/icons/phosphor';
import { PageNavHeader } from '$components/page';
import { ResponsiveMenu } from '$components/ResponsiveMenu';

type PageNavHeaderWithMenuProps = {
  hideText?: boolean;
  title: string;
  collapsedIcon: ReactNode;
  menu: ReactNode;
  anchor: RectCords | undefined;
  requestClose: () => void;
  triggerProps: {
    onClick: React.MouseEventHandler<HTMLButtonElement>;
  };
};

export function PageNavHeaderWithMenu({
  hideText,
  title,
  collapsedIcon,
  menu,
  anchor,
  requestClose,
  triggerProps,
}: PageNavHeaderWithMenuProps) {
  return (
    <>
      <PageNavHeader size="600">
        {hideText ? (
          <Box alignItems="Center" grow="Yes" justifyContent="Center">
            <IconButton aria-pressed={!!anchor} variant="Background" onClick={triggerProps.onClick}>
              {collapsedIcon}
            </IconButton>
          </Box>
        ) : (
          <Box grow="Yes" gap="300">
            <Box grow="Yes" alignItems="Center">
              <Text size="H4" truncate>
                {title}
              </Text>
            </Box>
            <Box shrink="No">
              <IconButton
                aria-pressed={!!anchor}
                variant="Background"
                onClick={triggerProps.onClick}
              >
                {composerIcon(DotsThreeOutlineVerticalIcon, {
                  weight: anchor ? 'fill' : 'regular',
                })}
              </IconButton>
            </Box>
          </Box>
        )}
      </PageNavHeader>
      <ResponsiveMenu
        anchor={anchor}
        requestClose={requestClose}
        position="Bottom"
        align="End"
        offset={6}
        menu={menu}
      />
    </>
  );
}
