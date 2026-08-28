import type { Persona } from './index';

/** Resolves the first matching MSC4461 trigger and strips it. */
export function resolvePersonaProxy(personas: readonly Persona[], body: string) {
  for (const persona of personas) {
    const trigger = persona.triggers?.find(
      ({ prefix, suffix }) => body.startsWith(prefix ?? '') && body.endsWith(suffix ?? '')
    );

    if (trigger) {
      if (!trigger.keep_trigger) {
        body = body.slice(trigger.prefix?.length ?? 0, body.length - (trigger.suffix?.length ?? 0));
      }

      return { persona, body };
    }
  }
  return undefined;
}
