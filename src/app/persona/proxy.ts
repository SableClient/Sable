import {
  MATRIX_SABLE_UNSTABLE_MSC4461_TRIGGER_CIRCUMFIX_PROPERTY_NAME,
  MATRIX_SABLE_UNSTABLE_MSC4461_TRIGGER_SUFFIX_PROPERTY_NAME,
} from '$unstable/prefixes';
import type { Persona } from './index';

/** Resolves the first matching MSC4461 trigger and strips it. */
export function resolvePersonaProxy(personas: readonly Persona[], body: string) {
  for (const persona of personas) {
    const prefix = persona.trigger.prefix.find((trigger) => body.startsWith(trigger));
    if (prefix !== undefined) return { persona, body: body.slice(prefix.length).trimStart() };

    const suffix = persona.trigger[
      MATRIX_SABLE_UNSTABLE_MSC4461_TRIGGER_SUFFIX_PROPERTY_NAME
    ]?.find((trigger) => body.endsWith(trigger));
    if (suffix !== undefined) return { persona, body: body.slice(0, -suffix.length).trimEnd() };

    const circumfix = persona.trigger[
      MATRIX_SABLE_UNSTABLE_MSC4461_TRIGGER_CIRCUMFIX_PROPERTY_NAME
    ]?.find(({ prefix: start, suffix: end }) => body.startsWith(start) && body.endsWith(end));
    if (circumfix !== undefined)
      return {
        persona,
        body: body.slice(circumfix.prefix.length, -circumfix.suffix.length).trim(),
      };
  }
  return undefined;
}
