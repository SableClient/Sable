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
});
