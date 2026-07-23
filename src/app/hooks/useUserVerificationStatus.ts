import { useCallback, useEffect, useState } from 'react';
import type { Room } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useDeviceListChange } from '$hooks/useDeviceList';
import { useRoomEncryptionStatus } from '$hooks/useRoomEncryptionStatus';

/**
 * Verification status of a user.
 */
export type UserVerification = 'verified' | 'warning' | 'normal' | 'unknown';

/**
 * Hook to check if a user is verified (cross-signing verified + all devices verified).
 * Returns 'verified' if the user is fully verified, 'warning' if previously verified
 * but not anymore, 'normal' if not verified, or 'unknown' if encryption is not enabled.
 */
export function useUserVerificationStatus(
  userId: string,
  room: Room | undefined
): UserVerification {
  const mx = useMatrixClient();
  let encryptionStatus = undefined;
  if (room !== undefined) {
    encryptionStatus = useRoomEncryptionStatus(room);
  }
  const [status, setStatus] = useState<UserVerification>('unknown');
  const isMe = userId === mx.getUserId();

  const updateStatus = useCallback(async () => {
    if (room !== undefined && encryptionStatus !== 'encrypted') {
      setStatus('unknown');
      return;
    }
    const crypto = mx.getCrypto();
    if (!crypto) {
      setStatus('unknown');
      return;
    }

    try {
      const userTrust = await crypto.getUserVerificationStatus(userId);

      // If user was verified before but not anymore → warning
      if (userTrust.wasCrossSigningVerified() && !userTrust.isCrossSigningVerified()) {
        setStatus('warning');
        return;
      }

      // Not cross-signing verified → normal
      if (!userTrust.isCrossSigningVerified()) {
        setStatus('normal');
        return;
      }

      // User is cross-signing verified, check all their devices
      const devices = await crypto.getUserDeviceInfo([userId]);
      const userDevices = devices.get(userId);
      if (!userDevices || userDevices.size === 0) {
        // No device info → normal (we trust the user identity)
        setStatus('verified');
        return;
      }

      for (const deviceId of userDevices.keys()) {
        const deviceStatus = await crypto.getDeviceVerificationStatus(userId, deviceId);
        // For our own devices, use stricter crossSigningVerified check
        if (
          deviceStatus &&
          (isMe
            ? !deviceStatus.crossSigningVerified
            : !deviceStatus.isVerified())
        ) {
          setStatus('warning');
          return;
        }
      }

      setStatus('verified');
    } catch {
      setStatus('normal');
    }
  }, [room, mx, encryptionStatus, userId, isMe]);

  useEffect(() => {
    updateStatus();
  }, [updateStatus]);

  // Re-check when device list changes
  useDeviceListChange(
    useCallback(
      (userIds) => {
        if (userIds.includes(userId)) {
          updateStatus();
        }
      },
      [userId, updateStatus]
    )
  );

  return status;
}
