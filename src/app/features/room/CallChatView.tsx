import { useSetAtom } from 'jotai';
import { useParams } from 'react-router-dom';
import { Box, Text, TooltipProvider, Tooltip, Icon, Icons, IconButton, toRem } from 'folds';
import { Page, PageHeader } from '../../components/page';
import { callChatAtom } from '../../state/callEmbed';
import { RoomView } from './RoomView';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { SidebarResizer } from '$pages/client/sidebar/SidebarResizer';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { mobileOrTablet } from '$utils/user-agent';
import { useState, useEffect } from 'react';

export function CallChatView() {
  const { eventId } = useParams();
  const setChat = useSetAtom(callChatAtom);
  const screenSize = useScreenSizeContext();

  const handleClose = () => setChat(false);

  const [vcmsgSidebarWidth, setVcmsgSidebarWidth] = useSetting(settingsAtom, 'vcmsgSidebarWidth');
  const [curWidth, setCurWidth] = useState(vcmsgSidebarWidth);
  useEffect(() => {
    setCurWidth(vcmsgSidebarWidth);
  }, [vcmsgSidebarWidth]);
  return (
    <Box
      shrink="No"
      style={{
        position: 'relative',
        width: screenSize === ScreenSize.Desktop ? toRem(curWidth) : '100%',
        flexShrink: 0,
        flexGrow: 0,
      }}
    >
      {!mobileOrTablet() && (
        <SidebarResizer
          setCurWidth={setCurWidth}
          sidebarWidth={vcmsgSidebarWidth}
          setSidebarWidth={setVcmsgSidebarWidth}
          minValue={300}
          maxValue={1000}
          isReversed
        />
      )}
      <Page
        style={{
          width: '100%',
          flexShrink: 0,
          flexGrow: 0,
        }}
      >
        <PageHeader>
          <Box grow="Yes" alignItems="Center" gap="200">
            <Box grow="Yes">
              <Text size="H5" truncate>
                Chat
              </Text>
            </Box>
            <Box shrink="No" alignItems="Center">
              <TooltipProvider
                position="Bottom"
                align="End"
                offset={4}
                tooltip={
                  <Tooltip>
                    <Text>Close</Text>
                  </Tooltip>
                }
              >
                {(triggerRef) => (
                  <IconButton ref={triggerRef} variant="Surface" onClick={handleClose}>
                    <Icon src={Icons.Cross} />
                  </IconButton>
                )}
              </TooltipProvider>
            </Box>
          </Box>
        </PageHeader>
        <Box grow="Yes" direction="Column">
          <RoomView eventId={eventId} />
        </Box>
      </Page>
    </Box>
  );
}
