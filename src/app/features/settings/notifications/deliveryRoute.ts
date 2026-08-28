const GOOGLE_PUSH_HOST = 'fcm.googleapis.com';
const MOZILLA_PUSH_HOST = 'updates.push.services.mozilla.com';

export type DeliveryRoute = {
  /** The homeserver itself, or the gateway that packages the push. */
  packagedBy: string;
  deliveredVia: string;
  /** Hosts outside the homeserver's own domain. */
  external: string[];
  encrypted: boolean;
};

const hostOf = (url: string | undefined): string | undefined => {
  if (!url?.trim()) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
};

const labelHost = (host: string): string => {
  if (host === GOOGLE_PUSH_HOST) return 'Google';
  if (host === MOZILLA_PUSH_HOST) return 'Mozilla';
  return host;
};

export type DeliveryRouteInput = {
  homeserverUrl?: string;
  serverSendsWebPush: boolean;
  gatewayUrl?: string;
  endpoint?: string;
  /** The in-app websocket holds the connection rather than another app. */
  embedded?: boolean;
};

export function describeDeliveryRoute(input: DeliveryRouteInput): DeliveryRoute {
  const ownHost = hostOf(input.homeserverUrl);
  const gatewayHost = hostOf(input.gatewayUrl);
  const endpointHost = hostOf(input.endpoint);

  const packagedBy = input.serverSendsWebPush
    ? 'Your homeserver'
    : (gatewayHost && labelHost(gatewayHost)) || 'A push gateway';

  let deliveredVia = endpointHost ? labelHost(endpointHost) : 'Unknown';
  if (input.embedded && endpointHost) deliveredVia = `${endpointHost} (this app)`;

  const external = [input.serverSendsWebPush ? undefined : gatewayHost, endpointHost]
    .filter((host): host is string => Boolean(host))
    .filter((host) => host !== ownHost)
    .filter((host, index, all) => all.indexOf(host) === index);

  return { packagedBy, deliveredVia, external, encrypted: input.serverSendsWebPush };
}

export function deliveryRouteSummary(route: DeliveryRoute): string {
  return `${route.packagedBy} → ${route.deliveredVia}`;
}

export function deliveryRouteDetail(route: DeliveryRoute): string {
  if (route.external.length === 0) {
    return 'Every hop runs on your own infrastructure.';
  }
  const who = route.external.join(', ');
  return route.encrypted
    ? `${who} relays it but cannot read it: your homeserver encrypts the push for this device.`
    : `${who} handles the notification and can read what it contains.`;
}
