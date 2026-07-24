// Shape stashed by the inline preload script in index.html.
type SablePreload = {
  config?: Promise<unknown>;
  locale?: { lng: string; promise: Promise<Response> };
};

const win = window as Window & { __SABLE_PRELOAD?: SablePreload };

/** One-shot: returns the preloaded config.json fetch promise and nulls the slot. */
export const takePreloadedConfig = (): Promise<unknown> | undefined => {
  const preload = win.__SABLE_PRELOAD;
  if (preload?.config !== undefined) {
    const promise = preload.config;
    delete preload.config;
    return promise;
  }
  return undefined;
};

/** One-shot: returns the preloaded locale fetch promise for the given language, nulls the slot. */
export const takePreloadedLocale = (lng: string): Promise<Response> | undefined => {
  const preload = win.__SABLE_PRELOAD;
  if (preload?.locale !== undefined && preload.locale.lng === lng) {
    const promise = preload.locale.promise;
    delete preload.locale;
    return promise;
  }
  return undefined;
};
