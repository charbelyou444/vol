# Rating Platform – Minimal (No DB)
Single Node/Express file backend + inline frontend. Votes stored in `data/votes.json` (flat file). No database.

## Local Run
```bash
# 1) Install deps
npm install
# 2) Start with your player list (comma-separated)
PLAYERS="player1,player2,player3" npm start
# 3) Open
# http://localhost:3000
```

## Quick Deploy (Render – free tier)
1. New **Web Service** from your GitHub repo (or deploy directly via Render CLI).
2. **Build Command:** `npm install`
3. **Start Command:** `npm start`
4. **Environment Variables:** set `PLAYERS` (e.g. `player1,player2,player3`).
5. (Optional but recommended) Add a **Persistent Disk** so `data/votes.json` survives restarts.
6. Open the Render URL.

### Railway (alternative)
1. Create a new project → Deploy from repo.
2. Add env var `PLAYERS`.
3. **Start Command:** `npm start`
4. Visit the provided URL.

> Note: Avoid serverless hosts with read-only or ephemeral filesystems (e.g., Vercel) for this step, because writes to `data/votes.json` won’t persist.
