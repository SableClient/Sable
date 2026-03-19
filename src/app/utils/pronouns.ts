// helper function to convert a comma-separated pronouns string into an array of objects with summary and optional language
export function parsePronounsInput(pronouns: string): { summary: string; language?: string }[] {
  if (!pronouns || typeof pronouns !== 'string') return [];

  return pronouns
    .split(',')
    .map((s) => s?.trim())
    .filter(Boolean)
    .map((s) => {
      const parts = s.split(':');

      if (parts.length === 1) {
        return {
          summary: (parts[0] || '').slice(0, 16),
          language: 'en',
        };
      }

      const [language, summary] = parts;

      return {
        language: (language || 'en').trim() || 'en',
        summary: (summary || '').trim().slice(0, 16),
      };
    });
}

// helper function to filter a list of pronouns based on the user's language settings
export function filterPronounsByLanguage(
  pronouns: { summary: string; language?: string }[],
  enabled: boolean,
  languages: string[]
): { summary: string; language?: string }[] {
  if (!Array.isArray(pronouns)) return [];

  if (!enabled) {
    return pronouns.map((p) => ({
      ...p,
      summary: (p?.summary || '').slice(0, 16),
    }));
  }

  const normalizedLanguages = (languages || [])
    .filter(Boolean)
    .map((lang) => lang.trim().toLowerCase());

  const filteredPronouns = pronouns
    .filter((p) => {
      const lang = (p?.language || 'en').trim().toLowerCase();
      return normalizedLanguages.includes(lang);
    })
    .map((p) => ({
      ...p,
      summary: (p?.summary || '').slice(0, 16),
    }));

  if (filteredPronouns.length === 0) {
    return pronouns.map((p) => ({
      ...p,
      summary: (p?.summary || '').slice(0, 16),
    }));
  }

  return filteredPronouns;
}

const pronounParseCache = new Map<
  string,
  { cleanedDisplayName: string; inlinePronoun: string | null }
>();

export function getParsedPronouns(rawName: string, parseSetting: boolean) {
  if (!parseSetting || !rawName) {
    return { cleanedDisplayName: rawName, inlinePronoun: null };
  }

  if (pronounParseCache.has(rawName)) {
    return pronounParseCache.get(rawName)!;
  }

  // match text like (she/her) or [he/they/them] but not (hi)
  const regex = /[([]?([a-zA-Z]+\/[a-zA-Z]+(?:\/[a-zA-Z]+)?)[)\]]?/;
  const match = rawName.match(regex);

  let result: { cleanedDisplayName: string; inlinePronoun: string | null } = {
    cleanedDisplayName: rawName,
    inlinePronoun: null,
  };

  if (match) {
    let strippedName = rawName.replace(match[0], '').trim();
    if (!strippedName || strippedName === '') {
      strippedName = rawName;
    }
    result = {
      cleanedDisplayName: strippedName,
      inlinePronoun: match[1].toLowerCase().slice(0, 16),
    };
  }

  if (pronounParseCache.size > 1000) {
    pronounParseCache.clear();
  }

  pronounParseCache.set(rawName, result);
  return result;
}
