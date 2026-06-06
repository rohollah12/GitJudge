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
        { error: 'Please provide valid GitHub issue and PR URLs.' },
        { status: 400 }
      );
    }

    if (issue.owner !== pull.owner || issue.repo !== pull.repo) {
      return NextResponse.json(
        { error: 'Issue and PR must belong to same repo.' },
        { status: 400 }
      );
    }

    const githubToken = process.env.GITHUB_TOKEN?.trim();
    const github = githubApi(githubToken);

    const [issueData, prData, files, readmeText, contributingText] =
      await Promise.all([
        github.fetchIssue(issue.owner, issue.repo, issue.number),
        github.fetchPullRequest(pull.owner, pull.repo, pull.number),
        github.fetchPullFiles(pull.owner, pull.repo, pull.number),
        github.fetchOptionalText(issue.owner, issue.repo, 'README.md'),
        github.fetchOptionalText(issue.owner, issue.repo, 'CONTRIBUTING.md'),
      ]);

    const contractAddress = process.env.GENLAYER_CONTRACT_ADDRESS?.trim();

    if (!contractAddress) {
      return NextResponse.json(
        { error: 'Missing GENLAYER_CONTRACT_ADDRESS' },
        { status: 500 }
      );
    }

    const client = createClient({ endpoint: process.env.GENLAYER_ENDPOINT || 'https://studio.genlayer.com/api' });

    const evidence = buildEvidence({
      repository: `${issue.owner}/${issue.repo}`,
      issueData,
      prData,
      files,
      readmeText,
      contributingText,
    });

    const simulation = await callGenLayerSimulation(
      client,
      contractAddress,
      evidence
    );

    return NextResponse.json({
      result: normalizeResult(simulation),
      repository: `${issue.owner}/${issue.repo}`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  return {
    fetchIssue: (o: string, r: string, n: number) =>
      request<GitHubIssue>(
        `https://api.github.com/repos/${o}/${r}/issues/${n}`
      ),

    fetchPullRequest: (o: string, r: string, n: number) =>
      request<GitHubPullRequest>(
        `https://api.github.com/repos/${o}/${r}/pulls/${n}`
      ),

    fetchPullFiles: (o: string, r: string, n: number) =>
      request<GitHubFile[]>(
        `https://api.github.com/repos/${o}/${r}/pulls/${n}/files`
      ),

    fetchOptionalText: async (o: string, r: string, path: string) => {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${o}/${r}/contents/${path}`
        );
        if (!res.ok) return '';
        const data: any = await res.json();
        if (!data.content) return '';
        return Buffer.from(data.content, 'base64').toString('utf8');
      } catch {
        return '';
      }
    },
  };
}

async function callGenLayerSimulation(
  client: any,
  address: string,
  evidence: any
) {
  return await client.simulateWriteContract({
    address: address as `0x${string}`,
    functionName: 'analyze',
    args: [JSON.stringify(evidence)],
  });
}

function buildEvidence(input: any) {
  return {
    repository: input.repository,
    issue: input.issueData.title,
    pull_request: input.prData.title,
    files: input.files?.slice(0, 20),
  };
}

function normalizeResult(v: any) {
  try {
    return typeof v === 'string' ? JSON.parse(v) : v;
  } catch {
    return { raw: String(v) };
  }
}
