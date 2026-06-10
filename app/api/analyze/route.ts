export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from 'genlayer-js';

type RequestBody = {
  issueUrl?: string;
  prUrl?: string;
};

type GitHubIssue = {
  html_url?: string;
  title?: string;
  body?: string | null;
  number?: number;
  state?: string;
};

type GitHubPr = {
  html_url?: string;
  title?: string;
  body?: string | null;
  number?: number;
  state?: string;
  mergeable?: boolean | null;
  draft?: boolean;
};

type GitHubFile = {
  filename?: string;
  status?: string;
  additions?: number;
  deletions?: number;
  changes?: number;
  patch?: string | null;
};

const URL_RE =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)(?:\/)?$/i;

/* ---------------- MAIN HANDLER ---------------- */

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;

    const issue = parseGithubUrl(body.issueUrl, 'issues');
    const pull = parseGithubUrl(body.prUrl, 'pull');

    if (!issue || !pull) {
      return NextResponse.json(
        { error: 'Invalid GitHub issue or PR URL' },
        { status: 400 }
      );
    }

    if (issue.owner !== pull.owner || issue.repo !== pull.repo) {
      return NextResponse.json(
        { error: 'Issue and PR must belong to the same repo' },
        { status: 400 }
      );
    }

    const github = githubApi(process.env.GITHUB_TOKEN);

    const [issueData, prData, files] = await Promise.all([
      github.fetchIssue(issue.owner, issue.repo, issue.number),
      github.fetchPullRequest(pull.owner, pull.repo, pull.number),
      github.fetchPullFiles(pull.owner, pull.repo, pull.number),
    ]);

    const evidence = buildEvidence({
      repository: `${issue.owner}/${issue.repo}`,
      issueData,
      prData,
      files,
    });

    const contractAddress = mustEnv('GENLAYER_CONTRACT_ADDRESS');
    const endpoint =
      process.env.GENLAYER_ENDPOINT?.trim() || 'https://studio.genlayer.com/api';

    const client = createClient({ endpoint });

    const txHash = await client.writeContract({
      address: contractAddress as `0x${string}`,
      functionName: 'analyze',
      args: [JSON.stringify(evidence)],
    });

    await client.waitForTransactionReceipt({
      hash: txHash,
      status: 'FINALIZED',
    });

    const rawResult = await client.readContract({
      address: contractAddress as `0x${string}`,
      functionName: 'get_last_result',
      args: [],
    });

    const result = normalizeResult(rawResult);

    return NextResponse.json({
      result,
      repository: `${issue.owner}/${issue.repo}`,
      used_token: Boolean(process.env.GITHUB_TOKEN?.trim()),
      issue: {
        title: issueData.title,
        body: issueData.body ?? '',
      },
      pull_request: {
        title: prData.title,
        body: prData.body ?? '',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/* ---------------- GITHUB ---------------- */

function parseGithubUrl(value: unknown, kind: 'issues' | 'pull') {
  if (typeof value !== 'string') return null;

  const match = value.match(URL_RE);
  if (!match) return null;

  const [, owner, repo, type, number] = match;

  if (type !== kind) return null;

  return { owner, repo, number: Number(number) };
}

function githubApi(token?: string) {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'GitJudge',
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  async function request<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`GitHub API error (${res.status}): ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  return {
    fetchIssue: (o: string, r: string, n: number) =>
      request<GitHubIssue>(`https://api.github.com/repos/${o}/${r}/issues/${n}`),

    fetchPullRequest: (o: string, r: string, n: number) =>
      request<GitHubPr>(`https://api.github.com/repos/${o}/${r}/pulls/${n}`),

    fetchPullFiles: (o: string, r: string, n: number) =>
      request<GitHubFile[]>(`https://api.github.com/repos/${o}/${r}/pulls/${n}/files`),
  };
}

/* ---------------- LOGIC ---------------- */

function buildEvidence(input: {
  repository: string;
  issueData: GitHubIssue;
  prData: GitHubPr;
  files: GitHubFile[];
}) {
  return {
    repository: input.repository,
    issue: {
      number: input.issueData.number ?? null,
      title: input.issueData.title ?? '',
      body: trimText(input.issueData.body ?? '', 12000),
      html_url: input.issueData.html_url ?? '',
      state: input.issueData.state ?? '',
    },
    pull_request: {
      number: input.prData.number ?? null,
      title: input.prData.title ?? '',
      body: trimText(input.prData.body ?? '', 12000),
      html_url: input.prData.html_url ?? '',
      state: input.prData.state ?? '',
      mergeable: input.prData.mergeable ?? null,
      draft: Boolean(input.prData.draft),
    },
    files: (input.files || []).slice(0, 20).map((file) => ({
      filename: file.filename ?? '',
      status: file.status ?? '',
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
      changes: file.changes ?? 0,
      patch: trimText(file.patch ?? '', 4000),
    })),
  };
}

function normalizeResult(v: unknown) {
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return { raw: v };
    }
  }
  return v;
}

function trimText(text: string, limit: number) {
  const value = text ?? '';
  return value.length > limit ? `${value.slice(0, limit)}\n...[truncated]` : value;
}

function mustEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}
