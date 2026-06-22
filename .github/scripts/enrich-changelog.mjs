#!/usr/bin/env node
/* oxlint-disable no-console */
/**
 * Replaces Knope commit markers with PR links and credits every human commit author.
 *
 * Usage:
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo node .github/scripts/enrich-changelog.mjs [options]
 *
 * Options:
 *   --file <path>           Changelog to enrich (default: CHANGELOG.md)
 *   --dry-run               Print enriched output without writing files or updating PRs
 *   --update-release-pr     Also enrich the open release PR body and apply the internal label
 */

import fs from 'node:fs';

const BOT_USER_TYPE = 'Bot';
const COMMIT_MARKER = /<!-- commit:([0-9a-f]+) -->/g;

function parseArgs(argv) {
  const opts = {
    file: 'CHANGELOG.md',
    dryRun: false,
    updateReleasePr: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--update-release-pr') opts.updateReleasePr = true;
    else if (arg === '--file') opts.file = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log(`See the header comment in ${import.meta.url}`);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return opts;
}

function isBot(user) {
  if (!user?.login) return true;
  if (user.type === BOT_USER_TYPE) return true;
  return user.login.endsWith('[bot]');
}

function parseRepository() {
  const repoEnv = process.env.GITHUB_REPOSITORY;
  if (!repoEnv?.includes('/')) {
    throw new Error('Set GITHUB_REPOSITORY to owner/repo (e.g. CloudHub-Social/Charm).');
  }
  const [owner, repo] = repoEnv.split('/');
  return { owner, repo };
}

function setSearchParams(url, params) {
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue;
    if (typeof value === 'string' || typeof value === 'number') {
      url.searchParams.set(key, String(value));
    }
  }
}

async function githubRequest(token, path, { params, method = 'GET', body, accept } = {}) {
  const url = new URL(`https://api.github.com${path}`);
  setSearchParams(url, params);

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: accept ?? 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'sable-changelog-enrich',
  };

  const init = { method, headers };
  if (body != null && method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${response.status} ${path}: ${text}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function fetchPullRequestCommitPage(token, owner, repo, pullNumber, page, commits) {
  const batch = await githubRequest(token, `/repos/${owner}/${repo}/pulls/${pullNumber}/commits`, {
    params: { per_page: 100, page },
  });
  commits.push(...batch);
  if (batch.length < 100) return commits;
  return fetchPullRequestCommitPage(token, owner, repo, pullNumber, page + 1, commits);
}

async function listPullRequestCommits(token, owner, repo, pullNumber) {
  return fetchPullRequestCommitPage(token, owner, repo, pullNumber, 1, []);
}

async function getPullRequestContributors(token, owner, repo, pullNumber, cache) {
  if (cache.has(pullNumber)) return cache.get(pullNumber);

  const commits = await listPullRequestCommits(token, owner, repo, pullNumber);
  const logins = new Set();

  const contributorFilesOutside = new Map();

  for (const commit of commits) {
    const author = commit.author;
    if (author?.login && !isBot(author)) {
      const login = author.login;
      if (!contributorFilesOutside.has(login)) {
        contributorFilesOutside.set(login, false);
      }
    }
  }

  await Promise.all(
    commits.map(async (commit) => {
      const author = commit.author;
      if (author?.login && !isBot(author)) {
        const login = author.login;
        try {
          const detail = await githubRequest(
            token,
            `/repos/${owner}/${repo}/commits/${commit.sha}`
          );
          const files = detail.files || [];
          const hasOutside = files.some((f) => !f.filename.startsWith('.changeset/'));
          if (hasOutside) {
            contributorFilesOutside.set(login, true);
          }
        } catch (error) {
          console.error(`Failed to fetch details for commit ${commit.sha}:`, error);
          // treat as modified outside to avoid missing a contributor on API failure
          contributorFilesOutside.set(login, true);
        }
      }
    })
  );

  for (const [login, hasOutside] of contributorFilesOutside.entries()) {
    if (hasOutside) {
      logins.add(login);
    }
  }

  const contributors = [...logins].toSorted((a, b) => a.localeCompare(b, 'en'));
  cache.set(pullNumber, contributors);
  return contributors;
}

function formatPullRequestCredit(pr, contributors) {
  const link = `[#${pr.number}](<${pr.html_url}>)`;
  if (contributors.length === 0) return `(${link})`;
  const byline = contributors.map((login) => `@${login}`).join(', ');
  return `(${link} by ${byline})`;
}

async function resolveCommitMarker(token, owner, repo, hash, contributorCache) {
  try {
    const associated = await githubRequest(token, `/repos/${owner}/${repo}/commits/${hash}/pulls`, {
      accept: 'application/vnd.github.groot-preview+json',
    });
    const pr = associated[0];
    if (!pr) return `(\`${hash}\`)`;

    const contributors = await getPullRequestContributors(
      token,
      owner,
      repo,
      pr.number,
      contributorCache
    );
    return formatPullRequestCredit(pr, contributors);
  } catch {
    return `(\`${hash}\`)`;
  }
}

async function enrichText(token, owner, repo, text, contributorCache) {
  const hashes = [...new Set([...text.matchAll(COMMIT_MARKER)].map((match) => match[1]))];
  const credits = await Promise.all(
    hashes.map(async (hash) => ({
      hash,
      credit: await resolveCommitMarker(token, owner, repo, hash, contributorCache),
    }))
  );

  let enriched = text;
  for (const { hash, credit } of credits) {
    enriched = enriched.replaceAll(`<!-- commit:${hash} -->`, credit);
  }
  return enriched;
}

async function ensureLabel(token, owner, repo, name, color) {
  try {
    await githubRequest(token, `/repos/${owner}/${repo}/labels/${encodeURIComponent(name)}`);
  } catch (error) {
    if (!String(error.message).includes('404')) throw error;
    await githubRequest(token, `/repos/${owner}/${repo}/labels`, {
      method: 'POST',
      body: { name, color },
    });
  }
}

async function updateReleasePullRequest(token, owner, repo, contributorCache, dryRun) {
  const openPulls = await githubRequest(token, `/repos/${owner}/${repo}/pulls`, {
    params: { head: `${owner}:release`, state: 'open' },
  });
  if (openPulls.length === 0) {
    console.warn('No open PR found for the release branch.');
    return;
  }

  const releasePr = openPulls[0];
  const enrichedBody = await enrichText(token, owner, repo, releasePr.body ?? '', contributorCache);

  if (dryRun) {
    console.log('--- release PR body (dry run) ---\n');
    console.log(enrichedBody);
    return;
  }

  const label = 'internal';
  await ensureLabel(token, owner, repo, label, 'e4e669');
  await Promise.all([
    githubRequest(token, `/repos/${owner}/${repo}/pulls/${releasePr.number}`, {
      method: 'PATCH',
      body: { body: enrichedBody },
    }),
    githubRequest(token, `/repos/${owner}/${repo}/issues/${releasePr.number}/labels`, {
      method: 'POST',
      body: { labels: [label] },
    }),
  ]);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      'Set GITHUB_TOKEN to a token with repo read access (and write for --update-release-pr).'
    );
  }

  const { owner, repo } = parseRepository();
  const contributorCache = new Map();

  if (!fs.existsSync(opts.file)) {
    console.warn(`Changelog file not found: ${opts.file}`);
  } else {
    const original = fs.readFileSync(opts.file, 'utf8');
    const enriched = await enrichText(token, owner, repo, original, contributorCache);

    if (opts.dryRun) {
      console.log(enriched);
    } else {
      fs.writeFileSync(opts.file, enriched);
    }
  }

  if (opts.updateReleasePr) {
    await updateReleasePullRequest(token, owner, repo, contributorCache, opts.dryRun);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
