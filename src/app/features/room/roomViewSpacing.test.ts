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

  it('adds mobile-only right gutter; desktop uses no extra padding regardless of drawer state', () => {
    const roomTimeline = readWorkspaceFile('src/app/features/room/RoomTimeline.tsx');

    expect(roomTimeline).toContain('const timelineRightSpacing = isMobileScreen');
    expect(roomTimeline).toContain('? config.space.S100');
    expect(roomTimeline).toContain(': config.space.S0;');
    expect(roomTimeline).toContain('paddingRight: timelineRightSpacing');
  });

  it('lets message spacing zero collapse vertical padding on message rows', () => {
    const messageLayout = readWorkspaceFile('src/app/components/message/layout/layout.css.ts');
    const baseLayout = readWorkspaceFile('src/app/components/message/layout/Base.tsx');
    const message = readWorkspaceFile('src/app/features/room/message/Message.tsx');

    expect(messageLayout).toContain('marginTop: SpacingVar');
    expect(messageLayout).toContain('contentSpacing: ContentSpacingVariant');
    expect(messageLayout).toContain('[ContentSpacingVar]: config.space.S0');
    expect(messageLayout).toContain('paddingTop: `var(${ContentSpacingVar}, ${config.space.S100})`');
    expect(messageLayout).toContain(
      'paddingBottom: `var(${ContentSpacingVar}, ${config.space.S100})`'
    );
    expect(messageLayout).toContain('paddingRight: config.space.S200');
    expect(messageLayout).toContain('paddingLeft: config.space.S400');
    expect(baseLayout).toContain('contentSpacing,');
    expect(message).toContain('contentSpacing={messageSpacing}');
  });

  it('keeps message layout aligned with the current Sable contract', () => {
    const baseLayout = readWorkspaceFile('src/app/components/message/layout/Base.tsx');
    const messageLayout = readWorkspaceFile('src/app/components/message/layout/layout.css.ts');

    expect(baseLayout).not.toContain('<Text');
    expect(baseLayout).not.toContain('size="T400"');
    expect(baseLayout).not.toContain("priority={notice ? '300' : '400'}");
    expect(messageLayout).toContain("width: '100%'");
    expect(messageLayout).toContain("alignSelf: 'stretch'");
    expect(messageLayout).toContain('width: toRem(36)');
    expect(messageLayout).toContain('flexBasis: toRem(36)');
    expect(messageLayout).not.toContain('DefaultReset,\n    {');
    expect(messageLayout).not.toContain('export const ModernRow = style({');
    expect(messageLayout).not.toContain('export const ModernContent = style({');
    expect(messageLayout).not.toContain('export const BubbleRow = style({');
    expect(messageLayout).not.toContain('export const BubbleMain = style({');
  });
});
