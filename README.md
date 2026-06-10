# GitJudge

GenLayer-powered GitHub PR judge.

## What to do

1. Deploy `contracts/gitjudge.py` in GenLayer Studio.
2. Copy the contract address.
3. Put the project on GitHub.
4. Import the repo into Vercel.
5. Add environment variables:
   - `GENLAYER_ENDPOINT`
   - `GENLAYER_CONTRACT_ADDRESS`
   - `GITHUB_TOKEN` optional
6. Deploy and test with an issue URL and PR URL.

## Files

- `app/page.tsx`
- `app/api/analyze/route.ts`
- `contracts/gitjudge.py`
