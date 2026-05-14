import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('ElementCallDomAdapter');

const missingSelectorWarnings = new Set<string>();

type SelectorQueryOptions = {
  key: string;
  selectors: string[];
};

const queryFirst = (doc: Document | undefined, { key, selectors }: SelectorQueryOptions) => {
  if (!doc) return undefined;

  for (const selector of selectors) {
    const element = doc.querySelector(selector) as HTMLElement | null;
    if (element) return element;
  }

  if (!missingSelectorWarnings.has(key)) {
    missingSelectorWarnings.add(key);
    debugLog.warn('call', 'Element Call selector(s) not found', { key, selectors });
  }

  return undefined;
};

export const getLeaveButton = (doc: Document | undefined): HTMLElement | undefined =>
  queryFirst(doc, {
    key: 'leave_button',
    selectors: ['[data-testid="incall_leave"]', 'button[aria-label*="Leave" i]'],
  });

export const getScreenshareButton = (doc: Document | undefined): HTMLElement | undefined =>
  queryFirst(doc, {
    key: 'screenshare_button',
    selectors: ['[data-testid="incall_screenshare"]', 'button[aria-label*="screen" i]'],
  });

export const getSettingsButton = (doc: Document | undefined): HTMLElement | undefined => {
  const leaveButton = getLeaveButton(doc);
  const sibling = leaveButton?.previousElementSibling as HTMLElement | null;
  if (sibling) return sibling;
  return queryFirst(doc, {
    key: 'settings_button',
    selectors: ['[data-testid="incall_settings"]', 'button[aria-label*="Settings" i]'],
  });
};

export const getReactionsButton = (doc: Document | undefined): HTMLElement | undefined => {
  const settingsButton = getSettingsButton(doc);
  const sibling = settingsButton?.previousElementSibling as HTMLElement | null;
  if (sibling) return sibling;
  return queryFirst(doc, {
    key: 'reactions_button',
    selectors: ['[data-testid="incall_reactions"]', 'button[aria-label*="Reaction" i]'],
  });
};

export const getSpotlightControl = (doc: Document | undefined): HTMLElement | undefined =>
  queryFirst(doc, {
    key: 'spotlight_control',
    selectors: [
      'input[value="spotlight"]',
      'button[value="spotlight"]',
      '[data-testid="layout_spotlight"]',
      'button[aria-label*="spotlight" i]',
    ],
  });

export const getGridControl = (doc: Document | undefined): HTMLElement | undefined =>
  queryFirst(doc, {
    key: 'grid_control',
    selectors: [
      'input[value="grid"]',
      'button[value="grid"]',
      '[data-testid="layout_grid"]',
      'button[aria-label*="grid" i]',
    ],
  });

export const getInCallControlsContainer = (doc: Document | undefined): HTMLElement | undefined => {
  const leaveButton = getLeaveButton(doc);

  const container = leaveButton?.parentElement?.parentElement;
  if (container) return container;

  return queryFirst(doc, {
    key: 'incall_controls_container',
    selectors: ['[data-testid="incall_controls"]', '[data-testid="incall_toolbar"]'],
  });
};

export const isElementToggledOn = (element: HTMLElement | undefined): boolean => {
  if (!element) return false;
  if ('checked' in element && typeof (element as HTMLInputElement).checked === 'boolean') {
    return (element as HTMLInputElement).checked;
  }

  const ariaPressed = element.getAttribute('aria-pressed');
  if (ariaPressed !== null) return ariaPressed === 'true';

  const ariaChecked = element.getAttribute('aria-checked');
  if (ariaChecked !== null) return ariaChecked === 'true';

  const dataKind = element.getAttribute('data-kind');
  if (dataKind !== null) return dataKind === 'primary';

  return false;
};
