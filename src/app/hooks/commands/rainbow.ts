import { MsgType } from '$types/matrix-sdk';
import type { CommandContext, CommandRecord } from './types';
import { Command } from './types';

const hslToHex = (h: number, s: number, l: number): string => {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

const getAllTextNodes = (root: Node): Node[] =>
  root.nodeType === Node.TEXT_NODE
    ? [root]
    : Array.from(root.childNodes).reduce<Node[]>(
        (acc, child) => acc.concat(getAllTextNodes(child)),
        []
      );

const rainbowify = (htmlInput: string): string => {
  const div = document.createElement('div');
  div.innerHTML = htmlInput;
  const textNodes = getAllTextNodes(div);
  const totalTextLen = textNodes.reduce((acc, node) => {
    const text = node.textContent || '';
    const cleanLen = Array.from(text).filter((c) => c.trim().length > 0).length;
    return acc + cleanLen;
  }, 0);

  textNodes.reduce((currentGlobalIdx, node) => {
    const text = node.textContent || '';
    if (!text.trim()) return currentGlobalIdx;

    const chars = Array.from(text);

    const { html: newHtml, count: charsProcessed } = chars.reduce(
      (acc, char) => {
        if (char.trim().length === 0) {
          return { html: acc.html + char, count: acc.count };
        }
        const hue = ((currentGlobalIdx + acc.count) / totalTextLen) * (5 / 6);
        const color = hslToHex(hue, 1.0, 0.5);
        const coloredChar = `<span data-mx-color="${color}">${char}</span>`;
        return { html: acc.html + coloredChar, count: acc.count + 1 };
      },
      { html: '', count: 0 }
    );

    const span = document.createElement('span');
    span.innerHTML = newHtml;
    node.parentNode?.replaceChild(span, node);
    return currentGlobalIdx + charsProcessed;
  }, 0);

  return div.innerHTML;
};

export const createRainbowCommands = (ctx: CommandContext): Partial<CommandRecord> => {
  const { mx, room } = ctx;
  return {
    [Command.Rainbow]: {
      name: Command.Rainbow,
      description: 'Send rainbow text.',
      exe: async (payload, html) => {
        if (!payload || payload.trim().length === 0) return;
        const inputHtml = html || payload;
        const rainbowHtml = rainbowify(inputHtml);
        await mx.sendMessage(room.roomId, {
          msgtype: MsgType.Text,
          body: payload,
          format: 'org.matrix.custom.html',
          formatted_body: rainbowHtml,
        });
      },
    },
    [Command.RainbowMe]: {
      name: Command.RainbowMe,
      description: 'Send a rainbow action message.',
      exe: async (payload, html) => {
        if (!payload || payload.trim().length === 0) return;
        const inputHtml = html || payload;
        const rainbowHtml = rainbowify(inputHtml);
        await mx.sendMessage(room.roomId, {
          msgtype: MsgType.Emote,
          body: payload,
          format: 'org.matrix.custom.html',
          formatted_body: rainbowHtml,
        });
      },
    },
  };
};
