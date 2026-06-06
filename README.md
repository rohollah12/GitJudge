# GitJudge GenLayer

A simple Vercel app that takes a GitHub Issue URL and a Pull Request URL, fetches the repository data, and asks a GenLayer contract to judge whether the PR satisfies the issue.

## What this repo contains

- `app/page.tsx` — the frontend
- `app/api/analyze/route.ts` — the Vercel serverless route
- `contracts/gitjudge.py` — the GenLayer contract

## What the word "endpoint" means

The GenLayer endpoint is the RPC URL of the GenLayer network where your contract lives.

Examples from the official docs:

- Studionet: `https://studio.genlayer.com/api`
- Localnet: `http://localhost:4000/api`
- Testnet Bradbury: `https://rpc-bradbury.genlayer.com`

Your Vercel app needs this endpoint so `genlayer-js` knows which GenLayer network to talk to.

## The easiest path

1. Deploy the contract in GenLayer Studio.
2. Copy the contract address.
3. Put the endpoint and address into Vercel environment variables.
4. Deploy the app to Vercel.

## Environment variables for Vercel

Set these in your Vercel project:

- `GENLAYER_ENDPOINT`
- `GENLAYER_CONTRACT_ADDRESS`
- `GITHUB_TOKEN` (optional, recommended for higher GitHub API limits)

For a quick start with Studio, use:

- `GENLAYER_ENDPOINT=https://studio.genlayer.com/api`

## GitHub token

For public repos, the GitHub REST API can be used without authentication, but the unauthenticated primary rate limit is 60 requests per hour. Authenticated requests get a higher rate limit. So a token is optional for testing, but helpful once you use the app repeatedly. GitHub also allows repository content endpoints to be accessed without authentication for public resources.

## Contract deployment steps

1. Open GenLayer Studio.
2. Create a new contract.
3. Paste `contracts/gitjudge.py`.
4. Deploy it.
5. Copy the deployed address.
6. Paste that address into Vercel as `GENLAYER_CONTRACT_ADDRESS`.

GenLayer Studio is the zero-setup path, and GenLayer documents separate endpoints for Studio, localnet, and testnet.

## Vercel steps

1. Push this repo to GitHub.
2. Import it into Vercel.
3. Add environment variables.
4. Deploy.

## Run locally for a quick check

```bash
npm install
npm run dev
```

## Notes

- The UI is intentionally simple.
- The route calls `simulateWriteContract`, so it can simulate the contract call without executing it on-chain.
- The contract uses `gl.nondet.exec_prompt(..., response_format="json")` and a custom validator so the result stays structured and easier to compare.
