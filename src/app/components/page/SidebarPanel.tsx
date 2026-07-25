import { Box, Text, color, config, toRem } from 'folds';
import { SquaresFour, sizedIcon } from '$components/icons/phosphor';
import { useSidebarWidth } from '$hooks/useSidebarWidth';
import { SidebarResizer } from '$pages/client/sidebar/SidebarResizer';
import { UserQuickTools } from '$pages/client/sidebar/UserQuickTools';
import { PageNav, PageNavHeader } from './Page';

/**
 * The resizable left panel that full-page routes show on desktop. Collapses to
 * an icon once dragged narrow enough for the title to stop fitting.
 */
export function SidebarPanel({ title }: { title: string }) {
  const {
    curWidth,
    setCurWidth,
    roomSidebarWidth,
    setRoomSidebarWidth,
    setIsResizingSidebar,
    hideText,
    oldSidebar,
  } = useSidebarWidth();

  return (
    <Box
      shrink="No"
      style={{
        position: 'relative',
        width: toRem(curWidth),
        borderRight: 'solid',
        borderColor: color.SurfaceVariant.ContainerLine,
        borderWidth: `0 ${config.borderWidth.B300} 0 0`,
      }}
    >
      <PageNav>
        <PageNavHeader size="600">
          <Box grow="Yes" gap="300" justifyContent="Center">
            {hideText ? (
              sizedIcon(SquaresFour, '200', { filled: true })
            ) : (
              <Box grow="Yes">
                <Text size="H4" truncate align="Center">
                  {title}
                </Text>
              </Box>
            )}
          </Box>
        </PageNavHeader>
        <SidebarResizer
          setCurWidth={setCurWidth}
          sidebarWidth={roomSidebarWidth}
          setSidebarWidth={setRoomSidebarWidth}
          instep={50}
          outstep={190}
          minValue={50}
          maxValue={500}
          setAnnouncement={setIsResizingSidebar}
        />
      </PageNav>
      {!oldSidebar && <UserQuickTools width={curWidth + 66} compact={false} />}
    </Box>
  );
}
