import { Box, color, Dialog, Header, Icon, IconButton, Icons, Scroll, Text, config } from 'folds';
import { BookmarksList } from './BookmarksList';

export { BookmarksList } from './BookmarksList';

type BookmarksPanelProps = {
  requestClose: () => void;
};

export function BookmarksPanel({ requestClose }: BookmarksPanelProps) {
  return (
    <Dialog
      variant="Surface"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 0,
        borderRight: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
        boxShadow: '4px 0 24px rgba(0,0,0,0.18)',
      }}
    >
      <Header
        style={{
          padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
          borderBottomWidth: config.borderWidth.B300,
        }}
        variant="Surface"
        size="500"
      >
        <Box grow="Yes" alignItems="Center" gap="200">
          <Icon src={Icons.Bookmark} size="200" />
          <Text size="H4">Bookmarks</Text>
        </Box>
        <IconButton size="300" onClick={requestClose} radii="300">
          <Icon src={Icons.Cross} />
        </IconButton>
      </Header>
      <Box grow="Yes" style={{ overflow: 'hidden' }}>
        <Scroll hideTrack>
          <Box style={{ padding: config.space.S300 }}>
            <BookmarksList onNavigate={requestClose} />
          </Box>
        </Scroll>
      </Box>
    </Dialog>
  );
}
