import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.resolve(__dirname, '../../../..');

const readWorkspaceFile = (relativePath: string): string =>
  fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

describe('room view spacing contract', () => {
  it('passes desktop drawer state down to the room timeline', () => {
    const room = readWorkspaceFile('src/app/features/room/Room.tsx');
    const roomView = readWorkspaceFile('src/app/features/room/RoomView.tsx');

    expect(room).toContain('const hasDesktopRightDrawer =');
    expect(room).toContain('hasDesktopRightDrawer={hasDesktopRightDrawer}');
    expect(roomView).toContain('hasDesktopRightDrawer?: boolean;');
    expect(roomView).toContain('hasDesktopRightDrawer={hasDesktopRightDrawer}');
  });

  it('adds extra timeline breathing room while typing is visible', () => {
    const roomView = readWorkspaceFile('src/app/features/room/RoomView.tsx');
    const roomTimeline = readWorkspaceFile('src/app/features/room/RoomTimeline.tsx');

    expect(roomView).toContain('const hasTypingIndicator = typingMembers.some');
    expect(roomView).toContain('hasTypingIndicator={hasTypingIndicator}');
    expect(roomTimeline).toContain('const timelineBottomSpacing = hasTypingIndicator');
    expect(roomTimeline).toContain('? config.space.S700');
    expect(roomTimeline).toContain(': config.space.S600;');
    expect(roomTimeline).toContain('paddingBottom: timelineBottomSpacing');
  });

  it('restores a desktop right gutter whenever a side drawer is open', () => {
    const roomTimeline = readWorkspaceFile('src/app/features/room/RoomTimeline.tsx');

    expect(roomTimeline).toContain('const timelineRightSpacing = isMobileScreen');
    expect(roomTimeline).toContain('? config.space.S100');
    expect(roomTimeline).toContain('? config.space.S400');
    expect(roomTimeline).toContain(': config.space.S0;');
    expect(roomTimeline).toContain('paddingRight: timelineRightSpacing');
  });

  it('keeps message spacing distinct from the fixed message padding', () => {
    const messageLayout = readWorkspaceFile('src/app/components/message/layout/layout.css.ts');
    const roomTimeline = readWorkspaceFile('src/app/features/room/RoomTimeline.tsx');

    expect(messageLayout).toContain('marginTop: SpacingVar');
    expect(messageLayout).toContain(
      'padding: `${config.space.S100} ${config.space.S200} ${config.space.S100} ${config.space.S400}`'
    );
    expect(messageLayout).not.toContain('DefaultReset,\n    {\n      marginTop: SpacingVar');
    expect(roomTimeline).toContain('key={`${room.roomId}:${messageLayout}:${messageSpacing}`}');
  });

  it('keeps the message body inside a full-width content column', () => {
    const modernLayout = readWorkspaceFile('src/app/components/message/layout/Modern.tsx');
    const bubbleLayout = readWorkspaceFile('src/app/components/message/layout/Bubble.tsx');
    const messageLayout = readWorkspaceFile('src/app/components/message/layout/layout.css.ts');

    expect(modernLayout).toContain('className={css.ModernRow}');
    expect(modernLayout).toContain('className={css.ModernContent}');
    expect(bubbleLayout).toContain('className={css.BubbleRow}');
    expect(bubbleLayout).toContain('className={css.BubbleMain}');
    expect(messageLayout).toContain("width: '100%'");
    expect(messageLayout).toContain('export const ModernContent = style({');
    expect(messageLayout).toContain('export const BubbleMain = style({');
  });
});
