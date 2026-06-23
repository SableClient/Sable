import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.resolve(__dirname, '../../../..');

const readWorkspaceFile = (relativePath: string): string =>
  fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

describe('mobile PWA dogfood contract', () => {
  it('pre-lifts the mobile composer before touch and pointer focus paths', () => {
    const roomInput = readWorkspaceFile('src/app/features/room/RoomInput.tsx');

    expect(roomInput).toContain('const handleMobilePreLift = useCallback(() => {');
    expect(roomInput).toContain('onPointerDownCapture={handleMobilePreLift}');
    expect(roomInput).toContain('onTouchStartCapture={handleMobilePreLift}');
    expect(roomInput).toContain('onMouseDown={handleMobilePreLift}');
  });

  it('clears the composer before awaiting the immediate send path', () => {
    const roomInput = readWorkspaceFile('src/app/features/room/RoomInput.tsx');

    const resetIndex = roomInput.indexOf(
      'resetInput(sentReplyDraftSnapshot, sentImagePacksSnapshot);'
    );
    const sendIndex = roomInput.indexOf('const res = await sendImmediateMessage({');

    expect(resetIndex).toBeGreaterThan(-1);
    expect(sendIndex).toBeGreaterThan(-1);
    expect(resetIndex).toBeLessThan(sendIndex);
    expect(roomInput).toContain('const sentMsgDraftSnapshot = structuredClone(editor.children);');
    expect(roomInput).toContain('const restoreFailedImmediateSendContext = (');
    expect(roomInput).toContain('restoreFailedImmediateSendContext(');
    expect(roomInput).toContain('if (!isMountedRef.current) return;');
    expect(roomInput).toContain('setMsgDraft([]);');
    expect(roomInput).not.toContain('Transforms.insertFragment(editor, restoredMsgDraft);');
    expect(roomInput).toContain(
      'const currentReplyDraftSnapshot = serializeReplyDraft(latestReplyDraftRef.current);'
    );
    expect(roomInput).toContain(
      'currentReplyDraftSnapshot === serializeReplyDraft(replyDraftBase) ||'
    );
    expect(roomInput).toContain('currentReplyDraftSnapshot === sentReplyDraftSnapshot');
    expect(roomInput).toContain('const restoredSilentReplyRef = useRef<boolean | null>(null);');
    expect(roomInput).toContain('const sentSilentReplySnapshot = silentReply;');
    expect(roomInput).toContain('const txnId = mx.makeTxnId();');
    expect(roomInput).toContain('const pendingImmediateEvent = room.getEventForTxnId(txnId);');
    expect(roomInput).toContain('pendingImmediateEventStatus !== EventStatus.NOT_SENT');
    expect(roomInput).toContain(
      'restoredSilentReplyRef.current = restoredReplyDraft ? sentSilentReplySnapshot : null;'
    );
  });

  it('closes the mobile keyboard before opening composer overlays', () => {
    const roomInput = readWorkspaceFile('src/app/features/room/RoomInput.tsx');

    expect(roomInput).toContain('const openComposerOverlay = useCallback(');
    expect(roomInput).toContain('await closeKeyboardBeforeOpeningOverlay();');
    expect(roomInput).toContain('const openAddMenu = useCallback(');
    expect(roomInput).toContain('const openLocationPicker = useCallback(async () => {');
    expect(roomInput).toContain('const openPollCreator = useCallback(async () => {');
    expect(roomInput).toContain('const openSchedulePicker = useCallback(async () => {');
    expect(roomInput).toContain('const openEmojiBoard = useCallback(');
  });

  it('keeps members and widgets reachable from the mobile room menu', () => {
    const roomHeader = readWorkspaceFile('src/app/features/room/RoomViewHeader.tsx');

    expect(roomHeader).toContain(
      'const showMobileMembersAction = screenSize !== ScreenSize.Desktop;'
    );
    expect(roomHeader).toContain('const showMobileWidgetsAction =');
    expect(roomHeader).toContain(
      'openSettings(room.roomId, parentSpace?.roomId, RoomSettingsPage.MembersPage);'
    );
    expect(roomHeader).toContain('setWidgetDrawer(true);');
    expect(roomHeader).toContain('Members\n            </Text>');
    expect(roomHeader).toContain('Widgets\n            </Text>');
  });

  it('renders the widgets drawer as an overlay on non-desktop layouts', () => {
    const room = readWorkspaceFile('src/app/features/room/Room.tsx');

    expect(room).toContain(
      'const showMobileWidgetsDrawer = screenSize !== ScreenSize.Desktop && isWidgetDrawerOpen;'
    );
    expect(room).toContain('key={`widgets-mobile-${room.roomId}`}');
    expect(room).toContain("position: 'absolute'");
    expect(room).toContain('inset: 0');
    expect(room).toContain('zIndex: 20');
  });

  it('uses full-screen mobile presentation for room settings and member profile surfaces', () => {
    const page = readWorkspaceFile('src/app/components/page/Page.tsx');
    const roomSettingsRenderer = readWorkspaceFile(
      'src/app/features/room-settings/RoomSettingsRenderer.tsx'
    );
    const roomSettings = readWorkspaceFile('src/app/features/room-settings/RoomSettings.tsx');
    const spaceSettingsRenderer = readWorkspaceFile(
      'src/app/features/space-settings/SpaceSettingsRenderer.tsx'
    );
    const spaceSettings = readWorkspaceFile('src/app/features/space-settings/SpaceSettings.tsx');
    const userRoomProfileRenderer = readWorkspaceFile(
      'src/app/components/UserRoomProfileRenderer.tsx'
    );

    expect(roomSettingsRenderer).toContain(
      '<Modal500 requestClose={closeSettings} fullScreenOnMobile>'
    );
    expect(spaceSettingsRenderer).toContain(
      '<Modal500 requestClose={closeSettings} fullScreenOnMobile>'
    );
    expect(roomSettings).toContain(
      'const isPhoneLayout = screenSize === ScreenSize.Mobile || mobileOrTabletLayout();'
    );
    expect(roomSettings).toContain(
      'return isPhoneLayout ? undefined : RoomSettingsPage.GeneralPage;'
    );
    expect(spaceSettings).toContain(
      'const isPhoneLayout = screenSize === ScreenSize.Mobile || mobileOrTabletLayout();'
    );
    expect(spaceSettings).toContain(
      'return isPhoneLayout ? undefined : SpaceSettingsPage.GeneralPage;'
    );
    expect(page).toContain(
      'const isMobile = screenSize === ScreenSize.Mobile || mobileOrTabletLayout();'
    );
    expect(userRoomProfileRenderer).toContain(
      'const isMobile = screenSize === ScreenSize.Mobile || mobileOrTabletLayout();'
    );
    expect(userRoomProfileRenderer).toContain('<Modal500 requestClose={close} fullScreenOnMobile>');
    expect(userRoomProfileRenderer).toContain('Member Profile');
  });

  it('keeps pull-to-refresh from firing before the full threshold is reached', () => {
    const pullToRefresh = readWorkspaceFile('src/app/hooks/usePullToRefresh.ts');

    expect(pullToRefresh).toContain('if (dist >= PULL_THRESHOLD) {');
    expect(pullToRefresh).not.toContain('if (dist >= PULL_THRESHOLD / 2) {');
  });

  it('drops the room footer safe-area inset while the mobile keyboard is visible', () => {
    const roomView = readWorkspaceFile('src/app/features/room/RoomView.tsx');

    expect(roomView).toContain(
      "paddingBottom: 'var(--sable-safe-bottom, var(--sable-safe-area-bottom, 0px))'"
    );
  });

  it('keeps the mobile space list from dragging into blank space during swipe navigation', () => {
    const space = readWorkspaceFile('src/app/pages/client/space/Space.tsx');
    const swipeableOverlayWrapper = readWorkspaceFile(
      'src/app/components/SwipeableOverlayWrapper.tsx'
    );

    expect(space).toContain('showDragPreview={false}');
    expect(swipeableOverlayWrapper).toContain('showDragPreview?: boolean;');
    expect(swipeableOverlayWrapper).toContain('showDragPreview = true');
    expect(swipeableOverlayWrapper).toContain('if (!showDragPreview) return;');
  });
});
