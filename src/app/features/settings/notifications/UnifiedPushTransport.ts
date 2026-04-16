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
      instance: string;
      distributor: string;
      pubKeySet?: {
        pubKey: string;
        auth: string;
      };
    }
  | {
      status: 'temp-unavailable';
      permissionState: UnifiedPushPermissionState;
      distributor?: string;
      error: string;
      instance?: string;
    }
  | {
      status: 'hard-failure';
      permissionState: UnifiedPushPermissionState;
      distributor?: string;
      error: string;
      instance?: string;
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

type UnifiedPushEndpointResponse = {
  endpoint: string;
  instance: string;
  pubKeySet?: {
    pubKey: string;
    auth: string;
  };
};

type UnifiedPushDistributorsResponse = {
  distributors: string[];
};

type UnifiedPushDistributorResponse = {
  distributor: string;
};

type UnifiedPushSwitchRegistration = {
  endpoint: string;
  instance: string;
  pubKeySet?: {
    pubKey: string;
    auth: string;
  };
};

function normalizeErrorMessage(error: unknown): string {
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

export async function getUnifiedPushDistributors(): Promise<UnifiedPushDistributorsResponse> {
  const api = await getUnifiedPushTransportApi();
  return api.getUnifiedPushDistributors();
}

export async function getUnifiedPushDistributor(): Promise<UnifiedPushDistributorResponse> {
  const api = await getUnifiedPushTransportApi();
  return api.getUnifiedPushDistributor();
}

export async function saveUnifiedPushDistributor(distributor: string): Promise<void> {
  const api = await getUnifiedPushTransportApi();
  await api.saveUnifiedPushDistributor(distributor);
}

export async function loadUnifiedPushDistributorState(): Promise<UnifiedPushDistributorState> {
  const [{ distributor: savedDistributor }, { distributors }] = await Promise.all([
    getUnifiedPushDistributor(),
    getUnifiedPushDistributors(),
  ]);

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
  if (selectedDistributor && distributors.includes(selectedDistributor)) {
    return selectedDistributor;
  }

  const [firstDistributor] = distributors;
  if (!firstDistributor) return '';

  await saveUnifiedPushDistributor(firstDistributor);
  return firstDistributor;
}

export async function setUnifiedPushDistributorSelection(distributor: string): Promise<void> {
  await saveUnifiedPushDistributor(distributor);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateUnifiedPushRegistrationResponse(
  response: Partial<UnifiedPushSwitchRegistration>
): { ok: true; value: UnifiedPushSwitchRegistration } | { ok: false; error: string } {
  if (!isNonEmptyString(response.endpoint)) {
    return { ok: false, error: 'UnifiedPush registration returned an invalid endpoint' };
  }

  if (!isNonEmptyString(response.instance)) {
    return { ok: false, error: 'UnifiedPush registration returned an invalid instance' };
  }

  return {
    ok: true,
    value: {
      endpoint: response.endpoint,
      instance: response.instance,
      pubKeySet: response.pubKeySet,
    },
  };
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

export async function registerUnifiedPushTransport(): Promise<UnifiedPushRegistrationResult> {
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
    if (!distributor) {
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
    const response = (await api.registerForUnifiedPush()) as Partial<UnifiedPushEndpointResponse>;
    const validated = validateUnifiedPushRegistrationResponse(response);
    if (!validated.ok) {
      return {
        status: 'hard-failure',
        permissionState: 'granted',
        error: validated.error,
        ...(selectedDistributor ? { distributor: selectedDistributor } : {}),
      };
    }

    return {
      status: 'registered',
      permissionState: 'granted',
      endpoint: validated.value.endpoint,
      instance: validated.value.instance,
      distributor,
      pubKeySet: validated.value.pubKeySet,
    };
  } catch (error) {
    const failureStatus = classifyUnifiedPushFailure(error);
    return {
      status: failureStatus,
      permissionState,
      error: normalizeErrorMessage(error),
      ...(selectedDistributor ? { distributor: selectedDistributor } : {}),
      ...(error && typeof error === 'object' && 'instance' in error
        ? {
            instance: String((error as { instance?: unknown }).instance ?? ''),
          }
        : {}),
    } as UnifiedPushRegistrationResult;
  }
}

export async function unregisterUnifiedPushTransport(): Promise<void> {
  const api = await getUnifiedPushTransportApi();
  await api.unregisterFromUnifiedPush();
}
