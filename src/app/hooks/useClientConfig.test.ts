import { describe, it, expect } from 'vitest';
import { selectExperimentVariant, type ExperimentConfig } from './useClientConfig';

const baseExperiment: ExperimentConfig = {
  enabled: true,
  rolloutPercentage: 100,
  controlVariant: 'control',
  variants: ['alpha', 'beta'],
};

describe('selectExperimentVariant', () => {
  it('returns control when experiment is disabled', () => {
    const result = selectExperimentVariant(
      'threadUI',
      { ...baseExperiment, enabled: false },
      '@alice:example.org'
    );

    expect(result.inExperiment).toBe(false);
    expect(result.variant).toBe('control');
  });

  it('returns control when subject id is missing', () => {
    const result = selectExperimentVariant('threadUI', baseExperiment, undefined);

    expect(result.inExperiment).toBe(false);
    expect(result.variant).toBe('control');
  });

  it('returns control when rollout is 0', () => {
    const result = selectExperimentVariant(
      'threadUI',
      { ...baseExperiment, rolloutPercentage: 0 },
      '@alice:example.org'
    );

    expect(result.inExperiment).toBe(false);
    expect(result.variant).toBe('control');
    expect(result.rolloutPercentage).toBe(0);
  });

  it('normalizes rollout less than 0 to 0', () => {
    const result = selectExperimentVariant(
      'threadUI',
      { ...baseExperiment, rolloutPercentage: -10 },
      '@alice:example.org'
    );

    expect(result.inExperiment).toBe(false);
    expect(result.variant).toBe('control');
    expect(result.rolloutPercentage).toBe(0);
  });

  it('normalizes rollout greater than 100 to 100', () => {
    const result = selectExperimentVariant(
      'threadUI',
      { ...baseExperiment, rolloutPercentage: 999 },
      '@alice:example.org'
    );

    expect(result.inExperiment).toBe(true);
    expect(result.rolloutPercentage).toBe(100);
    expect(['alpha', 'beta']).toContain(result.variant);
  });

  it('falls back to control when variants are missing after filtering', () => {
    const result = selectExperimentVariant(
      'threadUI',
      {
        ...baseExperiment,
        variants: ['', 'control'],
      },
      '@alice:example.org'
    );

    expect(result.inExperiment).toBe(false);
    expect(result.variant).toBe('control');
  });

  it('is deterministic for the same key and subject', () => {
    const first = selectExperimentVariant('threadUI', baseExperiment, '@alice:example.org');
    const second = selectExperimentVariant('threadUI', baseExperiment, '@alice:example.org');

    expect(second).toEqual(first);
  });

  it('uses default control variant when none is provided', () => {
    const result = selectExperimentVariant(
      'threadUI',
      {
        enabled: true,
        rolloutPercentage: 100,
        variants: ['alpha'],
      },
      '@alice:example.org'
    );

    expect(result.inExperiment).toBe(true);
    expect(result.variant).toBe('alpha');
  });
});
