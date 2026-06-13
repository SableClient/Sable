import { describe, expect, it } from 'vitest';
import { buildGitHubUrl } from './BugReportModal';

describe('buildGitHubUrl', () => {
  it('routes bug reports to the Charm fork and labels the app version as Charm', () => {
    const url = new URL(
      buildGitHubUrl('bug', 'SSO is broken', {
        description: 'The callback does not open the app.',
      })
    );

    expect(url.origin).toBe('https://github.com');
    expect(url.pathname).toBe('/Just-Insane/Sable/issues/new');
    expect(url.searchParams.get('template')).toBe('bug_report.yml');
    expect(url.searchParams.get('description')).toBe('The callback does not open the app.');
    expect(url.searchParams.get('info')).toContain('- Charm: vtest-dev');
    expect(url.searchParams.get('info')).not.toContain('- Sable:');
  });
});
