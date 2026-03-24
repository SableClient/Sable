import { Box, IconButton, Scroll, Text } from 'folds';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { InfoIcon } from '@phosphor-icons/react/dist/csr/Info';
import { LightbulbIcon } from '@phosphor-icons/react/dist/csr/Lightbulb';
import { useAtomValue } from 'jotai';
import { useClientConfig } from '$hooks/useClientConfig';
import { RoomCard, RoomCardGrid } from '$components/room-card';
import { allRoomsAtom } from '$state/room-list/roomList';
import { RoomSummaryLoader } from '$components/RoomSummaryLoader';
import {
  Page,
  PageContent,
  PageContentCenter,
  PageHeader,
  PageHero,
  PageHeroSection,
} from '$components/page';
import { RoomTopicViewer } from '$components/room-topic-viewer';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { BackRouteHandler } from '$components/BackRouteHandler';
import { PhosphorIcon } from '$components/PhosphorIcon';
import * as css from './style.css';

export function FeaturedRooms() {
  const { featuredCommunities } = useClientConfig();
  const { rooms, spaces } = featuredCommunities ?? {};
  const allRooms = useAtomValue(allRoomsAtom);
  const screenSize = useScreenSizeContext();
  const { navigateSpace, navigateRoom } = useRoomNavigate();

  return (
    <Page>
      {screenSize === ScreenSize.Mobile && (
        <PageHeader>
          <Box shrink="No">
            <BackRouteHandler>
              {(onBack) => (
                <IconButton onClick={onBack}>
                  <PhosphorIcon as={ArrowLeftIcon} />
                </IconButton>
              )}
            </BackRouteHandler>
          </Box>
        </PageHeader>
      )}
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <PageContentCenter>
              <Box direction="Column" gap="200">
                <PageHeroSection>
                  <PageHero
                    icon={<PhosphorIcon as={LightbulbIcon} size="600" />}
                    title="Featured by Client"
                    subTitle="Find and explore public rooms and spaces featured by client provider."
                  />
                </PageHeroSection>
                <Box direction="Column" gap="700">
                  {spaces && spaces.length > 0 && (
                    <Box direction="Column" gap="400">
                      <Text size="H4">Featured Spaces</Text>
                      <RoomCardGrid>
                        {spaces.map((roomIdOrAlias) => (
                          <RoomSummaryLoader key={roomIdOrAlias} roomIdOrAlias={roomIdOrAlias}>
                            {(roomSummary) => (
                              <RoomCard
                                roomIdOrAlias={roomIdOrAlias}
                                allRooms={allRooms}
                                avatarUrl={roomSummary?.avatar_url}
                                name={roomSummary?.name}
                                topic={roomSummary?.topic}
                                memberCount={roomSummary?.num_joined_members}
                                joinRule={roomSummary?.join_rule}
                                onView={navigateSpace}
                                renderTopicViewer={(name, topic, requestClose) => (
                                  <RoomTopicViewer
                                    name={name}
                                    topic={topic}
                                    requestClose={requestClose}
                                  />
                                )}
                              />
                            )}
                          </RoomSummaryLoader>
                        ))}
                      </RoomCardGrid>
                    </Box>
                  )}
                  {rooms && rooms.length > 0 && (
                    <Box direction="Column" gap="400">
                      <Text size="H4">Featured Rooms</Text>
                      <RoomCardGrid>
                        {rooms.map((roomIdOrAlias) => (
                          <RoomSummaryLoader key={roomIdOrAlias} roomIdOrAlias={roomIdOrAlias}>
                            {(roomSummary) => (
                              <RoomCard
                                roomIdOrAlias={roomIdOrAlias}
                                allRooms={allRooms}
                                avatarUrl={roomSummary?.avatar_url}
                                name={roomSummary?.name}
                                topic={roomSummary?.topic}
                                memberCount={roomSummary?.num_joined_members}
                                joinRule={roomSummary?.join_rule}
                                onView={navigateRoom}
                                renderTopicViewer={(name, topic, requestClose) => (
                                  <RoomTopicViewer
                                    name={name}
                                    topic={topic}
                                    requestClose={requestClose}
                                  />
                                )}
                              />
                            )}
                          </RoomSummaryLoader>
                        ))}
                      </RoomCardGrid>
                    </Box>
                  )}
                  {((spaces && spaces.length === 0 && rooms && rooms.length === 0) ||
                    (!spaces && !rooms)) && (
                    <Box
                      className={css.RoomsInfoCard}
                      direction="Column"
                      justifyContent="Center"
                      alignItems="Center"
                      gap="200"
                    >
                      <PhosphorIcon as={InfoIcon} size="400" />
                      <Text size="T300" align="Center">
                        No rooms or spaces featured by client provider.
                      </Text>
                    </Box>
                  )}
                </Box>
              </Box>
            </PageContentCenter>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
