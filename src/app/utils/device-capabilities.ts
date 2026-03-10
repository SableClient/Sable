/**
 * Device performance tier for adaptive features
 */
export type DevicePerformanceTier = 'low' | 'medium' | 'high';

/**
 * Configuration for background pagination based on device capabilities
 */
export interface BackgroundPaginationConfig {
  enabled: boolean;
  delayMs: number;
  limit: number;
}

/**
 * Adaptive signals from browser APIs for device/network capability detection.
 * Shared by sliding sync and background pagination for consistent behavior.
 */
export type AdaptiveSignals = {
  saveData: boolean;
  effectiveType: string | null;
  deviceMemoryGb: number | null;
  mobile: boolean;
  missingSignals: number;
};

/**
 * Read adaptive signals from browser APIs.
 * Single source of truth for device capability detection across the app.
 */
export function readAdaptiveSignals(): AdaptiveSignals {
  const navigatorLike = typeof navigator !== 'undefined' ? navigator : undefined;
  const connection = (navigatorLike as any)?.connection;
  const effectiveType = connection?.effectiveType;
  const deviceMemory = (navigatorLike as any)?.deviceMemory;
  const uaMobile = (navigatorLike as any)?.userAgentData?.mobile;
  const fallbackMobileUA = navigatorLike?.userAgent ?? '';
  const mobileByUA =
    typeof uaMobile === 'boolean'
      ? uaMobile
      : /Mobi|Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(fallbackMobileUA);
  const saveData = connection?.saveData === true;
  const normalizedEffectiveType = typeof effectiveType === 'string' ? effectiveType : null;
  const normalizedDeviceMemory = typeof deviceMemory === 'number' ? deviceMemory : null;
  const missingSignals =
    Number(normalizedEffectiveType === null) + Number(normalizedDeviceMemory === null);

  return {
    saveData,
    effectiveType: normalizedEffectiveType,
    deviceMemoryGb: normalizedDeviceMemory,
    mobile: mobileByUA,
    missingSignals,
  };
}

/**
 * Detect device performance tier based on hardware capabilities
 * Uses the same logic as sliding sync for consistency
 */
export function getDevicePerformanceTier(): DevicePerformanceTier {
  const signals = readAdaptiveSignals();

  // Low-end: save data enabled or very slow connection
  if (signals.saveData || signals.effectiveType === 'slow-2g' || signals.effectiveType === '2g') {
    return 'low';
  }

  // Medium: 3g connection or low memory device
  if (
    signals.effectiveType === '3g' ||
    (signals.deviceMemoryGb !== null && signals.deviceMemoryGb <= 4)
  ) {
    return 'medium';
  }

  // Medium fallback: mobile with missing signal data
  if (signals.mobile && signals.missingSignals > 0) {
    return 'medium';
  }

  // High-end: everything else (4g+, desktop, or high memory)
  return 'high';
}

/**
 * Get background pagination configuration based on device capabilities
 * Uses the same adaptive detection logic as sliding sync for consistency
 */
export function getBackgroundPaginationConfig(): BackgroundPaginationConfig {
  const tier = getDevicePerformanceTier();

  switch (tier) {
    case 'high':
      return {
        enabled: true,
        delayMs: 1000, // 1 second delay
        limit: 500, // Load 500 messages
      };
    case 'medium':
      return {
        enabled: true,
        delayMs: 2000, // 2 second delay
        limit: 250, // Load 250 messages
      };
    case 'low':
      return {
        enabled: true,
        delayMs: 3000, // 3 second delay
        limit: 100, // Load 100 messages
      };
    default:
      return {
        enabled: false,
        delayMs: 0,
        limit: 0,
      };
  }
}
