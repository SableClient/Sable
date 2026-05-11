import type * as ArboriumModule from '@arborium/arborium';

type ArboriumModuleType = typeof ArboriumModule;
type ArboriumModuleWithAvailability = ArboriumModuleType & {
  availableLanguages?: string[];
  isLanguageAvailable?: (language: string) => boolean | Promise<boolean>;
};

const LANGUAGE_COMPATIBILITY: Record<string, string> = {
  jsx: 'tsx',
  markup: 'html',
};

export interface HighlightCodeInput {
  code: string;
  language?: string | null;
  allowDetect?: boolean;
}

export type HighlightResult =
  | { mode: 'plain'; html: string; language?: string }
  | { mode: 'highlighted'; html: string; language: string };

export interface HighlightCodeDeps {
  loadModule?: () => Promise<ArboriumModuleType>;
}

let arboriumModulePromise: Promise<ArboriumModuleType | null> | null = null;

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

function resolveCompatibleLanguage(language: string): string {
  return LANGUAGE_COMPATIBILITY[language.toLowerCase()] ?? language;
}

async function isLanguageAvailable(
  arborium: ArboriumModuleWithAvailability,
  language: string
): Promise<boolean> {
  if (Array.isArray(arborium.availableLanguages)) {
    return arborium.availableLanguages.includes(language);
  }

  if (typeof arborium.isLanguageAvailable === 'function') {
    try {
      return await arborium.isLanguageAvailable(language);
    } catch {
      return false;
    }
  }

  return true;
}

async function loadArborium(
  loadModule?: () => Promise<ArboriumModuleType>
): Promise<ArboriumModuleType | null> {
  if (loadModule) {
    try {
      return await loadModule();
    } catch {
      return null;
    }
  }

  if (!arboriumModulePromise) {
    arboriumModulePromise = import('@arborium/arborium').then((m) => m).catch(() => null);
  }

  return arboriumModulePromise;
}

export async function highlightCode(
  { code, language, allowDetect = false }: HighlightCodeInput,
  deps?: HighlightCodeDeps
): Promise<HighlightResult> {
  const { loadModule } = deps ?? {};
  if (language) {
    const compatibleLanguage = resolveCompatibleLanguage(language);
    const arborium = await loadArborium(loadModule);
    if (!arborium) {
      return plainResult(code, language);
    }

    let resolvedLanguage: string;
    try {
      resolvedLanguage = arborium.normalizeLanguage(compatibleLanguage);
    } catch {
      return plainResult(code, language);
    }

    if (!(await isLanguageAvailable(arborium, resolvedLanguage))) {
      return plainResult(code, language);
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

  const arborium = await loadArborium(loadModule);
  if (!arborium) {
    return plainResult(code, language ?? undefined);
  }

  let resolvedLanguage: string | null = null;

  if (allowDetect) {
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

  if (!(await isLanguageAvailable(arborium, resolvedLanguage))) {
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
