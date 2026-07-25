import { useCallback, useEffect, useState } from 'react';
import type { Room } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useDeviceListChange } from '$hooks/useDeviceList';
import { useRoomEncryptionStatus } from '$hooks/useRoomEncryptionStatus';

/**
 * Hook to check for unverified users in a room.
 * Returns the count of unverified members (excluding the current user).
 * Only checks users whose cross-signing identity is verified.
 */
export function useRoomUnverifiedMembers(room: Room | undefined): number {
  const mx = useMatrixClient();
  const encryptionStatus = useRoomEncryptionStatus(room);
  const [unverifiedCount, setUnverifiedCount] = useState<number>(0);
  const alive = useCallback(() => true, []); // placeholder, useAlive if needed

  const updateUnverifiedCount = useCallback(async () => {
    if (!room || encryptionStatus !== 'encrypted') {
      setUnverifiedCount(0);
      return;
    }
    const crypto = mx.getCrypto();
    if (!crypto) {
      setUnverifiedCount(0);
      return;
    }

    try {
      const members = await room.getEncryptionTargetMembers();
      const currentUserId = mx.getUserId()!;
      let count = 0;

      for (const member of members) {
        if (member.userId === currentUserId) continue;

        // Check if user's cross-signing is verified
        const userTrust = await crypto.getUserVerificationStatus(member.userId);
        if (!userTrust.isCrossSigningVerified()) {
          count++;
          continue;
        }

        // Check if all user's devices are verified
        const devices = await crypto.getUserDeviceInfo([member.userId]);
        const userDevices = devices.get(member.userId);
        if (!userDevices) continue;

        for (const deviceId of userDevices.keys()) {
          const deviceStatus = await crypto.getDeviceVerificationStatus(member.userId, deviceId);
          if (deviceStatus && !deviceStatus.isVerified()) {
            count++;
            break;
          }
        }
      }

      setUnverifiedCount(count);
    } catch {
      setUnverifiedCount(0);
    }
  }, [room, mx, encryptionStatus]);

  useEffect(() => {
    updateUnverifiedCount();
  }, [updateUnverifiedCount]);

  // Re-check when device list changes
  useDeviceListChange(
    useCallback(
      (userIds) => {
        if (!room) return;
        room.getEncryptionTargetMembers().then((members) => {
          const memberIds = members.map((m) => m.userId);
          const overlapping = memberIds.some((id) => userIds.includes(id));
          if (overlapping) updateUnverifiedCount();
        });
      },
      [room, updateUnverifiedCount]
    )
  );

  return unverifiedCount;
}
