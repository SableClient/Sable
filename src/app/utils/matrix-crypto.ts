import type { CryptoApi } from '$types/matrix-sdk';

export const verifiedDevice = async (
  api: CryptoApi,
  userId: string,
  deviceId: string
): Promise<boolean | null> => {
  const status = await api.getDeviceVerificationStatus(userId, deviceId);

  if (!status) return null;

  const verified = status.crossSigningVerified;
  return verified;
};
