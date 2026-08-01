import type { AutoDiscoveryInfo } from '../../cs-api';
import { getLivekitTransports } from '../../cs-api';
import { fetch as appFetch } from '$utils/fetch';
import { trimTrailingSlash } from '$utils/common';
import type {
  IOpenIDToken,
  LivekitTransportConfig,
  MatrixClient,
  Transport,
} from '$types/matrix-sdk';

export type LivekitProvisioningOptions = {
  mx: Pick<MatrixClient, 'getOpenIdToken'>;
  roomId: string;
  slotId: string;
  deviceId: string;
  serviceUrl: string;
  memberId?: string;
  userId?: string;
};

export type LivekitProvisioningResult = {
  url: string;
  jwt: string;
};

/**
 * Membership format for MatrixRTC. It also picks the JWT endpoint below,
 * because the two cannot be chosen independently: `/get_token` grants a LiveKit
 * identity hashed from the sticky membership, `/sfu/get` grants
 * `${userId}:${deviceId}`, and LiveKit binds E2EE keys strictly to the identity
 * the JWT carries. Sticky memberships need delayed events, which this
 * homeserver does not support, so both stay on the legacy side.
 */
export const useStickyMemberships = false;

export const isLivekitTransportConfig = (
  transport: Transport
): transport is LivekitTransportConfig =>
  transport.type === 'livekit' && typeof transport.livekit_service_url === 'string';

const isProvisioningResult = (value: unknown): value is LivekitProvisioningResult =>
  typeof value === 'object' &&
  value !== null &&
  'url' in value &&
  typeof value.url === 'string' &&
  value.url.length > 0 &&
  'jwt' in value &&
  typeof value.jwt === 'string' &&
  value.jwt.length > 0;

export const getPreferredLivekitTransport = async (
  mx: Pick<MatrixClient, '_unstable_getRTCTransports'>,
  discovery?: Pick<AutoDiscoveryInfo, 'org.matrix.msc4143.rtc_foci'>
): Promise<LivekitTransportConfig | undefined> => {
  const transports = await mx['_unstable_getRTCTransports']().catch(() => undefined);
  const livekitTransport = transports?.find(isLivekitTransportConfig);
  if (livekitTransport) return livekitTransport;

  return getLivekitTransports(discovery)[0];
};

type ModernProvisioningRequest = {
  room_id: string;
  slot_id: string;
  openid_token: IOpenIDToken;
  member?: {
    id: string;
    claimed_user_id: string;
    claimed_device_id: string;
  };
};

type LegacyProvisioningRequest = {
  room: string;
  openid_token: IOpenIDToken;
  device_id: string;
};

const requestLivekitToken = async (
  endpoint: string,
  body: ModernProvisioningRequest | LegacyProvisioningRequest
): Promise<LivekitProvisioningResult> => {
  const response = await appFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`LiveKit provisioning request failed with status ${response.status}`);
  }

  const data = (await response.json()) as unknown;

  if (!isProvisioningResult(data)) {
    throw new Error('LiveKit provisioning response was invalid');
  }

  return { url: data.url, jwt: data.jwt };
};

export const provisionLivekitToken = async ({
  mx,
  roomId,
  slotId,
  deviceId,
  serviceUrl,
  memberId,
  userId,
}: LivekitProvisioningOptions): Promise<LivekitProvisioningResult> => {
  let openidToken: IOpenIDToken;
  try {
    openidToken = await mx.getOpenIdToken();
  } catch {
    throw new Error('Unable to obtain an OpenID token for LiveKit provisioning');
  }

  const endpoint = trimTrailingSlash(serviceUrl);

  try {
    if (useStickyMemberships) {
      const modernRequest: ModernProvisioningRequest = {
        room_id: roomId,
        slot_id: slotId,
        openid_token: openidToken,
      };
      if (memberId && userId && deviceId) {
        modernRequest.member = {
          id: memberId,
          claimed_user_id: userId,
          claimed_device_id: deviceId,
        };
      }
      return await requestLivekitToken(`${endpoint}/get_token`, modernRequest);
    }

    const legacyRequest: LegacyProvisioningRequest = {
      room: roomId,
      openid_token: openidToken,
      device_id: deviceId,
    };
    return await requestLivekitToken(`${endpoint}/sfu/get`, legacyRequest);
  } catch {
    throw new Error('LiveKit token provisioning failed');
  }
};
