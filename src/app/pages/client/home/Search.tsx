import { useRef } from 'react';
import { Box, Scroll } from 'folds';
import { MessageSearchHeader, Page, PageContent, PageContentCenter } from '$components/page';
import { MessageSearch } from '$features/message-search';
import { useHomeRooms } from './useHomeRooms';

export function HomeSearch() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rooms = useHomeRooms();

  return (
    <Page>
      <MessageSearchHeader />
      <Box style={{ position: 'relative' }} grow="Yes">
        <Scroll ref={scrollRef} hideTrack visibility="Hover">
          <PageContent>
            <PageContentCenter>
              <MessageSearch
                defaultRoomsFilterName="Home"
                allowGlobal
                rooms={rooms}
                scrollRef={scrollRef}
              />
            </PageContentCenter>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
