# Bleacher GM

Dynasty command center for the Weekend Warriors Sleeper league, built with Next.js for Vercel.

**Live data:** Sleeper's public API (league, rosters, matchups, live scores, projections, game logs, injuries) and FantasyCalc dynasty values. No API keys are needed.

## Pages
- **Dashboard** (`/`): standings, average points, playoff odds, dynasty rank, live matchup with win probability and lineups, power radar, weekly points vs. league median, position breakdown, injuries, roster.
- **Rankings** (`/rankings`): tiered dynasty rankings with season stats, owners, sorting and filters.
- **Trade** (`/trade`): two-sided trade calculator with a value balance and before/after league ranks for both teams.
- **Roster Lab** (`/roster-lab`): sandbox for hypothetical moves (any team, free agents, rookies, picks) with before/after ranks, league shares and a three-year value trajectory.
- **Team Blueprint** (`/blueprint`): archetype, positional grades, value and starter share, multi-year outlook, draft capital, cornerstones (star a player) and trade strategy.
- **League** (`/league`): power rankings with expandable rosters and draft picks.
- **League History** (`/history`): every past draft board and every trade, with a Drafts/Trades toggle. Trades show what each side's haul is worth today.
- **Player view**: click any player anywhere, or search with ⌘K. Shows a profile, weekly points chart, heat-mapped game logs and league context.
- **Light/dark**: toggle in the top bar. Your choice is remembered.

## Deploy to Vercel
1. Push this folder to a new GitHub repo.
2. At vercel.com choose **Add New → Project**, import the repo, and click **Deploy**. Vercel detects Next.js automatically.
3. Optional environment variables (Project → Settings → Environment Variables):
   - `SLEEPER_LEAGUE_ID`: defaults to `1382737164013436928`
   - `MY_TEAM_NAME`: defaults to `what up dough`

## Run locally (needs Node 18+)
```bash
npm install
npm run dev   # http://localhost:3000
```

## Caching
- League data is cached at Vercel's edge for 10 minutes.
- Live scores are cached for 30 seconds and refreshed in the browser every minute.
- Player game logs are cached for 15 minutes.

## Next year's rookie class (devy prospects)
Roster Lab can add next year's college class, which Sleeper won't have until those players are drafted. The list lives in `public/data/devy_prospects.csv`, using the same columns as the Streamlit app's file:

```
Season,Consensus Rank,Player,Position,School,Notes
```

Replace the starter list with your own board whenever you like. A prospect ranked Nth is valued like the Nth-best pick in that class (FantasyCalc pick prices), with a premium for the top three.
