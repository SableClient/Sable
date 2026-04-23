import type { ReactNode } from 'react';
import type { CryptoApi } from '$types/matrix-sdk';
import type { VerificationStatus } from '$hooks/useDeviceVerificationStatus';
import { useDeviceVerificationStatus } from '$hooks/useDeviceVerificationStatus';

type DeviceVerificationStatusProps = {
  crypto?: CryptoApi;
  userId: string;
  deviceId: string;
  children: (verificationStatus: VerificationStatus) => ReactNode;
};

export function DeviceVerificationStatus({
  crypto,
  userId,
  deviceId,
  children,
}: DeviceVerificationStatusProps) {
  const status = useDeviceVerificationStatus(crypto, userId, deviceId);

  return children(status);
}
