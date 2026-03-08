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
} from 'folds';
import { useCloseBugReportModal, useBugReportModalOpen } from '$state/hooks/bugReportModal';
import { stopPropagation } from '$utils/keyboard';

type ReportType = 'bug' | 'feature';

type SimilarIssue = {
  number: number;
  title: string;
  html_url: string;
};

const GITHUB_REPO = '7w1/sable';

async function searchSimilarIssues(query: string, signal: AbortSignal): Promise<SimilarIssue[]> {
  const params = new URLSearchParams({
    q: `${query} repo:${GITHUB_REPO} is:issue is:open`,
    per_page: '5',
  });
  const res = await fetch(`https://api.github.com/search/issues?${params}`, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: SimilarIssue[] };
  return data.items ?? [];
}

function buildGitHubUrl(
  type: ReportType,
  title: string,
  description: string,
  steps: string,
  solution: string
): string {
  const devLabel = IS_RELEASE_TAG ? '' : '-dev';
  const buildLabel = BUILD_HASH ? ` (${BUILD_HASH})` : '';
  const version = `v${APP_VERSION}${devLabel}${buildLabel}`;

  let body: string;
  if (type === 'bug') {
    const sections: string[] = [
      `**Describe the bug**\n\n${description}`,
      steps ? `**Reproduction**\n\n${steps}` : '',
      `**Platform and versions**\n\n- Sable: ${version}\n- Browser: ${navigator.userAgent}`,
    ];
    body = sections.filter(Boolean).join('\n\n---\n\n');
  } else {
    const sections: string[] = [
      `**Describe the problem**\n\n${description}`,
      solution ? `**Describe the solution you'd like**\n\n${solution}` : '',
    ];
    body = sections.filter(Boolean).join('\n\n---\n\n');
  }

  const params = new URLSearchParams({ title, body });
  if (type === 'bug') params.set('labels', 'bug');
  if (type === 'feature') params.set('labels', 'enhancement');
  return `https://github.com/${GITHUB_REPO}/issues/new?${params}`;
}

function BugReportModal() {
  const close = useCloseBugReportModal();
  const [type, setType] = useState<ReportType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [solution, setSolution] = useState('');
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

  const canSubmit = title.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const url = buildGitHubUrl(
      type,
      title.trim(),
      description.trim(),
      steps.trim(),
      solution.trim()
    );
    window.open(url, '_blank', 'noopener,noreferrer');
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
                      value={description}
                      onChange={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
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
                        value={steps}
                        onChange={(e) => setSteps((e.target as HTMLTextAreaElement).value)}
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

                  {/* Platform info for bugs */}
                  {type === 'bug' && (
                    <Box direction="Column" gap="100">
                      <Text size="L400">Platform info (auto-included)</Text>
                      <Text size="T200" style={{ opacity: 0.7, wordBreak: 'break-all' }}>
                        {`Sable v${APP_VERSION}${IS_RELEASE_TAG ? '' : '-dev'} • ${navigator.userAgent}`}
                      </Text>
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
                      <Text size="B400">Open on GitHub</Text>
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
