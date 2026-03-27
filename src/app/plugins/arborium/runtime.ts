type ArboriumModule = typeof import('@arborium/arborium');

export interface HighlightCodeInput {
  code: string;
  language?: string | null;
  allowDetect?: boolean;
  loadModule?: () => Promise<ArboriumModule>;
}

export interface HighlightResult {
  mode: 'highlighted' | 'plain';
  html: string;
  language: string | null;
}

let arboriumModulePromise: Promise<ArboriumModule | null> | null = null;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function plainResult(code: string): HighlightResult {
  return {
    mode: 'plain',
    html: escapeHtml(code),
    language: null,
  };
}

async function loadArborium(
  loadModule?: () => Promise<ArboriumModule>
): Promise<ArboriumModule | null> {
  if (loadModule) {
    try {
      return await loadModule();
    } catch {
      return null;
    }
  }

  if (!arboriumModulePromise) {
    arboriumModulePromise = import('@arborium/arborium').catch(() => null);
  }

  return arboriumModulePromise;
}

export async function highlightCode({
  code,
  language,
  allowDetect = false,
  loadModule,
}: HighlightCodeInput): Promise<HighlightResult> {
  const arborium = await loadArborium(loadModule);
  if (!arborium) {
    return plainResult(code);
  }

  let resolvedLanguage: string | null = null;

  if (language) {
    try {
      resolvedLanguage = arborium.normalizeLanguage(language);
    } catch {
      return plainResult(code);
    }
  } else if (allowDetect) {
    try {
      const detectedLanguage = arborium.detectLanguage(code);
      if (detectedLanguage) {
        resolvedLanguage = arborium.normalizeLanguage(detectedLanguage);
      }
    } catch {
      return plainResult(code);
    }
  }

  if (!resolvedLanguage) {
    return plainResult(code);
  }

  try {
    const html = await arborium.highlight(resolvedLanguage, code);
    return {
      mode: 'highlighted',
      html,
      language: resolvedLanguage,
    };
  } catch {
    return plainResult(code);
  }
}
