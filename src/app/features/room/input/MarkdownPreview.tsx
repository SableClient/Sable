import { useMemo } from 'react';
import { Box, Scroll, Text, config } from 'folds';
import type { Room } from '$types/matrix-sdk';
import { EventType, MatrixEvent } from '$types/matrix-sdk';
import { useRoomMessagePreviewRenderer } from '$components/message-preview';
import { markdownToHtml } from '$plugins/markdown';
import * as editorCss from '$components/editor/Editor.css';

type MarkdownPreviewProps = {
  room: Room;
  markdown: string;
};

export function MarkdownPreview({ room, markdown }: MarkdownPreviewProps) {
  const renderContent = useRoomMessagePreviewRenderer(room);

  const event = useMemo(
    () =>
      new MatrixEvent({
        type: EventType.RoomMessage,
        room_id: room.roomId,
        content: {
          body: markdown,
          msgtype: 'm.text',
          format: 'org.matrix.custom.html',
          formatted_body: markdownToHtml(markdown),
        },
      }),
    [room.roomId, markdown]
  );

  return (
    <Box direction="Column" gap="100" style={{ padding: `0 ${config.space.S100}` }}>
      <Text size="L400" priority="300">
        Preview
      </Text>
      <Scroll
        className={editorCss.EditorMarkdownPreviewContent}
        variant="SurfaceVariant"
        size="300"
        visibility="Always"
        hideTrack
        style={{ minWidth: 0 }}
      >
        {renderContent(EventType.RoomMessage, false, event, '', () => event.getContent())}
      </Scroll>
    </Box>
  );
}
