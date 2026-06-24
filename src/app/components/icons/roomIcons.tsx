import { JoinRule, RoomType } from '$types/matrix-sdk';
import type { ComponentType } from 'react';
import type { IconProps } from '@phosphor-icons/react';
import { CustomRoomType } from '$types/matrix/room';
import { Chats, Globe, HashStraight, Lock, SpeakerHigh, SquaresFour } from './phosphor';

export type RoomPhosphorIcon = ComponentType<IconProps>;

export type RoomIconOverlay = 'globe' | 'lock';

const isRegularRoom = (roomType?: string): boolean =>
  roomType !== RoomType.Space && roomType !== RoomType.UnstableCall;

export function getRoomIconOverlay(
  roomType?: string,
  joinRule?: JoinRule
): RoomIconOverlay | undefined {
  if (!isRegularRoom(roomType)) return undefined;

  if (joinRule === JoinRule.Public) return 'globe';
  if (
    joinRule === JoinRule.Invite ||
    joinRule === JoinRule.Knock ||
    joinRule === JoinRule.Private
  ) {
    return 'lock';
  }
  return undefined;
}

export function getRoomIconOverlayComponent(overlay: RoomIconOverlay): RoomPhosphorIcon {
  return overlay === 'globe' ? Globe : Lock;
}

export function getRoomStandaloneIconComponent(
  roomType?: string,
  joinRule?: JoinRule
): RoomPhosphorIcon {
  if (roomType === RoomType.Space) {
    if (joinRule === JoinRule.Public) return Globe;
    if (
      joinRule === JoinRule.Invite ||
      joinRule === JoinRule.Knock ||
      joinRule === JoinRule.Private
    ) {
      return Lock;
    }
    return SquaresFour;
  }

  if (roomType === RoomType.UnstableCall) {
    if (joinRule === JoinRule.Public) return Globe;
    if (
      joinRule === JoinRule.Invite ||
      joinRule === JoinRule.Knock ||
      joinRule === JoinRule.Private
    ) {
      return Lock;
    }
    return SpeakerHigh;
  }

  if (roomType === CustomRoomType.Forum) {
    if (
      joinRule === JoinRule.Invite ||
      joinRule === JoinRule.Knock ||
      joinRule === JoinRule.Private
    ) {
      return Lock;
    }
    return Chats;
  }

  if (joinRule === JoinRule.Public) return Globe;
  if (
    joinRule === JoinRule.Invite ||
    joinRule === JoinRule.Knock ||
    joinRule === JoinRule.Private
  ) {
    return Lock;
  }
  return HashStraight;
}

export function getRoomIconComponent(roomType?: string, joinRule?: JoinRule): RoomPhosphorIcon {
  if (roomType === RoomType.Space) {
    if (joinRule === JoinRule.Public) return Globe;
    if (
      joinRule === JoinRule.Invite ||
      joinRule === JoinRule.Knock ||
      joinRule === JoinRule.Private
    ) {
      return Lock;
    }
    return SquaresFour;
  }

  if (roomType === RoomType.UnstableCall) {
    if (joinRule === JoinRule.Public) return Globe;
    if (
      joinRule === JoinRule.Invite ||
      joinRule === JoinRule.Knock ||
      joinRule === JoinRule.Private
    ) {
      return Lock;
    }
    return SpeakerHigh;
  }

  if (roomType === CustomRoomType.Forum) {
    if (
      joinRule === JoinRule.Invite ||
      joinRule === JoinRule.Knock ||
      joinRule === JoinRule.Private
    ) {
      return Lock;
    }
    return Chats;
  }

  return HashStraight;
}
