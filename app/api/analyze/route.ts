export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

type RequestBody = {
  issueUrl?: string;
  prUrl?: string;
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
        { error: 'Issue and PR must belong to same repo' },
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

    const contractAddress = process.env.GENLAYER_CONTRACT_ADDRESS?.trim();
    if (!contractAddress) {
      return NextResponse.json(
        { error: 'Missing GENLAYER_CONTRACT_ADDRESS' },
        { status: 500 }
      );
    }

    const result = await callGenLayer(contractAddress, evidence);

    return NextResponse.json({
      result: normalizeResult(result),
      repository: `${issue.owner}/${issue.repo}`,
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
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  return {
    fetchIssue: (o: string, r: string, n: number) =>
      request(
        `https://api.github.com/repos/${o}/${r}/issues/${n}`
      ),

    fetchPullRequest: (o: string, r: string, n: number) =>
      request(
        `https://api.github.com/repos/${o}/${r}/pulls/${n}`
      ),

    fetchPullFiles: (o: string, r: string, n: number) =>
      request(
        `https://api.github.com/repos/${o}/${r}/pulls/${n}/files`
      ),
  };
}

/* ---------------- GENLAYER (DIRECT JSON-RPC) ---------------- */

async function callGenLayer(address: string, evidence: any) {
  const endpoint =
    process.env.GENLAYER_ENDPOINT ||
    'https://studio.genlayer.com/api';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: process.env.GENLAYER_API_KEY
        ? `Bearer ${process.env.GENLAYER_API_KEY}`
        : '',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'gen_call',
      params: {
        address,
        functionName: 'analyze',
        args: [JSON.stringify(evidence)],
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GenLayer error: ${text}`);
  }

  const data = await res.json();

  // JSON-RPC result unwrap
  return data?.result ?? data;
}

/* ---------------- LOGIC ---------------- */

function buildEvidence(input: any) {
  return {
    repository: input.repository,
    issue: input.issueData?.title,
    pull_request: input.prData?.title,
    files: (input.files || []).slice(0, 20),
  };
}

function normalizeResult(v: any) {
  try {
    return typeof v === 'string' ? JSON.parse(v) : v;
  } catch {
    return { raw: String(v) };
  }
}
