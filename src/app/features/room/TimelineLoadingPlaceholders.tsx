import { Box, config } from 'folds';
import { CompactPlaceholder, DefaultPlaceholder, MessageBase } from '$components/message';
import { MessageLayout, type MessageSpacing } from '$state/settings';

export type TimelineLoadingPlaceholdersProps = {
  count?: number;
  messageLayout: MessageLayout;
  messageSpacing: MessageSpacing;
};

export function TimelineLoadingPlaceholders({
  count = 6,
  messageLayout,
  messageSpacing,
}: Readonly<TimelineLoadingPlaceholdersProps>) {
  return (
    <Box
      aria-hidden
      direction="Column"
      gap="300"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        paddingTop: config.space.S600,
        paddingBottom: config.space.S600,
        pointerEvents: 'none',
        justifyContent: 'flex-end',
      }}
    >
      {Array.from({ length: count }, (_, index) => (
        <MessageBase key={`timeline-placeholder-${index}`} space={messageSpacing}>
          {messageLayout === MessageLayout.Compact ? (
            <CompactPlaceholder />
          ) : (
            <DefaultPlaceholder />
          )}
        </MessageBase>
      ))}
    </Box>
  );
}
