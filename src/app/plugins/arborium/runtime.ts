type ArboriumModule = typeof import('@arborium/arborium');

export interface HighlightCodeInput {
  code: string;
  language?: string | null;
}

let arboriumModulePromise: Promise<ArboriumModule | null> | null = null;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadArborium(): Promise<ArboriumModule | null> {
  if (!arboriumModulePromise) {
    arboriumModulePromise = import('@arborium/arborium').catch(() => null);
  }

  return arboriumModulePromise;
}

export async function highlightCode({ code, language }: HighlightCodeInput): Promise<string> {
  if (!language) {
    return escapeHtml(code);
  }

  const arborium = await loadArborium();
  if (!arborium) {
    return escapeHtml(code);
  }

  try {
    return await arborium.highlight(language, code);
  } catch {
    return escapeHtml(code);
  }
}
