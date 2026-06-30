import { useCallback, useEffect, useState } from 'react';
import type { Room } from '$types/matrix-sdk';
import { RoomStateEvent } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useDeviceListChange } from '$hooks/useDeviceList';

/**
 * Determines the encryption status of a room.
 *
 * - 'encrypted': Room has an m.room.encryption state event and crypto is enabled.
 * - 'unencrypted': Room does not have encryption enabled.
 * - 'loading': Encryption status is being checked.
 * - 'unknown': Crypto is not available or room is undefined.
 */
export enum RoomEncryptionStatus {
  Unknown = 'unknown',
  Loading = 'loading',
  Encrypted = 'encrypted',
  Unencrypted = 'unencrypted',
}

/**
 * Hook to check if a room is encrypted.
 * Uses the MatrixClient's deprecated isRoomEncrypted() for sync check,
 * and falls back to CryptoApi.isEncryptionEnabledInRoom() for async verification.
 */
export function useRoomEncryptionStatus(room: Room | undefined): RoomEncryptionStatus {
  const mx = useMatrixClient();
  const [status, setStatus] = useState<RoomEncryptionStatus>(() => {
    if (!room) return RoomEncryptionStatus.Unknown;
    // Quick sync check
    return mx.isRoomEncrypted(room.roomId)
      ? RoomEncryptionStatus.Encrypted
      : RoomEncryptionStatus.Unencrypted;
  });

  const updateStatus = useCallback(async () => {
    if (!room) {
      setStatus(RoomEncryptionStatus.Unknown);
      return;
    }
    const crypto = mx.getCrypto();
    if (!crypto) {
      setStatus(RoomEncryptionStatus.Unknown);
      return;
    }
    try {
      const isEncrypted = await crypto.isEncryptionEnabledInRoom(room.roomId);
      setStatus(isEncrypted ? RoomEncryptionStatus.Encrypted : RoomEncryptionStatus.Unencrypted);
    } catch {
      // Fallback to sync check
      setStatus(mx.isRoomEncrypted(room.roomId) ? RoomEncryptionStatus.Encrypted : RoomEncryptionStatus.Unencrypted);
    }
  }, [room, mx]);

  useEffect(() => {
    updateStatus();
  }, [updateStatus, room]);

  // Re-check when room state events change (e.g., encryption state change event)
  useEffect(() => {
    if (!room) return;
    const onStateChange = () => updateStatus();
    room.on(RoomStateEvent.Events, onStateChange);
    return () => {
      room.removeListener(RoomStateEvent.Events, onStateChange);
    };
  }, [room, updateStatus]);

  return status;
}
