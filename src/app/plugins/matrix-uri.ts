import { registerCustomProtocol } from "linkifyjs";
import type { MatrixToRoom, MatrixToRoomEvent } from "./matrix-to";

/**
 * Parser for the `matrix:` URI scheme
 *   matrix:[//{authority}/]{type}/{id-without-sigil}[/{type}/{id}...][?{query}][#{fragment}]
 */

const SIGIL_BY_TYPE: Record<string, string> = {
  u: "@",
  user: "@",
  r: "#",
  room: "#",
  roomid: "!",
  e: "$",
  event: "$",
};

const isRoomType = (type: string): boolean => type === "r" || type === "room" || type === "roomid";

const isEventType = (type: string): boolean => type === "e" || type === "event";

const isUserType = (type: string): boolean => type === "u" || type === "user";

export type MatrixUriEntity =
  | { kind: "user"; userId: string }
  | { kind: "room"; room: MatrixToRoom }
  | { kind: "event"; event: MatrixToRoomEvent };

const tryDecodeSegment = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

export const parseMatrixUri = (href: string): MatrixUriEntity | undefined => {
  const trimmed = href.trim();
  if (!/^matrix:/i.test(trimmed)) return undefined;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }

  if (url.protocol !== "matrix:") return undefined;

  const path = url.pathname.replace(/^\/+/, "");
  if (!path) return undefined;

  const rawSegments = path.split("/");
  if (rawSegments.length < 2) return undefined;

  const type1 = rawSegments[0]!.toLowerCase();
  const id1 = tryDecodeSegment(rawSegments[1]!);
  const sigil1 = SIGIL_BY_TYPE[type1];
  if (!sigil1 || !id1) return undefined;

  const viaServers = url.searchParams.getAll("via");
  const via = viaServers.length > 0 ? viaServers : undefined;

  if (isUserType(type1)) {
    if (rawSegments.length > 2) return undefined;
    return { kind: "user", userId: `${sigil1}${id1}` };
  }

  if (!isRoomType(type1)) return undefined;

  const roomIdOrAlias = `${sigil1}${id1}`;

  if (rawSegments.length >= 4) {
    const type2 = rawSegments[2]!.toLowerCase();
    const id2 = tryDecodeSegment(rawSegments[3]!);
    if (!isEventType(type2) || !id2) return undefined;
    return {
      kind: "event",
      event: { roomIdOrAlias, eventId: `$${id2}`, viaServers: via },
    };
  }

  if (rawSegments.length !== 2) return undefined;

  return { kind: "room", room: { roomIdOrAlias, viaServers: via } };
};

export const testMatrixUri = (href: string): boolean => parseMatrixUri(href) !== undefined;

let matrixProtocolRegistered = false;

export const registerMatrixUriProtocol = (): void => {
  if (matrixProtocolRegistered) return;
  try {
    registerCustomProtocol("matrix");
    matrixProtocolRegistered = true;
  } catch {
    matrixProtocolRegistered = true;
  }
};
