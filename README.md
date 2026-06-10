# GitJudge

GitJudge is a GenLayer-powered PR judge for GitHub issues and pull requests.

## What it does

- Takes a GitHub Issue URL and PR URL
- Fetches issue, PR, and changed files
- Sends evidence to a deployed GenLayer contract
- Shows the verdict in the frontend

## Files

- `app/page.tsx` — frontend
- `app/api/analyze/route.ts` — Vercel serverless API route
- `contracts/gitjudge.py` — GenLayer contract

## Required environment variables

- `GENLAYER_ENDPOINT`
- `GENLAYER_CONTRACT_ADDRESS`
- `GENLAYER_FROM_ADDRESS`
- `GITHUB_TOKEN` optional

## Deploy steps

1. Upload the project to GitHub.
2. Deploy `contracts/gitjudge.py` in GenLayer Studio.
3. Copy the contract address.
4. Copy your GenLayer caller address into `GENLAYER_FROM_ADDRESS`.
5. Deploy the repo on Vercel.
6. Add environment variables.
7. Open the app and test with Issue / PR URLs.
