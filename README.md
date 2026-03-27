# ⚾ MLB Beat the Book — Analyzer

A disciplined MLB betting tool that pulls **real data from the official MLB Stats API** and **live odds from 8+ sportsbooks via The Odds API**, then applies the "Beat the Book" strategy using Claude AI analysis. It will say **NO BET** when criteria aren't met.

## What it does

1. Fetches today's schedule + probable pitchers from `statsapi.mlb.com` (official, free)
2. Pulls live moneyline odds from DraftKings, FanDuel, BetMGM, Caesars, Bovada, ESPN BET, and more
3. Finds the **best available price** for each side and **which book to use**
4. Pulls pitcher season stats: ERA, WHIP, K/9 (real, from MLB API)
5. Fetches team bullpen ERAs
6. Sends all real data to Claude for strategy analysis + xFIP estimates + recent form
7. Only recommends a BET if **3 of 4 criteria** are met:
   - Pitching edge (WHIP/K9 mismatch)
   - Price no worse than −150 (checked against REAL live odds)
   - Sharp money / reverse line movement signal
   - Bullpen ERA gap ≥ 1.30

---

## Deploy in 5 minutes

### Step 1 — Get your API keys

**Anthropic API key** (required):
Go to [console.anthropic.com](https://console.anthropic.com) → API Keys → Create key.

**The Odds API key** (free, highly recommended):
Go to [the-odds-api.com](https://the-odds-api.com) → Get API Key → free tier gives 500 credits/month.
Each daily analysis uses ~15 credits → ~33 analyses/month free. Paid plans from $30/mo for 20K credits.

### Step 2 — Push to GitHub
```bash
git init
git add .
git commit -m "MLB analyzer — initial commit"
git remote add origin https://github.com/YOUR_USERNAME/mlb-analyzer.git
git push -u origin main
```

### Step 3 — Deploy to Vercel (free)
1. Go to [vercel.com](https://vercel.com) → New Project
2. Import your GitHub repo
3. In **Environment Variables**, add:
   - `ANTHROPIC_API_KEY` = `sk-ant-your-key-here`
   - `ODDS_API_KEY` = `your-odds-api-key` (optional but enables live odds)
4. Click Deploy

---

## Run locally

```bash
npm install

cp .env.local.example .env.local
# Add ANTHROPIC_API_KEY and ODDS_API_KEY to .env.local

npm run dev
# Open http://localhost:3000
```

---

## Data sources

| Data | Source | Cost |
|------|--------|------|
| Schedule + probable pitchers | MLB Stats API (official) | Free |
| Pitcher ERA, WHIP, K/9 | MLB Stats API (official) | Free |
| Team bullpen ERA | MLB Stats API (official) | Free |
| Live moneylines (8+ books) | The Odds API | Free tier: 500 credits/mo |
| Best book recommendation | The Odds API + logic | Included |
| xFIP estimates | Claude AI | ~$0.01/analysis |
| Recent form + line movement | Claude AI | Included |

**Sportsbooks covered**: DraftKings · FanDuel · BetMGM · Caesars · Bovada · BetOnline · MyBookie · ESPN BET · PointsBet

---

## Strategy rules (hardcoded)

```
MAX ODDS:        -150 (never bet heavier — checked against REAL live odds)
MIN CRITERIA:    3 of 4

PITCHER FADE:    WHIP > 1.30 AND K/9 < 7
PITCHER TARGET:  WHIP < 1.20 AND K/9 > 9

BULLPEN EDGE:    ERA gap ≥ 1.30 runs
```

---

## Bankroll reminder

- Flat bet 1–2% of bankroll per play
- No parlays
- No chasing losses
- Some days = 0 bets. That's correct.


A disciplined MLB betting tool that pulls **real data from the official MLB Stats API** (free, no key needed), then applies the "Beat the Book" strategy using Claude AI analysis. It will say **NO BET** when criteria aren't met.

## What it does

1. Fetches today's schedule + probable pitchers from `statsapi.mlb.com` (official, free)
2. Pulls each starter's season stats: ERA, WHIP, K/9 (calculated from raw SO/IP)
3. Fetches team bullpen ERAs
4. Sends all real data to Claude for strategy analysis + xFIP estimates + recent form
5. Only recommends a BET if **3 of 4 criteria** are met:
   - Pitching edge (WHIP/K9 mismatch)
   - Price no worse than −150
   - Sharp money / reverse line movement signal
   - Bullpen ERA gap ≥ 1.30

---

## Deploy in 5 minutes

### Step 1 — Get your Anthropic API key
Go to [console.anthropic.com](https://console.anthropic.com) → API Keys → Create key.

### Step 2 — Push to GitHub
```bash
# In your terminal:
git init
git add .
git commit -m "MLB analyzer — initial commit"
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/mlb-analyzer.git
git push -u origin main
```

### Step 3 — Deploy to Vercel (free)
1. Go to [vercel.com](https://vercel.com) → New Project
2. Import your GitHub repo
3. In **Environment Variables**, add:
   - Key: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-your-key-here`
4. Click Deploy

That's it. Vercel auto-deploys on every push.

---

## Run locally

```bash
npm install

# Copy the env template and add your key
cp .env.local.example .env.local
# Edit .env.local and paste your ANTHROPIC_API_KEY

npm run dev
# Open http://localhost:3000
```

---

## Data sources

| Data | Source | Cost |
|------|--------|------|
| Schedule + probable pitchers | MLB Stats API (official) | Free |
| Pitcher ERA, WHIP, K/9 | MLB Stats API (official) | Free |
| Team bullpen ERA | MLB Stats API (official) | Free |
| xFIP estimates | Claude AI (training knowledge) | ~$0.01/analysis |
| Recent form | Claude AI (training knowledge) | included |
| Line movement | Descriptive — check Action Network for live % | Free |

> **Note on xFIP and line movement**: The free MLB API doesn't expose xFIP or real-time betting percentages. xFIP estimates come from Claude's training knowledge of pitcher profiles, clearly labeled as estimates. For live line movement percentages, cross-reference [Action Network](https://www.actionnetwork.com/mlb/public-betting) (free).

---

## Strategy rules (hardcoded)

```
MAX ODDS:        -150 (never bet heavier than this)
MIN CRITERIA:    3 of 4

PITCHER FADE:    WHIP > 1.30 AND K/9 < 7
PITCHER TARGET:  WHIP < 1.20 AND K/9 > 9

BULLPEN EDGE:    ERA gap ≥ 1.30 runs
```

---

## Bankroll reminder

- Flat bet 1–2% of bankroll per play
- No parlays
- No chasing losses
- Some days = 0 bets. That's correct.
