import { useState, useEffect } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
  Chip,
  config,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Scroll,
  Spinner,
  Text,
  TextArea,
  Checkbox,
} from 'folds';
import * as Sentry from '@sentry/react';
import { useCloseBugReportModal, useBugReportModalOpen } from '$state/hooks/bugReportModal';
import { stopPropagation } from '$utils/keyboard';
import { getDebugLogger } from '$utils/debugLogger';

type ReportType = 'bug' | 'feature';

type SimilarIssue = {
  number: number;
  title: string;
  html_url: string;
};

const GITHUB_REPO = 'SableClient/Sable';

async function searchSimilarIssues(query: string, signal: AbortSignal): Promise<SimilarIssue[]> {
  // Split into individual words, drop very short ones, and join with OR so that
  // partial / stemmed titles (e.g. "reporting" still matches "report") surface results.
  const words = query
    .split(/[\s\-_/]+/)
    .map((w) => w.replace(/[^\w]/g, ''))
    .filter((w) => w.length >= 3);

  if (words.length === 0) return [];

  const q = `${words.join(' OR ')} repo:${GITHUB_REPO} is:issue is:open`;
  const params = new URLSearchParams({ q, per_page: '5' });
  const res = await fetch(`https://api.github.com/search/issues?${params}`, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: SimilarIssue[] };
  return data.items ?? [];
}

// Field IDs match the ids defined in .github/ISSUE_TEMPLATE/bug_report.yml
// and feature_request.yml so GitHub pre-fills each form field directly.
export function buildGitHubUrl(
  type: ReportType,
  title: string,
  fields: Record<string, string>
): string {
  const devLabel = IS_RELEASE_TAG ? '' : '-dev';
  const buildLabel = BUILD_HASH ? ` (${BUILD_HASH})` : '';
  const version = `v${APP_VERSION}${devLabel}${buildLabel}`;

  const params: Record<string, string> = { title };

  if (type === 'bug') {
    params.template = 'bug_report.yml';
    if (fields.description) params.description = fields.description;
    if (fields.reproduction) params.reproduction = fields.reproduction;
    if (fields['expected-behavior']) params['expected-behavior'] = fields['expected-behavior'];
    // Auto-populate the platform/versions field
    params.info = `- OS: ${navigator.platform || 'unknown'}\n- Browser: ${navigator.userAgent}\n- Sable: ${version}`;
    if (fields.context) params.context = fields.context;
  } else {
    params.template = 'feature_request.yml';
    if (fields.problem) params.problem = fields.problem;
    if (fields.solution) params.solution = fields.solution;
    if (fields.alternatives) params.alternatives = fields.alternatives;
    if (fields.context) params.context = fields.context;
  }

  return `https://github.com/${GITHUB_REPO}/issues/new?${new URLSearchParams(params)}`;
}

function BugReportModal() {
  const close = useCloseBugReportModal();
  const sentryEnabled = Sentry.isInitialized();
  const [type, setType] = useState<ReportType>('bug');
  const [title, setTitle] = useState('');

  // Bug fields (match bug_report.yml ids)
  const [description, setDescription] = useState('');
  const [reproduction, setReproduction] = useState('');
  const [expectedBehavior, setExpectedBehavior] = useState('');

  // Feature fields (match feature_request.yml ids)
  const [problem, setProblem] = useState('');
  const [solution, setSolution] = useState('');
  const [alternatives, setAlternatives] = useState('');

  // Shared optional field
  const [context, setContext] = useState('');

  // Sentry integration options
  const [sendToSentry, setSendToSentry] = useState(true);
  const [includeDebugLogs, setIncludeDebugLogs] = useState(true);
  // When Sentry is enabled, GitHub is opt-in; when disabled, GitHub is always used
  const [openOnGitHub, setOpenOnGitHub] = useState(!sentryEnabled);

  const [similarIssues, setSimilarIssues] = useState<SimilarIssue[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = title.trim();
    const controller = new AbortController();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (trimmed.length >= 3) {
      timer = setTimeout(async () => {
        setSearching(true);
        try {
          const issues = await searchSimilarIssues(trimmed, controller.signal);
          if (!cancelled) setSimilarIssues(issues);
        } catch {
          // silently ignore network errors / rate limits
        } finally {
          if (!cancelled) setSearching(false);
        }
      }, 600);
    } else {
      setSimilarIssues([]);
      setSearching(false);
    }

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      controller.abort();
    };
  }, [title]);

  const canSubmit =
    title.trim().length > 0 &&
    (type === 'bug'
      ? description.trim().length > 0
      : problem.trim().length > 0 && solution.trim().length > 0);

  const handleSubmit = () => {
    if (!canSubmit) return;

    const fields: Record<string, string> =
      type === 'bug'
        ? { description, reproduction, 'expected-behavior': expectedBehavior, context }
        : { problem, solution, alternatives, context };

    // Send to Sentry if bug report and option is enabled
    if (sendToSentry && type === 'bug') {
      const debugLogger = getDebugLogger();

      // Attach recent logs if user opted in
      if (includeDebugLogs) {
        debugLogger.attachLogsToSentry(100);
      }

      const version = `v${APP_VERSION}${IS_RELEASE_TAG ? '' : '-dev'}${BUILD_HASH ? ` (${BUILD_HASH})` : ''}`;

      // Build a fully self-contained message so all fields are visible
      // directly in the Sentry issue detail without digging into sub-sections.
      const sentryMessage = [
        `[Bug Report] ${title.trim()}`,
        '',
        `Description:\n${description}`,
        reproduction ? `\nSteps to Reproduce:\n${reproduction}` : '',
        expectedBehavior ? `\nExpected Behavior:\n${expectedBehavior}` : '',
        context ? `\nAdditional Context:\n${context}` : '',
        `\nEnvironment: ${version} · ${navigator.platform}`,
      ]
        .filter(Boolean)
        .join('\n');

      const eventId = Sentry.captureMessage(sentryMessage, {
        level: 'info',
        // Group all user bug reports together in Sentry Issues
        fingerprint: ['bug-report-modal'],
        tags: {
          source: 'bug-report-modal',
          reportType: type,
        },
        extra: {
          title: title.trim(),
          description,
          reproduction: reproduction || '(not provided)',
          expectedBehavior: expectedBehavior || '(not provided)',
          context: context || '(not provided)',
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          version,
        },
      });

      // Also send as User Feedback so it appears in the Sentry Feedback section
      if (eventId) {
        Sentry.captureFeedback({
          message: sentryMessage,
          name: 'User Bug Report',
          associatedEventId: eventId,
        });
      }
    }

    // Feature requests always go to GitHub; bugs go to GitHub only when Sentry
    // is unavailable or the user explicitly opts in.
    const shouldOpenGitHub = type === 'feature' || !sentryEnabled || openOnGitHub;
    if (shouldOpenGitHub) {
      const url = buildGitHubUrl(type, title.trim(), fields);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    close();
  };

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            clickOutsideDeactivates: true,
            onDeactivate: close,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Modal size="500" flexHeight variant="Surface">
            <Box direction="Column">
              <Header
                size="500"
                style={{ padding: config.space.S200, paddingLeft: config.space.S400 }}
              >
                <Box grow="Yes">
                  <Text size="H4">Report an Issue</Text>
                </Box>
                <IconButton size="300" radii="300" onClick={close}>
                  <Icon src={Icons.Cross} />
                </IconButton>
              </Header>
              <Scroll size="300" hideTrack>
                <Box
                  style={{ padding: config.space.S400, paddingRight: config.space.S200 }}
                  direction="Column"
                  gap="500"
                >
                  {/* Type */}
                  <Box direction="Column" gap="100">
                    <Text size="L400">Type</Text>
                    <Box gap="200">
                      <Chip
                        radii="Pill"
                        variant={type === 'bug' ? 'Primary' : 'SurfaceVariant'}
                        aria-pressed={type === 'bug'}
                        onClick={() => setType('bug')}
                      >
                        <Text size="T300">Bug Report</Text>
                      </Chip>
                      <Chip
                        radii="Pill"
                        variant={type === 'feature' ? 'Primary' : 'SurfaceVariant'}
                        aria-pressed={type === 'feature'}
                        onClick={() => setType('feature')}
                      >
                        <Text size="T300">Feature Request</Text>
                      </Chip>
                    </Box>
                  </Box>

                  {/* Title + duplicate check */}
                  <Box direction="Column" gap="100">
                    <Text size="L400">Title *</Text>
                    <Input
                      size="500"
                      variant="SurfaceVariant"
                      radii="400"
                      autoFocus
                      placeholder="Brief description"
                      value={title}
                      onChange={(e) => setTitle((e.target as HTMLInputElement).value)}
                    />
                    {searching && (
                      <Box gap="200" alignItems="Center">
                        <Spinner size="100" variant="Secondary" />
                        <Text size="T200">Searching for similar issues…</Text>
                      </Box>
                    )}
                    {!searching && similarIssues.length > 0 && (
                      <Box direction="Column" gap="100">
                        <Text size="T200">
                          Similar open issues — please check before submitting:
                        </Text>
                        {similarIssues.map((issue) => (
                          <Text key={issue.number} size="T200">
                            {'→ '}
                            <a href={issue.html_url} target="_blank" rel="noopener noreferrer">
                              #{issue.number}: {issue.title}
                            </a>
                          </Text>
                        ))}
                      </Box>
                    )}
                  </Box>

                  {/* Description */}
                  <Box direction="Column" gap="100">
                    <Text size="L400">
                      {type === 'bug' ? 'Describe the bug *' : 'Describe the problem *'}
                    </Text>
                    <TextArea
                      size="500"
                      variant="SurfaceVariant"
                      radii="400"
                      rows={4}
                      placeholder={
                        type === 'bug'
                          ? 'A clear description of what the bug is.'
                          : 'A clear description of the problem this feature would solve.'
                      }
                      value={type === 'bug' ? description : problem}
                      onChange={(e) =>
                        type === 'bug'
                          ? setDescription((e.target as HTMLTextAreaElement).value)
                          : setProblem((e.target as HTMLTextAreaElement).value)
                      }
                    />
                  </Box>

                  {/* Bug: steps to reproduce */}
                  {type === 'bug' && (
                    <Box direction="Column" gap="100">
                      <Text size="L400">Steps to reproduce (optional)</Text>
                      <TextArea
                        size="500"
                        variant="SurfaceVariant"
                        radii="400"
                        rows={3}
                        placeholder={'1. Go to…\n2. Click on…\n3. See error'}
                        value={reproduction}
                        onChange={(e) => setReproduction((e.target as HTMLTextAreaElement).value)}
                      />
                    </Box>
                  )}

                  {/* Bug: expected behavior */}
                  {type === 'bug' && (
                    <Box direction="Column" gap="100">
                      <Text size="L400">Expected behavior (optional)</Text>
                      <TextArea
                        size="500"
                        variant="SurfaceVariant"
                        radii="400"
                        rows={2}
                        placeholder="A clear description of what you expected to happen."
                        value={expectedBehavior}
                        onChange={(e) =>
                          setExpectedBehavior((e.target as HTMLTextAreaElement).value)
                        }
                      />
                    </Box>
                  )}

                  {/* Feature: solution */}
                  {type === 'feature' && (
                    <Box direction="Column" gap="100">
                      <Text size="L400">Describe the solution you&apos;d like *</Text>
                      <TextArea
                        size="500"
                        variant="SurfaceVariant"
                        radii="400"
                        rows={3}
                        placeholder="I would like to…"
                        value={solution}
                        onChange={(e) => setSolution((e.target as HTMLTextAreaElement).value)}
                      />
                    </Box>
                  )}

                  {/* Feature: alternatives */}
                  {type === 'feature' && (
                    <Box direction="Column" gap="100">
                      <Text size="L400">Alternatives considered (optional)</Text>
                      <TextArea
                        size="500"
                        variant="SurfaceVariant"
                        radii="400"
                        rows={2}
                        placeholder="Any alternative solutions or features you've considered."
                        value={alternatives}
                        onChange={(e) => setAlternatives((e.target as HTMLTextAreaElement).value)}
                      />
                    </Box>
                  )}

                  {/* Platform info for bugs */}
                  {type === 'bug' && (
                    <Box direction="Column" gap="100">
                      <Text size="L400">Platform info (auto-included)</Text>
                      <Text size="T200" style={{ opacity: 0.7, wordBreak: 'break-all' }}>
                        {`Sable v${APP_VERSION}${IS_RELEASE_TAG ? '' : '-dev'} • ${navigator.userAgent}`}
                      </Text>
                    </Box>
                  )}

                  {/* Additional context — shared */}
                  <Box direction="Column" gap="100">
                    <Text size="L400">Additional context (optional)</Text>
                    <TextArea
                      size="500"
                      variant="SurfaceVariant"
                      radii="400"
                      rows={2}
                      placeholder="Any other context or screenshots."
                      value={context}
                      onChange={(e) => setContext((e.target as HTMLTextAreaElement).value)}
                    />
                  </Box>

                  {/* Sentry integration options (only for bug reports when Sentry is configured) */}
                  {type === 'bug' && sentryEnabled && (
                    <Box direction="Column" gap="200">
                      <Text size="L400">Error Tracking</Text>
                      <Box as="label" gap="200" alignItems="Center" style={{ cursor: 'pointer' }}>
                        <Checkbox
                          variant="Primary"
                          checked={sendToSentry}
                          onClick={() => setSendToSentry((v) => !v)}
                        />
                        <Box direction="Column" gap="100" grow="Yes">
                          <Text size="T300">
                            Send anonymous report to Sentry for error tracking
                          </Text>
                          <Text size="T200" style={{ opacity: 0.7 }}>
                            Helps developers identify and fix issues faster. No personal data is
                            sent.
                          </Text>
                        </Box>
                      </Box>
                      {sendToSentry && (
                        <Box
                          as="label"
                          gap="200"
                          alignItems="Center"
                          style={{ cursor: 'pointer', paddingLeft: config.space.S400 }}
                        >
                          <Checkbox
                            variant="Primary"
                            checked={includeDebugLogs}
                            onClick={() => setIncludeDebugLogs((v) => !v)}
                          />
                          <Box direction="Column" gap="100" grow="Yes">
                            <Text size="T300">Include recent debug logs (last 100 entries)</Text>
                            <Text size="T200" style={{ opacity: 0.7 }}>
                              Provides additional context to help diagnose the issue. Logs are
                              filtered for sensitive data.
                            </Text>
                          </Box>
                        </Box>
                      )}
                      <Box as="label" gap="200" alignItems="Center" style={{ cursor: 'pointer' }}>
                        <Checkbox
                          variant="Primary"
                          checked={openOnGitHub}
                          onClick={() => setOpenOnGitHub((v) => !v)}
                        />
                        <Box direction="Column" gap="100" grow="Yes">
                          <Text size="T300">Also create a GitHub issue</Text>
                          <Text size="T200" style={{ opacity: 0.7 }}>
                            Opens a pre-filled GitHub issue in addition to the Sentry report.
                          </Text>
                        </Box>
                      </Box>
                    </Box>
                  )}

                  {/* Actions */}
                  <Box gap="300" justifyContent="End">
                    <Button size="400" variant="Secondary" fill="None" radii="400" onClick={close}>
                      <Text size="B400">Cancel</Text>
                    </Button>
                    <Button
                      size="400"
                      variant="Primary"
                      radii="400"
                      disabled={!canSubmit}
                      onClick={handleSubmit}
                      after={<Icon src={Icons.ArrowRight} size="100" />}
                    >
                      <Text size="B400">
                        {sentryEnabled && type === 'bug' ? 'Submit Report' : 'Open on GitHub'}
                      </Text>
                    </Button>
                  </Box>
                </Box>
              </Scroll>
            </Box>
          </Modal>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}

export function BugReportModalRenderer() {
  const open = useBugReportModalOpen();

  if (!open) return null;
  return <BugReportModal />;
}
