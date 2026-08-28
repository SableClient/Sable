import type { PushAccount } from './pushAccount';
import { getUnifiedPushTransportApi } from './UnifiedPushTransportApiClient';

export type UnifiedPushPermissionState = 'granted' | 'denied' | 'default';

export type UnifiedPushRegistrationStatus =
  | 'registered'
  | 'temp-unavailable'
  | 'hard-failure'
  | 'denied'
  | 'missing-distributor';

export type UnifiedPushDistributorState = {
  distributors: string[];
  selectedDistributor: string;
};

export type UnifiedPushRegistrationResult =
  | {
      status: 'registered';
      permissionState: 'granted';
      endpoint: string;
      distributor: string;
      p256dh?: string;
      auth?: string;
    }
  | {
      status: 'temp-unavailable';
      permissionState: UnifiedPushPermissionState;
      distributor?: string;
      error: string;
    }
  | {
      status: 'hard-failure';
      permissionState: UnifiedPushPermissionState;
      distributor?: string;
      error: string;
    }
  | {
      status: 'missing-distributor';
      permissionState: UnifiedPushPermissionState;
      distributors: string[];
      error: string;
      distributor?: string;
    }
  | {
      status: 'denied';
      permissionState: Exclude<UnifiedPushPermissionState, 'granted'>;
      error: string;
    };

const DISTRIBUTUTOR_STORAGE_KEY = 'unifiedpush_distributor';

export function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const message = 'message' in error ? (error as { message?: unknown }).message : undefined;
    if (typeof message === 'string') return message;
    const code = 'code' in error ? (error as { code?: unknown }).code : undefined;
    if (typeof code === 'string') return code;
  }
  return String(error);
}

function normalizeErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  if ('code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return String((error as { code?: string }).code).toLowerCase();
  }
  if ('name' in error && typeof (error as { name?: unknown }).name === 'string') {
    return String((error as { name?: string }).name).toLowerCase();
  }
  return '';
}

export function classifyUnifiedPushFailure(
  error: unknown
): Exclude<UnifiedPushRegistrationStatus, 'registered' | 'denied'> {
  const message = normalizeErrorMessage(error).toLowerCase();
  const code = normalizeErrorCode(error);

  if (
    code.includes('temp_unavailable') ||
    code.includes('temporary_unavailable') ||
    message.includes('temp-unavailable') ||
    message.includes('temp unavailable') ||
    message.includes('temporarily unavailable')
  ) {
    return 'temp-unavailable';
  }

  if (
    code.includes('missing_distributor') ||
    message.includes('missing distributor') ||
    message.includes('no unifiedpush distributor') ||
    message.includes('no distributor') ||
    message.includes('distributor parameter is required')
  ) {
    return 'missing-distributor';
  }

  return 'hard-failure';
}

async function getUnifiedPushPermissionState(): Promise<UnifiedPushPermissionState> {
  const api = await getUnifiedPushTransportApi();
  if (await api.isPermissionGranted()) return 'granted';

  const permission = await api.requestPermission();
  return permission === 'granted' ? 'granted' : permission;
}

export async function isUnifiedPushPermissionGranted(): Promise<boolean | null> {
  const api = await getUnifiedPushTransportApi();
  return api.isPermissionGranted();
}

async function getUnifiedPushDistributors(): Promise<string[]> {
  const api = await getUnifiedPushTransportApi();
  return api.listDistributors();
}

async function getUnifiedPushDistributor(): Promise<{ distributor: string }> {
  const distributor = localStorage.getItem(DISTRIBUTUTOR_STORAGE_KEY) ?? '';
  return { distributor };
}

async function saveUnifiedPushDistributor(distributor: string): Promise<void> {
  localStorage.setItem(DISTRIBUTUTOR_STORAGE_KEY, distributor);
  const api = await getUnifiedPushTransportApi();
  await api.setDistributor(distributor);
}

export async function loadUnifiedPushDistributorState(): Promise<UnifiedPushDistributorState> {
  const [distributorResult, distributorsResult] = await Promise.allSettled([
    getUnifiedPushDistributor(),
    getUnifiedPushDistributors(),
  ]);

  const savedDistributor =
    distributorsResult.status === 'fulfilled'
      ? distributorResult.status === 'fulfilled'
        ? distributorResult.value.distributor
        : ''
      : '';
  const distributors = distributorsResult.status === 'fulfilled' ? distributorsResult.value : [];

  if (savedDistributor && distributors.includes(savedDistributor)) {
    return { distributors, selectedDistributor: savedDistributor };
  }

  if (distributors.length === 1) {
    const [onlyDistributor] = distributors;
    if (onlyDistributor) {
      await saveUnifiedPushDistributor(onlyDistributor);
      return { distributors, selectedDistributor: onlyDistributor };
    }
  }

  return { distributors, selectedDistributor: '' };
}

export async function ensureUnifiedPushDistributorSelection(
  distributors: string[],
  selectedDistributor: string
): Promise<string> {
  const distributor =
    selectedDistributor && distributors.includes(selectedDistributor)
      ? selectedDistributor
      : distributors[0];

  if (!distributor) return '';

  await saveUnifiedPushDistributor(distributor);
  return distributor;
}

export async function setUnifiedPushDistributorSelection(distributor: string): Promise<void> {
  await saveUnifiedPushDistributor(distributor);
}

export async function switchUnifiedPushDistributorSelection<T>(
  nextDistributor: string,
  previousDistributor: string,
  register: () => Promise<T>
): Promise<T> {
  if (nextDistributor === previousDistributor) {
    return register();
  }

  await saveUnifiedPushDistributor(nextDistributor);

  try {
    return await register();
  } catch (error) {
    await saveUnifiedPushDistributor(previousDistributor);
    throw error;
  }
}

export async function registerUnifiedPushTransport(
  vapid?: string,
  embeddedGatewayUrl?: string,
  account?: PushAccount
): Promise<UnifiedPushRegistrationResult> {
  let permissionState: UnifiedPushPermissionState = 'default';
  let selectedDistributor: string | undefined;

  try {
    permissionState = await getUnifiedPushPermissionState();
    if (permissionState !== 'granted') {
      return {
        status: 'denied',
        permissionState,
        error:
          permissionState === 'denied'
            ? 'UnifiedPush permission denied'
            : 'UnifiedPush permission dismissed',
      };
    }

    const { distributors, selectedDistributor: distributor } =
      await loadUnifiedPushDistributorState();
    selectedDistributor = distributor || undefined;
    // With a gateway configured the app is its own distributor, so an empty list is
    // no longer a dead end.
    if (!distributor && !embeddedGatewayUrl?.trim()) {
      return {
        status: 'missing-distributor',
        permissionState: 'granted',
        distributors,
        error:
          distributors.length === 0
            ? 'No UnifiedPush distributor installed'
            : 'No UnifiedPush distributor selected',
      };
    }

    const api = await getUnifiedPushTransportApi();
    const registration = await api.registerForPushNotifications(
      vapid,
      embeddedGatewayUrl?.trim(),
      account
    );
    const endpoint = registration?.deviceToken;
    if (!endpoint || !endpoint.trim()) {
      return {
        status: 'hard-failure',
        permissionState: 'granted',
        error: 'UnifiedPush registration returned an invalid endpoint',
        ...(selectedDistributor ? { distributor: selectedDistributor } : {}),
      };
    }

    return {
      status: 'registered',
      permissionState: 'granted',
      endpoint,
      distributor: registration.distributor ?? distributor,
      p256dh: registration.p256dh,
      auth: registration.auth,
    };
  } catch (error) {
    const failureStatus = classifyUnifiedPushFailure(error);
    return {
      status: failureStatus,
      permissionState,
      error: normalizeErrorMessage(error),
      ...(selectedDistributor ? { distributor: selectedDistributor } : {}),
    } as UnifiedPushRegistrationResult;
  }
}

export async function unregisterUnifiedPushTransport(): Promise<void> {
  const api = await getUnifiedPushTransportApi();
  await api.unregisterForPushNotifications();
}
