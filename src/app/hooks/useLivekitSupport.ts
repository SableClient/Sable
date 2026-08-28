import { useEffect, useState } from 'react';
import type { AutoDiscoveryInfo } from '../cs-api';
import { useAutoDiscoveryInfo } from './useAutoDiscoveryInfo';
import { useMatrixClient } from './useMatrixClient';
import { isLivekitTransportConfig } from '@sableclient/matrixrtc';
import type { MatrixClient } from '$types/matrix-sdk';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('useLivekitSupport');

type TransportClient = Pick<MatrixClient, '_unstable_getRTCTransports'>;

/** Legacy discovery: the pre-MSC4143 `.well-known` advertisement. */
export const livekitSupport = (autoDiscoveryInfo: AutoDiscoveryInfo): boolean => {
  const rtcFoci = autoDiscoveryInfo['org.matrix.msc4143.rtc_foci'];

  return (
    Array.isArray(rtcFoci) && rtcFoci.some((info) => typeof info.livekit_service_url === 'string')
  );
};

// `/rtc/transports` is a network round trip and every room view asks. One probe
// per client is enough; the answer only changes when the homeserver does.
const probes = new WeakMap<TransportClient, Promise<boolean>>();

export const probeServerLivekitTransport = (mx: TransportClient): Promise<boolean> => {
  const existing = probes.get(mx);
  if (existing) return existing;

  const probe = mx['_unstable_getRTCTransports']()
    .then((transports) => transports.some(isLivekitTransportConfig))
    .catch((error: unknown) => {
      // A homeserver without MSC4143 answers M_NOT_FOUND, which is a legitimate
      // "no transport here" rather than an outage, so it stays at info level.
      debugLog.info('call', 'homeserver advertised no RTC transports', error);
      return false;
    });
  probes.set(mx, probe);
  return probe;
};

export const useLivekitSupport = (): boolean => {
  const mx = useMatrixClient();
  const autoDiscoveryInfo = useAutoDiscoveryInfo();
  const wellKnownSupported = livekitSupport(autoDiscoveryInfo);
  const [serverSupported, setServerSupported] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void probeServerLivekitTransport(mx).then((supported) => {
      if (active) setServerSupported(supported);
    });
    return () => {
      active = false;
    };
  }, [mx]);

  // The server-advertised transport is the MSC4143 answer and `.well-known` is
  // the legacy fallback, so either one is enough. While the probe is in flight
  // we report the legacy answer rather than a premature "unavailable".
  return serverSupported === true || wellKnownSupported;
};
