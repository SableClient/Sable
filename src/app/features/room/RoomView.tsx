import { useCallback, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Transforms } from 'slate';
import { Box, Text, config, toRem } from 'folds';
import { EventType } from '$types/matrix-sdk';
import { ReactEditor } from 'slate-react';
import { isKeyHotkey } from 'is-hotkey';
import { useStateEvent } from '$hooks/useStateEvent';
import { StateEvent } from '$types/matrix/room';
import { usePowerLevelsContext } from '$hooks/usePowerLevels';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useEditor, resetEditor } from '$components/editor';
import { Page } from '$components/page';
import { useKeyDown } from '$hooks/useKeyDown';
import { editableActiveElement } from '$utils/dom';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { SwipeableChatWrapper } from '$components/SwipeableChatWrapper';
import { BackRouteHandler } from '$components/BackRouteHandler';
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
  const editLastMessageRef = useRef<(() => void) | undefined>();

  const [hideReads] = useSetting(settingsAtom, 'hideReads');
  const screenSize = useScreenSizeContext();

  const room = useRoom();
  const { roomId } = room;
  const editor = useEditor();

  const mx = useMatrixClient();

  const tombstoneEvent = useStateEvent(room, StateEvent.RoomTombstone);
  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const canMessage = permissions.event(EventType.RoomMessage, mx.getSafeUserId());

  const [editorResetKey, setEditorResetKey] = useState(0);
  const handleResetEditor = useCallback(() => setEditorResetKey((prev) => prev + 1), []);

  useDelayedEventsSupport();
  const delayedEventsSupported = useAtomValue(delayedEventsSupportedAtom);

  const handleEditMessage = useCallback(
    (body: string) => {
      resetEditor(editor);
      if (body) Transforms.insertText(editor, body);
      ReactEditor.focus(editor);
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
          ReactEditor.focus(editor);
        }
      },
      [editor]
    )
  );

  const openSettings = useOpenRoomSettings();
  const space = useSpaceOptionally();

  const handleOpenMembers = useCallback(() => {
    if (screenSize === ScreenSize.Mobile) {
      openSettings(room.roomId, space?.roomId, RoomSettingsPage.MembersPage);
    }
  }, [screenSize, openSettings, room.roomId, space?.roomId]);

  const callSession = useCallSession(room);
  const callMembers = useCallMembers(room, callSession);
  const callEmbed = useAtomValue(callEmbedAtom);
  const isJoinedInThisRoom = useCallJoined(callEmbed) && callEmbed?.roomId === room.roomId;
  const showCallView = !room.isCallRoom() && (callMembers.length > 0 || isJoinedInThisRoom);

  return (
    <BackRouteHandler>
      {(onBack) => (
        <Page
          ref={roomViewRef}
          style={
            room.isCallRoom() && screenSize === ScreenSize.Desktop
              ? { maxWidth: toRem(399), minWidth: toRem(399) }
              : {}
          }
        >
          <SwipeableChatWrapper onOpenSidebar={onBack} onOpenMembers={handleOpenMembers}>
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
              />
              <RoomViewTyping room={room} />
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
                        onEditLastMessage={() => editLastMessageRef.current?.()}
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
              </div>
              {hideReads ? <RoomViewFollowingPlaceholder /> : <RoomViewFollowing room={room} />}
            </Box>
          </SwipeableChatWrapper>
        </Page>
      )}
    </BackRouteHandler>
  );
}
