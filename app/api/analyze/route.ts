export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from 'genlayer-js';

type RequestBody = {
  issueUrl?: string;
  prUrl?: string;
};

type GitHubIssue = {
  html_url: string;
  number: number;
  title: string;
  body: string | null;
  state: string;
  user?: { login?: string };
};

type GitHubPullRequest = {
  html_url: string;
  number: number;
  title: string;
  body: string | null;
  state: string;
  merged_at: string | null;
  base?: { ref?: string; sha?: string };
  head?: { ref?: string; sha?: string };
};

type GitHubFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
};

const URL_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)(?:\/)?$/i;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;
    const issue = parseGithubUrl(body.issueUrl, 'issues');
    const pull = parseGithubUrl(body.prUrl, 'pull');

    if (!issue || !pull) {
      return NextResponse.json(
        { error: 'Please paste a valid GitHub issue URL and pull request URL.' },
        { status: 400 }
      );
    }

    if (issue.owner !== pull.owner || issue.repo !== pull.repo) {
      return NextResponse.json(
        { error: 'Issue and PR must belong to the same repository for this MVP.' },
        { status: 400 }
      );
    }

    const githubToken = process.env.GITHUB_TOKEN?.trim();
    const github = githubApi(githubToken);

    const [issueData, prData, files, readmeText, contributingText] = await Promise.all([
      github.fetchIssue(issue.owner, issue.repo, issue.number),
      github.fetchPullRequest(pull.owner, pull.repo, pull.number),
      github.fetchPullFiles(pull.owner, pull.repo, pull.number),
      github.fetchOptionalText(issue.owner, issue.repo, 'README.md'),
      github.fetchOptionalText(issue.owner, issue.repo, 'CONTRIBUTING.md'),
    ]);

    const endpoint = process.env.GENLAYER_ENDPOINT?.trim() || 'https://studio.genlayer.com/api';
    const contractAddress = process.env.GENLAYER_CONTRACT_ADDRESS?.trim();

    if (!contractAddress) {
      return NextResponse.json(
        {
          error:
            'Missing GENLAYER_CONTRACT_ADDRESS. Deploy the contract in GenLayer Studio, then paste the address into Vercel.',
        },
        { status: 500 }
      );
    }

    const client = createClient({ endpoint });

    const evidence = buildEvidence({
      repository: `${issue.owner}/${issue.repo}`,
      issueData,
      prData,
      files,
      readmeText,
      contributingText,
    });

    const simulation = await client.simulateWriteContract({
      address: contractAddress as `0x${string}`,
      functionName: 'analyze',
      args: [JSON.stringify(evidence)],
    });

    const parsed = normalizeResult(simulation);
    return NextResponse.json({
      ...parsed,
      repository: `${issue.owner}/${issue.repo}`,
      issue: {
        title: issueData.title,
        body: truncate(issueData.body ?? '', 1000),
      },
      pull_request: {
        title: prData.title,
        body: truncate(prData.body ?? '', 1000),
      },
      used_token: Boolean(githubToken),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseGithubUrl(value: unknown, kind: 'issues' | 'pull') {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(URL_RE);
  if (!match) return null;
  const [, owner, repo, matchedKind, number] = match;
  if (matchedKind.toLowerCase() !== kind) return null;
  return { owner, repo, number: Number(number) };
}

function githubApi(token?: string) {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'GitJudge-GenLayer',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  async function requestJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers, cache: 'no-store' });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitHub API error ${res.status}: ${text || res.statusText}`);
    }

    return (await res.json()) as T;
  }

  async function fetchOptionalText(owner: string, repo: string, path: string) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
    const res = await fetch(url, { headers, cache: 'no-store' });

    if (!res.ok) return '';
    const data = (await res.json()) as { content?: string; encoding?: string };

    if (!data.content) return '';
    if (data.encoding !== 'base64') return '';

    return Buffer.from(data.content, 'base64').toString('utf8');
  }

  return {
    fetchIssue: (owner: string, repo: string, number: number) =>
      requestJson<GitHubIssue>(`https://api.github.com/repos/${owner}/${repo}/issues/${number}`),
    fetchPullRequest: (owner: string, repo: string, number: number) =>
      requestJson<GitHubPullRequest>(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`),
    fetchPullFiles: async (owner: string, repo: string, number: number) => {
      const files = await requestJson<GitHubFile[]>(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`
      );

      return files.map((file) => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: truncate(file.patch ?? '', 1800),
      }));
    },
    fetchOptionalText,
  };
}

function buildEvidence(input: {
  repository: string;
  issueData: GitHubIssue;
  prData: GitHubPullRequest;
  files: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch: string;
  }>;
  readmeText: string;
  contributingText: string;
}) {
  return {
    repository: input.repository,
    issue: {
      number: input.issueData.number,
      title: truncate(input.issueData.title, 300),
      body: truncate(input.issueData.body ?? '', 4000),
      state: input.issueData.state,
      url: input.issueData.html_url,
      author: input.issueData.user?.login ?? '',
    },
    pull_request: {
      number: input.prData.number,
      title: truncate(input.prData.title, 300),
      body: truncate(input.prData.body ?? '', 4000),
      state: input.prData.state,
      merged_at: input.prData.merged_at,
      base_ref: input.prData.base?.ref ?? '',
      head_ref: input.prData.head?.ref ?? '',
      url: input.prData.html_url,
    },
    changed_files: input.files.slice(0, 40),
    repo_docs: {
      readme: truncate(input.readmeText, 5000),
      contributing: truncate(input.contributingText, 3500),
    },
    instructions:
      'Judge whether the pull request actually satisfies the issue and repository docs. Return compact JSON only.',
  };
}

function normalizeResult(value: unknown) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return { raw: value };
    }
  }

  if (value && typeof value === 'object') {
    return value;
  }

  return { raw: String(value) };
}

function truncate(text: string, limit: number) {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n...[truncated]`;
}
