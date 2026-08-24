import { useCallback, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Box, Text, config } from 'folds';
import { EventType } from '$types/matrix-sdk';
import { isKeyHotkey } from 'is-hotkey';
import { useStateEvent } from '$hooks/useStateEvent';

import { usePowerLevelsContext } from '$hooks/usePowerLevels';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useEditor } from '$components/editor';
import { BlockType } from '$components/editor';
import { Page } from '$components/page';
import { useKeyDown } from '$hooks/useKeyDown';
import { editableActiveElement } from '$utils/dom';
import { isMobileOrTablet } from '$utils/platform';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { SwipeableChatWrapper } from '$components/SwipeableChatWrapper';
import { useOpenRoomSettings } from '$state/hooks/roomSettings';
import { useSpaceOptionally } from '$hooks/useSpace';
import { RoomSettingsPage } from '$state/roomSettings';
import { GlobalModalManager } from '$components/message/modals/GlobalModalManager';
import { useDelayedEventsSupport } from '$hooks/useDelayedEventsSupport';
import { delayedEventsSupportedAtom } from '$state/scheduledMessages';
import { useCallMembers, useCallSession } from '$hooks/useCall';
import { callEmbedAtom } from '$state/callEmbed';
import { useCallJoined } from '$hooks/useCallEmbed';
import { CallView } from '$features/call/CallView';
import { useRoom } from '$hooks/useRoom';
import { useMessageEdit } from '$hooks/useMessageEdit';
import { useAlive } from '$hooks/useAlive';
import { RoomViewFollowing, RoomViewFollowingPlaceholder } from './RoomViewFollowing';
import { RoomInput } from './RoomInput';
import { RoomTombstone } from './RoomTombstone';
import { RoomViewTyping } from './RoomViewTyping';
import { RoomTimeline } from './RoomTimeline';
import { RoomInputPlaceholder } from './RoomInputPlaceholder';
import { ScheduledMessagesList } from './schedule-send';

const FN_KEYS_REGEX = /^F\d+$/;
const shouldFocusMessageField = (evt: KeyboardEvent): boolean => {
  const { code } = evt;
  if (evt.metaKey || evt.altKey || evt.ctrlKey) {
    return false;
  }

  if (FN_KEYS_REGEX.test(code)) return false;

  if (
    code.startsWith('OS') ||
    code.startsWith('Meta') ||
    code.startsWith('Shift') ||
    code.startsWith('Alt') ||
    code.startsWith('Control') ||
    code.startsWith('Arrow') ||
    code.startsWith('Page') ||
    code.startsWith('End') ||
    code.startsWith('Home') ||
    code === 'Tab' ||
    code === 'Space' ||
    code === 'Enter' ||
    code === 'NumLock' ||
    code === 'ScrollLock'
  ) {
    return false;
  }

  return true;
};

export function RoomView({ eventId }: { eventId?: string }) {
  const roomInputRef = useRef<HTMLDivElement>(null);
  const roomViewRef = useRef<HTMLDivElement>(null);
  const editLastMessageRef = useRef<(() => void) | undefined>(undefined);

  const [hideReads] = useSetting(settingsAtom, 'hideReads');
  const screenSize = useScreenSizeContext();

  const room = useRoom();
  const { roomId } = room;
  const editor = useEditor();

  const mx = useMatrixClient();

  const tombstoneEvent = useStateEvent(room, EventType.RoomTombstone);
  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const canMessage = permissions.message(room.hasEncryptionStateEvent(), mx.getSafeUserId());

  const [editorResetKey, setEditorResetKey] = useState(0);
  const handleResetEditor = useCallback(() => setEditorResetKey((prev) => prev + 1), []);
  const alive = useAlive();
  const { editId, handleEdit } = useMessageEdit(editor, {
    onReset: handleResetEditor,
    alive,
    focusOnCancel: !isMobileOrTablet(),
  });
  const onCancelEdit = useCallback(() => handleEdit(undefined), [handleEdit]);
  const onEditLastMessage = useCallback(() => editLastMessageRef.current?.(), []);

  useDelayedEventsSupport();
  const delayedEventsSupported = useAtomValue(delayedEventsSupportedAtom);

  const handleEditMessage = useCallback(
    (body: string) => {
      editor.setDocument(body ? [{ type: BlockType.Paragraph, children: [{ text: body }] }] : []);
      editor.focus();
    },
    [editor]
  );

  useKeyDown(
    window,
    useCallback(
      (evt) => {
        if (editableActiveElement()) return;
        const portalContainer = document.getElementById('portalContainer');
        if (portalContainer && portalContainer.children.length > 0) {
          return;
        }
        if (shouldFocusMessageField(evt) || isKeyHotkey('mod+v', evt)) {
          editor.focus();
        }
      },
      [editor]
    )
  );

  const openSettings = useOpenRoomSettings();
  const space = useSpaceOptionally();

  const handleOpenMembers = useCallback(() => {
    if (screenSize === ScreenSize.Mobile) {
      openSettings(room.roomId, space?.roomId, RoomSettingsPage.MembersPage, { viaSwipe: true });
    }
  }, [screenSize, openSettings, room.roomId, space?.roomId]);

  const callSession = useCallSession(room);
  const callMembers = useCallMembers(room, callSession);
  const callEmbed = useAtomValue(callEmbedAtom);
  const isJoinedInThisRoom = useCallJoined(callEmbed) && callEmbed?.roomId === room.roomId;
  const showCallView = !room.isCallRoom() && (callMembers.length > 0 || isJoinedInThisRoom);

  return (
    <Page
      ref={roomViewRef}
      style={{
        position: 'relative',
        overflow: 'hidden',
        isolation: 'isolate',
        minWidth: 0,
        minHeight: 0,
        width: '100%',
      }}
    >
      <SwipeableChatWrapper onOpenMembers={handleOpenMembers}>
        <Box grow="Yes" direction="Column">
          {showCallView && (
            <Box shrink="No" style={{ width: '100%', position: 'relative' }}>
              <CallView resizable />
            </Box>
          )}
          <RoomTimeline
            key={roomId}
            room={room}
            eventId={eventId}
            editor={editor}
            onEditorReset={handleResetEditor}
            onEditLastMessageRef={editLastMessageRef}
            editId={editId}
            onEditId={handleEdit}
          />
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <RoomViewTyping room={room} />
          </div>
          <GlobalModalManager />
        </Box>
        <Box shrink="No" direction="Column">
          {canMessage && delayedEventsSupported && (
            <ScheduledMessagesList room={room} onEditMessage={handleEditMessage} />
          )}
          <div style={{ padding: `0 ${config.space.S400}` }}>
            {tombstoneEvent ? (
              <RoomTombstone
                roomId={roomId}
                body={tombstoneEvent.getContent().body}
                replacementRoomId={tombstoneEvent.getContent().replacement_room}
              />
            ) : (
              <>
                {canMessage && (
                  <RoomInput
                    key={`${roomId}-${editorResetKey}`}
                    room={room}
                    editor={editor}
                    roomId={roomId}
                    fileDropContainerRef={roomViewRef}
                    ref={roomInputRef}
                    onEditLastMessage={onEditLastMessage}
                    editId={editId}
                    onCancelEdit={onCancelEdit}
                  />
                )}
                {!canMessage && (
                  <RoomInputPlaceholder
                    style={{ padding: config.space.S200 }}
                    alignItems="Center"
                    justifyContent="Center"
                  >
                    <Text align="Center">You do not have permission to post in this room</Text>
                  </RoomInputPlaceholder>
                )}
              </>
            )}
            {hideReads ? <RoomViewFollowingPlaceholder /> : <RoomViewFollowing room={room} />}
          </div>
        </Box>
      </SwipeableChatWrapper>
    </Page>
  );
}
