export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import {
  decodeFunctionResult,
  encodeFunctionData,
  type Hex,
} from 'viem';

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

const CONTRACT_ABI = [
  {
    type: 'function',
    name: 'analyze',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'evidence_json', type: 'string' }],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

/* ---------------- MAIN HANDLER ---------------- */

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;

    const issue = parseGithubUrl(body.issueUrl, 'issues');
    const pull = parseGithubUrl(body.prUrl, 'pull');

    if (!issue || !pull) {
      return NextResponse.json(
        { error: 'Invalid GitHub issue or PR URL' },
        { status: 400 },
      );
    }

    if (issue.owner !== pull.owner || issue.repo !== pull.repo) {
      return NextResponse.json(
        { error: 'Issue and PR must belong to the same repo' },
        { status: 400 },
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
    const fromAddress = mustEnv('GENLAYER_FROM_ADDRESS');
    const endpoint =
      process.env.GENLAYER_ENDPOINT?.trim() || 'https://studio.genlayer.com/api';

    const result = await callGenLayer(endpoint, fromAddress, contractAddress, evidence);

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
      { status: 500 },
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

/* ---------------- GENLAYER ---------------- */

async function callGenLayer(
  endpoint: string,
  fromAddress: string,
  contractAddress: string,
  evidence: Record<string, unknown>,
) {
  const encodedData = encodeFunctionData({
    abi: CONTRACT_ABI,
    functionName: 'analyze',
    args: [JSON.stringify(evidence)],
  });

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'gen_call',
      params: [
        {
          from: fromAddress,
          to: contractAddress,
          data: encodedData,
          type: 'write',
          gas: '0x5208',
          value: '0x0',
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GenLayer HTTP error (${res.status}): ${text}`);
  }

  const payload = await res.json();

  if (payload?.error) {
    throw new Error(`GenLayer RPC error: ${JSON.stringify(payload.error)}`);
  }

  const result = payload?.result ?? payload;

  if (result?.status?.code && result.status.code !== 0) {
    throw new Error(`GenLayer execution error: ${result.status.message ?? 'unknown'}`);
  }

  const hexData = result?.data;
  if (typeof hexData === 'string' && hexData.startsWith('0x')) {
    const decoded = decodeFunctionResult({
      abi: CONTRACT_ABI,
      functionName: 'analyze',
      data: hexData as Hex,
    });

    if (typeof decoded === 'string') return normalizeResult(decoded);
    return normalizeResult(String(decoded));
  }

  return normalizeResult(hexData ?? result);
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
