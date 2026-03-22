export type PronounSet = {
  summary: string;
  language?: string;
  grammatical_gender?: string;
};

export function parsePronounsInput(
  pronouns?: string | null
): { summary: string; language?: string }[] {
  if (!pronouns || typeof pronouns !== 'string') return [];

  return pronouns
    .split(',')
    .map((s) => s?.trim())
    .filter(Boolean)
    .map((s) => {
      const parts = s.split(':');

      if (parts.length === 1) {
        return {
          summary: (parts[0] ?? '').trim().slice(0, 16),
          language: 'en',
        };
      }

      const [language, summary] = parts;
      return {
        language: (language ?? 'en').trim().toLowerCase() || 'en',
        summary: (summary ?? '').trim().slice(0, 16),
      };
    });
}

export function parsePronounsStringToPronounsSetArray(pronouns?: string | null): PronounSet[] {
  return parsePronounsInput(pronouns) as PronounSet[];
}

export function filterPronounsByLanguage(
  pronouns?: { summary: string; language?: string }[] | null,
  enabled?: boolean,
  languages?: (string | null | undefined)[]
): { summary: string; language?: string }[] {
  if (!Array.isArray(pronouns)) return [];

  const sanitize = (p: { summary: string; language?: string }) => ({
    ...p,
    summary: (p?.summary ?? '').slice(0, 16),
  });

  if (!enabled) {
    return pronouns.map(sanitize);
  }

  const normalizedLanguages = (languages ?? [])
    .filter((lang): lang is string => typeof lang === 'string')
    .map((lang) => lang.trim().toLowerCase());

  const filteredPronouns = pronouns
    .filter((p) => {
      const lang = (p?.language ?? 'en').trim().toLowerCase();
      return normalizedLanguages.includes(lang);
    })
    .map(sanitize);

  return filteredPronouns.length > 0 ? filteredPronouns : pronouns.map(sanitize);
}

const pronounParseCache = new Map<
  string,
  { cleanedDisplayName: string; inlinePronoun: string | null }
>();

export function getParsedPronouns(rawName?: string | null, parseSetting?: boolean) {
  if (!parseSetting || !rawName || typeof rawName !== 'string') {
    return { cleanedDisplayName: rawName ?? '', inlinePronoun: null };
  }

  const cached = pronounParseCache.get(rawName);
  if (cached) return cached;

  const regex =
    /(?:\(([a-zA-Z]+\/[a-zA-Z]+(?:\/[a-zA-Z]+)?)\)|\[([a-zA-Z]+\/[a-zA-Z]+(?:\/[a-zA-Z]+)?)\])/;
  const match = rawName.match(regex);

  let result: { cleanedDisplayName: string; inlinePronoun: string | null } = {
    cleanedDisplayName: rawName.trim(),
    inlinePronoun: null,
  };

  if (match) {
    const fullMatch = match[0];
    const capturedPronoun = (match[1] ?? match[2] ?? '').toLowerCase().slice(0, 16);

    const strippedName = rawName.replace(fullMatch, '').trim();

    result = {
      cleanedDisplayName: strippedName || rawName,
      inlinePronoun: capturedPronoun || null,
    };
  }

  if (pronounParseCache.size > 1000) {
    pronounParseCache.clear();
  }

  pronounParseCache.set(rawName, result);
  return result;
}
