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

export const getScreenshareButton = (doc: Document | undefined): HTMLElement | undefined =>
  queryFirst(doc, {
    key: 'screenshare_button',
    selectors: ['[data-testid="incall_screenshare"]', 'button[aria-label*="screen" i]'],
  });

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
