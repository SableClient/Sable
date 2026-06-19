import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatrixClient, MatrixEvent } from '$types/matrix-sdk';
import { ClientEvent } from '$types/matrix-sdk';
import { useSetting } from '$state/hooks/settings';
import {
  settingsAtom,
  type NotificationDeviceScope as NotificationDeviceScopeSetting,
} from '$state/settings';
import { CustomAccountDataEvent } from '$types/matrix/accountData';

const NOTIFICATION_DEVICE_LEASE_EVENT_TYPE =
  CustomAccountDataEvent.SableNotificationDeviceLease as never;
const LOCAL_LEASE_UPDATE_EVENT = 'sable:notification-device-lease-update';

export type NotificationDeviceLease = {
  deviceId: string;
  updatedAt: number;
  expiresAt: number;
};

export type NotificationDeviceScopeState = {
  deviceId?: string;
  lease: NotificationDeviceLease | null;
  leaseFresh: boolean;
  leaseHolderDeviceId?: string;
  notificationDeviceScope: NotificationDeviceScopeSetting;
  isVisible: boolean;
  isWindowFocused: boolean;
  isActiveNotificationClient: boolean;
  isThisClientLeaseHolder: boolean;
  shouldKeepWebPushEnabled: boolean;
  activeReason:
    | 'all_clients'
    | 'missing_device_id'
    | 'no_fresh_lease'
    | 'lease_holder'
    | 'lease_held_elsewhere';
};

export function shouldEnableNotificationPusher(
  isVisible: boolean,
  isMobile: boolean,
  notificationDeviceScope: NotificationDeviceScopeSetting,
  isActiveNotificationClient: boolean
): boolean {
  return isVisible
    ? isMobile || (notificationDeviceScope === 'active_client_only' && isActiveNotificationClient)
    : notificationDeviceScope !== 'active_client_only' || isActiveNotificationClient;
}

type UseNotificationDeviceScopeOptions = {
  publishLease?: boolean;
};

const LEASE_DURATION_MS = 2 * 60_000;
const LEASE_RENEW_MS = 30_000;
const LEASE_CLOCK_TICK_MS = 15_000;

const readLeaseContent = (mx: MatrixClient | undefined): NotificationDeviceLease | null => {
  if (!mx || typeof mx.getAccountData !== 'function') return null;
  const content = mx.getAccountData(NOTIFICATION_DEVICE_LEASE_EVENT_TYPE)?.getContent();
  if (!content || typeof content !== 'object') return null;

  const deviceId = typeof content.deviceId === 'string' ? content.deviceId.trim() : '';
  const updatedAt = typeof content.updatedAt === 'number' ? content.updatedAt : NaN;
  const expiresAt = typeof content.expiresAt === 'number' ? content.expiresAt : NaN;
  if (!deviceId || Number.isNaN(updatedAt) || Number.isNaN(expiresAt)) return null;

  return { deviceId, updatedAt, expiresAt };
};

const isLeaseFresh = (lease: NotificationDeviceLease | null, now: number): boolean =>
  !!lease && lease.expiresAt > now;

const broadcastLocalLeaseUpdate = (lease: NotificationDeviceLease | null): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<NotificationDeviceLease | null>(LOCAL_LEASE_UPDATE_EVENT, {
      detail: lease,
    })
  );
};

export function useNotificationDeviceScope(
  mx: MatrixClient | undefined,
  options?: UseNotificationDeviceScopeOptions
): NotificationDeviceScopeState {
  const shouldPublishLease = options?.publishLease ?? true;
  const [notificationDeviceScope] = useSetting(settingsAtom, 'notificationDeviceScope');
  const [lease, setLease] = useState<NotificationDeviceLease | null>(() => readLeaseContent(mx));
  const [isWindowFocused, setIsWindowFocused] = useState<boolean>(() =>
    typeof document === 'undefined' ? false : document.hasFocus()
  );
  const [now, setNow] = useState<number>(() => Date.now());

  const leaseRef = useRef(lease);
  leaseRef.current = lease;

  const deviceId =
    mx && typeof mx.getDeviceId === 'function' ? (mx.getDeviceId() ?? undefined) : undefined;
  const scopeEnabled = notificationDeviceScope === 'active_client_only' && !!deviceId;
  const isVisible = typeof document !== 'undefined' && document.visibilityState === 'visible';
  const shouldHoldLease = scopeEnabled && isVisible && isWindowFocused;
  const freshLease = isLeaseFresh(lease, now);
  const isThisClientLeaseHolder = !!deviceId && freshLease && lease?.deviceId === deviceId;
  const isActiveNotificationClient = !scopeEnabled || !freshLease || isThisClientLeaseHolder;
  const shouldKeepWebPushEnabled = scopeEnabled && isActiveNotificationClient;
  const activeReason: NotificationDeviceScopeState['activeReason'] = !scopeEnabled
    ? deviceId
      ? 'all_clients'
      : 'missing_device_id'
    : !freshLease
      ? 'no_fresh_lease'
      : isThisClientLeaseHolder
        ? 'lease_holder'
        : 'lease_held_elsewhere';

  useEffect(() => {
    setLease(readLeaseContent(mx));
  }, [mx]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), LEASE_CLOCK_TICK_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      setIsWindowFocused(true);
      setNow(Date.now());
    };
    const handleBlur = () => {
      setIsWindowFocused(false);
      setNow(Date.now());
    };
    const handleVisibilityChange = () => setNow(Date.now());

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (
      !shouldPublishLease ||
      !mx ||
      !scopeEnabled ||
      !deviceId ||
      typeof mx.setAccountData !== 'function'
    ) {
      return undefined;
    }
    if (!shouldHoldLease) return undefined;

    let cancelled = false;

    const publishLeaseUpdate = () => {
      const nextNow = Date.now();
      setNow(nextNow);
      const currentLease = leaseRef.current;
      if (
        currentLease?.deviceId === deviceId &&
        currentLease.expiresAt - nextNow > LEASE_RENEW_MS / 2
      ) {
        return;
      }

      const nextLease: NotificationDeviceLease = {
        deviceId,
        updatedAt: nextNow,
        expiresAt: nextNow + LEASE_DURATION_MS,
      };
      setLease(nextLease);
      broadcastLocalLeaseUpdate(nextLease);
      mx.setAccountData(NOTIFICATION_DEVICE_LEASE_EVENT_TYPE, nextLease as never).catch(() => {
        if (!cancelled) {
          setLease(currentLease ?? null);
          broadcastLocalLeaseUpdate(currentLease ?? null);
        }
      });
    };

    publishLeaseUpdate();
    const intervalId = window.setInterval(publishLeaseUpdate, LEASE_RENEW_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [mx, deviceId, shouldPublishLease, scopeEnabled, shouldHoldLease]);

  useEffect(() => {
    const handleLocalLeaseUpdate = (event: Event) => {
      const detail = (event as CustomEvent<NotificationDeviceLease | null>).detail;
      setLease(detail ?? null);
      setNow(Date.now());
    };

    window.addEventListener(LOCAL_LEASE_UPDATE_EVENT, handleLocalLeaseUpdate as EventListener);

    return () => {
      window.removeEventListener(LOCAL_LEASE_UPDATE_EVENT, handleLocalLeaseUpdate as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!mx || typeof mx.on !== 'function' || typeof mx.removeListener !== 'function') {
      return undefined;
    }

    const handleAccountData = (event: MatrixEvent) => {
      if (event.getType() !== (CustomAccountDataEvent.SableNotificationDeviceLease as string)) {
        return;
      }
      setLease(readLeaseContent(mx));
      setNow(Date.now());
    };

    mx.on(ClientEvent.AccountData, handleAccountData);
    return () => {
      mx.removeListener(ClientEvent.AccountData, handleAccountData);
    };
  }, [mx]);

  return useMemo(
    () => ({
      deviceId,
      lease,
      leaseFresh: freshLease,
      leaseHolderDeviceId: lease?.deviceId,
      notificationDeviceScope,
      isVisible,
      isWindowFocused,
      isActiveNotificationClient,
      isThisClientLeaseHolder,
      shouldKeepWebPushEnabled,
      activeReason,
    }),
    [
      activeReason,
      deviceId,
      freshLease,
      lease,
      isVisible,
      isWindowFocused,
      notificationDeviceScope,
      isActiveNotificationClient,
      isThisClientLeaseHolder,
      shouldKeepWebPushEnabled,
    ]
  );
}
