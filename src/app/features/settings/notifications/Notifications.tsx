import { Box, Scroll } from 'folds';
import { PageContent } from '$components/page';
import { SettingsSectionPage } from '../SettingsSectionPage';
import { SystemNotification } from './SystemNotification';
import { AllMessagesNotifications } from './AllMessages';
import { SpecialMessagesNotifications } from './SpecialMessages';
import { KeywordMessagesNotifications } from './KeywordMessages';

type NotificationsProps = {
  requestClose: () => void;
};
export function Notifications({ requestClose }: NotificationsProps) {
  return (
    <SettingsSectionPage title="Notifications" requestClose={requestClose}>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <SystemNotification />
              <AllMessagesNotifications />
              <SpecialMessagesNotifications />
              <KeywordMessagesNotifications />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
