import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.resolve(__dirname, '../../../..');

const readWorkspaceFile = (relativePath: string): string =>
  fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

describe('emoji sidebar sticky contract', () => {
  it('uses a reachable sticky bottom anchor for the emoji group stack', () => {
    const emojiBoard = readWorkspaceFile('src/app/components/emoji-board/EmojiBoard.tsx');

    expect(emojiBoard).toContain("position: 'sticky'");
    expect(emojiBoard).toContain('bottom: 0');
    expect(emojiBoard).not.toContain("bottom: '-67%'");
  });
});
