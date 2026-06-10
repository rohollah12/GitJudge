'use client';

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

type AnalysisResult = {
  decision?: 'PASS' | 'FAIL' | string;
  score?: number;
  summary?: string;
  requirements_met?: string[];
  missing?: string[];
  risk_flags?: string[];
  repository?: string;
  used_token?: boolean;
  issue?: { title?: string; body?: string };
  pull_request?: { title?: string; body?: string };
  error?: string;
};

const exampleIssue = 'https://github.com/microsoft/vscode-pull-request-github/issues/4508';
const examplePr = 'https://github.com/microsoft/vscode-pull-request-github/pull/4686';

export default function Page() {
  const [issueUrl, setIssueUrl] = useState(exampleIssue);
  const [prUrl, setPrUrl] = useState(examplePr);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState('');

  const canAnalyze = useMemo(() => Boolean(issueUrl.trim() && prUrl.trim() && !loading), [issueUrl, prUrl, loading]);

  async function handleAnalyze() {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueUrl, prUrl }),
      });

      const data = (await response.json()) as AnalysisResult;

      if (!response.ok) throw new Error(data?.error ?? 'Analysis failed');
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={pageStyle}>
      <section style={heroStyle}>
        <div style={pillStyle}>GitJudge · GenLayer</div>
        <h1 style={titleStyle}>Judge a GitHub PR with one contract call.</h1>
        <p style={subtitleStyle}>
          Paste an issue URL and a pull request URL. The route fetches GitHub data,
          sends it to your deployed GenLayer contract, and renders the verdict.
        </p>
      </section>

      <section style={cardStyle}>
        <label style={fieldStyle}>
          <span style={labelTextStyle}>Issue URL</span>
          <input value={issueUrl} onChange={(e) => setIssueUrl(e.target.value)} placeholder={exampleIssue} style={inputStyle} />
        </label>

        <label style={fieldStyle}>
          <span style={labelTextStyle}>Pull Request URL</span>
          <input value={prUrl} onChange={(e) => setPrUrl(e.target.value)} placeholder={examplePr} style={inputStyle} />
        </label>

        <button onClick={handleAnalyze} disabled={!canAnalyze} style={buttonStyle(canAnalyze)}>
          {loading ? 'Analyzing…' : 'Analyze with GenLayer'}
        </button>

        <p style={hintStyle}>
          Deploy the contract once in GenLayer Studio, then paste the contract address into Vercel.
        </p>
      </section>

      {error ? <div style={errorStyle}>{error}</div> : null}

      {result ? (
        <section style={resultGridStyle}>
          <div style={resultCardStyle}>
            <div style={metricLabelStyle}>Decision</div>
            <div style={decisionStyle(result.decision)}>{result.decision ?? '—'}</div>
          </div>
          <div style={resultCardStyle}>
            <div style={metricLabelStyle}>Score</div>
            <div style={scoreStyle}>{typeof result.score === 'number' ? `${result.score}/100` : '—'}</div>
          </div>
          <div style={wideCardStyle}>
            <div style={sectionLabelStyle}>Summary</div>
            <p style={bodyTextStyle}>{result.summary ?? 'No summary returned.'}</p>
          </div>
          <ListCard title="Requirements met" items={result.requirements_met ?? []} />
          <ListCard title="Missing" items={result.missing ?? []} />
          <ListCard title="Risk flags" items={result.risk_flags ?? []} />
          <div style={wideCardStyle}>
            <div style={sectionLabelStyle}>Repository</div>
            <p style={bodyTextStyle}>{result.repository ?? '—'}</p>
          </div>
          <div style={wideCardStyle}>
            <div style={sectionLabelStyle}>Source snapshot</div>
            <pre style={preStyle}>{JSON.stringify(result, null, 2)}</pre>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={resultCardStyle}>
      <div style={sectionLabelStyle}>{title}</div>
      {items.length ? (
        <ul style={listStyle}>
          {items.map((item, index) => (
            <li key={`${title}-${index}`} style={listItemStyle}>{item}</li>
          ))}
        </ul>
      ) : (
        <p style={mutedTextStyle}>None</p>
      )}
    </div>
  );
}

const pageStyle: CSSProperties = { maxWidth: 1050, margin: '0 auto', padding: '40px 20px 72px' };
const heroStyle: CSSProperties = { display: 'grid', gap: 14, marginBottom: 24 };
const pillStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', width: 'fit-content', padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(148, 163, 184, 0.22)', background: 'rgba(15, 23, 42, 0.65)', color: '#93c5fd', fontWeight: 700, fontSize: 13, letterSpacing: 0.2 };
const titleStyle: CSSProperties = { margin: 0, fontSize: 'clamp(36px, 6vw, 60px)', lineHeight: 1.02, letterSpacing: -1.8, maxWidth: 900 };
const subtitleStyle: CSSProperties = { margin: 0, maxWidth: 820, fontSize: 18, lineHeight: 1.65, color: '#cbd5e1' };
const cardStyle: CSSProperties = { display: 'grid', gap: 16, padding: 20, borderRadius: 26, border: '1px solid rgba(148, 163, 184, 0.16)', background: 'rgba(8, 17, 31, 0.86)', boxShadow: '0 30px 100px rgba(0, 0, 0, 0.32)', backdropFilter: 'blur(12px)' };
const fieldStyle: CSSProperties = { display: 'grid', gap: 8 };
const labelTextStyle: CSSProperties = { color: '#93c5fd', fontWeight: 700, fontSize: 14 };
const inputStyle: CSSProperties = { width: '100%', borderRadius: 16, border: '1px solid rgba(148, 163, 184, 0.18)', background: 'rgba(15, 23, 42, 0.9)', color: '#e5e7eb', padding: '14px 16px', outline: 'none' };
const buttonStyle = (enabled: boolean): CSSProperties => ({ border: 'none', borderRadius: 16, padding: '14px 18px', fontWeight: 800, color: 'white', cursor: enabled ? 'pointer' : 'not-allowed', background: enabled ? 'linear-gradient(135deg, #60a5fa 0%, #7c3aed 100%)' : 'rgba(71, 85, 105, 0.9)', boxShadow: enabled ? '0 18px 30px rgba(59, 130, 246, 0.22)' : 'none' });
const hintStyle: CSSProperties = { margin: 0, color: '#94a3b8', lineHeight: 1.6, fontSize: 14 };
const errorStyle: CSSProperties = { marginTop: 18, padding: 16, borderRadius: 18, border: '1px solid rgba(248, 113, 113, 0.3)', background: 'rgba(127, 29, 29, 0.35)', color: '#fecaca' };
const resultGridStyle: CSSProperties = { marginTop: 20, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' };
const resultCardStyle: CSSProperties = { padding: 18, borderRadius: 22, border: '1px solid rgba(148, 163, 184, 0.14)', background: 'rgba(15, 23, 42, 0.78)' };
const wideCardStyle: CSSProperties = { gridColumn: '1 / -1', padding: 18, borderRadius: 22, border: '1px solid rgba(148, 163, 184, 0.14)', background: 'rgba(15, 23, 42, 0.78)' };
const metricLabelStyle: CSSProperties = { color: '#94a3b8', fontSize: 13, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 };
const decisionStyle = (decision?: string): CSSProperties => ({ fontSize: 30, fontWeight: 900, color: decision === 'PASS' ? '#86efac' : decision === 'FAIL' ? '#fca5a5' : '#e5e7eb' });
const scoreStyle: CSSProperties = { fontSize: 30, fontWeight: 900, color: '#f8fafc' };
const sectionLabelStyle: CSSProperties = { fontSize: 13, color: '#93c5fd', fontWeight: 800, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 };
const bodyTextStyle: CSSProperties = { margin: 0, lineHeight: 1.7, color: '#e2e8f0' };
const mutedTextStyle: CSSProperties = { margin: 0, color: '#94a3b8' };
const listStyle: CSSProperties = { margin: 0, paddingLeft: 18, display: 'grid', gap: 8 };
const listItemStyle: CSSProperties = { lineHeight: 1.5, color: '#e2e8f0' };
const preStyle: CSSProperties = { margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#cbd5e1', lineHeight: 1.6 };
