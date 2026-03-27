type ArboriumModule = typeof import('@arborium/arborium');

export interface HighlightCodeInput {
  code: string;
  language?: string | null;
  allowDetect?: boolean;
}

export type HighlightResult =
  | { mode: 'plain'; html: string; language?: string }
  | { mode: 'highlighted'; html: string; language: string };

export interface HighlightCodeDeps {
  loadModule?: () => Promise<ArboriumModule>;
}

let arboriumModulePromise: Promise<ArboriumModule | null> | null = null;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function plainResult(code: string, language?: string): HighlightResult {
  const result: HighlightResult = {
    mode: 'plain',
    html: escapeHtml(code),
  };

  if (language !== undefined) {
    result.language = language;
  }

  return result;
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

export async function highlightCode(
  { code, language, allowDetect = false }: HighlightCodeInput,
  deps?: HighlightCodeDeps
): Promise<HighlightResult> {
  const { loadModule } = deps ?? {};
  const arborium = await loadArborium(loadModule);
  if (!arborium) {
    return plainResult(code, language ?? undefined);
  }

  let resolvedLanguage: string | null = null;

  if (language) {
    try {
      resolvedLanguage = arborium.normalizeLanguage(language);
    } catch {
      return plainResult(code, language ?? undefined);
    }
  } else if (allowDetect) {
    try {
      const detectedLanguage = arborium.detectLanguage(code);
      if (detectedLanguage) {
        resolvedLanguage = arborium.normalizeLanguage(detectedLanguage);
      }
    } catch {
      return plainResult(code, language ?? undefined);
    }
  }

  if (!resolvedLanguage) {
    return plainResult(code, language ?? undefined);
  }

  try {
    const html = await arborium.highlight(resolvedLanguage, code);
    if (html === escapeHtml(code)) {
      return plainResult(code, resolvedLanguage);
    }
    return {
      mode: 'highlighted',
      html,
      language: resolvedLanguage,
    };
  } catch {
    return plainResult(code, resolvedLanguage);
  }
}
