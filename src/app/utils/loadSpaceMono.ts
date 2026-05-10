let loadPromise: Promise<void> | null = null;

export const loadSpaceMono = (): Promise<void> => {
  if (!loadPromise) {
    loadPromise = Promise.all([
      import('@fontsource/space-mono/400.css'),
      import('@fontsource/space-mono/700.css'),
      import('@fontsource/space-mono/400-italic.css'),
      import('@fontsource/space-mono/700-italic.css'),
    ]).then(() => undefined);
  }

  return loadPromise;
};
