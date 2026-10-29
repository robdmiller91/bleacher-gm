# Bleacher GM

Dynasty command center for any Sleeper league, built with Next.js for Vercel.

**Live data:** Sleeper's public API (league, rosters, matchups, live scores, projections, game logs, injuries) and FantasyCalc dynasty values. No API keys are needed.

## Getting in
The homepage (the prospect board) needs no login. For the league tools, enter a Sleeper username and pick one of that user's leagues. Sleeper's API is public and read-only, so there's no password and nothing is stored on the server: the chosen league is remembered in the browser (`localStorage`). "Your team" is the roster that user owns or co-owns. Click the league in the top bar to switch. A link with `?league=<league id>` opens that league directly.

## Pages
- **Dashboard** (`/dashboard`): standings, average points, playoff odds, dynasty rank, live matchup with win probability and lineups, power radar, weekly points vs. league median, position breakdown, injuries, roster.
- **Rankings** (`/rankings`): tiered dynasty rankings with season stats, owners, sorting and filters.
- **Trade** (`/trade`): two-sided trade calculator with a value balance and before/after league ranks for both teams. "View rosters" opens every team's positional groups and rosters over the calculator, without losing the trade in progress. The **Trade Finder** below the calculator takes any player or pick and shows recent real trades that included it: this league's trades this season; every trade this season in up to 40 other dynasty leagues on Sleeper (your leaguemates' leagues, plus their leaguemates' when that circle is small; closest format first); and FantasyCalc's public trades feed. The browser fetches that feed directly, two league setups at a time because FantasyCalc rate-limits bursts. It pulls the 8 setups closest to your league per refresh, and the browser keeps them for an hour, and keeps trades it has seen for 60 days, so the pool grows with use. Each is valued at today's values in your format. It also suggests packages of one to three pieces with teams in the league, weighted toward positional need, and loads any of them into the calculator (`app/api/trades/route.js`, `lib/tradeFinder.js`).
- **Roster Lab** (`/roster-lab`): sandbox for hypothetical moves (any team, free agents, rookies, picks) with before/after ranks, league shares and a three-year value trajectory.
- **Team Blueprint** (`/blueprint`): archetype, positional grades, value and starter share, multi-year outlook, draft capital, cornerstones (star a player) and trade strategy.
- **League** (`/league`): power rankings with expandable rosters and draft picks.
- **League History** (`/history`): every past draft board and every trade, with a Drafts/Trades toggle. Trades show what each side's haul is worth today.
- **Prospects** (`/`, the homepage; `/prospects` also works): the BGM Prospect Score, our own rookie model. It has a class board, sortable rankings across every class (2018–2026 plus 2027, filterable by class), report cards (grades, radar chart, tier and draft-round hit rates, historical comps, head-to-head compare and a model-vs-hype call) and a glossary. Tiers follow the screenshot model: Cornerstone, Elite (Elite+ / Elite / Elite Lite), Elite Upside, Upside, Upside Lite, Outlier, Outlier Lite, Purgatory. Every QB/RB/WR/TE drafted since 2018 with college stats on ESPN is graded the same way, so past classes can be browsed alongside what actually happened to those players.
- **Player view**: click any player anywhere, or search with ⌘K. Shows a profile, weekly points chart, heat-mapped game logs, news headlines and league context.
- **Light/dark**: toggle in the top bar. Your choice is remembered.

## Deploy to Vercel
1. Push this folder to a new GitHub repo.
2. At vercel.com choose **Add New → Project**, import the repo, and click **Deploy**. Vercel detects Next.js automatically.

No environment variables are needed.

## Run locally (needs Node 18+)
```bash
npm install
npm run dev   # http://localhost:3000
```

## Caching
- League data is cached at Vercel's edge for 10 minutes.
- Live scores are cached for 30 seconds and refreshed in the browser every minute.
- Player game logs are cached for 15 minutes.
- FantasyCalc values are cached for 3 hours (their rule for free use).
- Sleeper's full player list is kept in memory for 24 hours (Sleeper asks for at most one fetch a day).

## Data sources and their terms
Checked 21 Oct 2026. Re-check before charging money or passing the usage limits below.

| Source | What we use | Terms that apply |
|---|---|---|
| Sleeper API (docs.sleeper.com) | Leagues, rosters, users, matchups, drafts, transactions, players | Free for **non-commercial** use; commercial use needs a licence from Sleeper. Stay under 1,000 calls a minute; fetch `/players/nfl` at most daily. |
| Sleeper, undocumented endpoints | Season and weekly stats, projections (`api.sleeper.com`), player news | Not part of the documented API, so not covered by it. Sleeper's general terms limit use to personal, non-commercial use. Could change or be blocked at any time. |
| News publishers (FantasyPros, RotoWire, RotoBaller) | Headlines, as listed in Sleeper's news feed | Their write-ups are copyrighted. We show only the headline, source and a link to the full story. |
| FantasyCalc (`/values/current`) | Dynasty player and pick values | Free for sites under **1,000 monthly active users** with visible "FantasyCalc" attribution near the data, cached for at least 3 hours. Commercial use, or 1,000+ users, needs written permission (fantasycalcff@gmail.com). |
| Sleeper CDN images | Headshots, avatars, NFL team logos | Sleeper's content. Team logos are NFL trademarks. Fine for a free fan site; replace or license before going commercial. |
| `public/data/devy_prospects.csv` | 2027 devy board | Our own blend of RotoBaller and Dynasty Nerds mock drafts, with both credited. Replace with our own board before going commercial. |

| ESPN public stats pages (`site.web.api.espn.com`) | College season stats and team totals behind the prospect files | Undocumented and not licensed for reuse; we keep only the numbers (facts), collected once into CSVs, not live calls. Check Disney's terms before going commercial. |
| Wikipedia | 2027 prospects' birthdates | CC BY-SA; facts only. |
| Wikimedia Commons | Photos of 9 2027 prospects (Smith, Baugh, Becker, Cam Coleman, Jamari Johnson, Duff, Coleman-Williams, Frazier, Fletcher) in `public/img/prospects` | CC BY / CC BY-SA / public domain: the credit in `prospects_2027.csv` is shown on the card and must stay with the photo. |
| Tankathon 2027 big board | Board rank, used as projected draft capital | Read 26 Oct 2026, rank only. Replace with our own board before going commercial. |
| nflverse (`nflverse-data` releases) | Past drafts, combine 40 times, birthdates, NFL seasons for hit rates and outcomes | CC BY 4.0: credit nflverse. |

ESPN headshots and logos are not used: Disney's terms forbid reusing ESPN images.

## BGM Prospect Score
Our own model and labels. Its scoring scale (position grade ≈ 8–15, percentile Overall, Z-score, class tiers) was calibrated so our numbers line up with reference prospect scores we were shown. Across 30 reference players we're within 0.39 grade points and 0.9 Overall points on average. The reference scores are calibration targets only and aren't stored or shown. The formulas and thresholds are in `lib/prospects.js`, and the Glossary tab explains each input.
- Headshots: past prospects use Sleeper's NFL headshots (`Sleeper Id` column). The coming class shows school-colored initials unless you add an `Image` column to `prospects_2027.csv` pointing at a picture you have the rights to (for example `/img/prospects/jeremiah-smith.jpg` in `public/`).
- `public/data/prospects_2027.csv`: the coming class (bio, board rank, notes). Add 40 times in the `Forty` column after the combine, and update `Board Rank` as boards move.
- `public/data/prospect_seasons.csv`: their college seasons with team totals. The 2026 rows are the season to date as of 26 Oct 2026.
- `public/data/prospect_history.csv` and `prospect_history_seasons.csv`: QBs, RBs, WRs and TEs drafted 2018–2026 (the 666 with college stats on ESPN, whose data starts around 2014), with their college seasons and NFL outcome (best full-PPR positional finish in their first four seasons).
- `public/data/prospect_hit_rates.csv`: hit rates by position and draft round for 2012–2021 drafts.

Not included: PFF charting stats (missed tackles forced, yards after contact, route data) and conference-strength adjustments, which aren't in free data.

## Next year's rookie class (devy prospects)
Roster Lab can add next year's college class, which Sleeper won't have until those players are drafted. The list lives in `public/data/devy_prospects.csv`, using the same columns as the Streamlit app's file:

```
Season,Consensus Rank,Player,Position,School,Notes
```

Replace the starter list with your own board whenever you like. A prospect ranked Nth is valued like the Nth-best pick in that class (FantasyCalc pick prices), with a premium for the top three.

## Ask the model (chat)
A chat panel docked to the bottom of every page (the "Ask the model" button; ⅓ / ½ / Full height, Clear, Close). It handles questions, comparisons ("compare A and B" shows a head-to-head card in the chat) and comps ("2027 players like Ja'Marr Chase" shows a comp list), and links any player it names to their report card. Free-form questions are answered by Claude (`claude-opus-5-5`) through `app/api/ask/route.js`. It looks everything up in the prospect data with read-only tools (search, report card, compare, similar players, rankings, hit rates), so answers use our numbers rather than the model's memory.

With a Sleeper league connected, it can also answer questions about your league: standings and playoff odds, every roster by position, who owns which draft picks and what each slot is worth, and strategy (for example "is it worth tanking for a better pick?").

**Without a key (the current setup):** open-ended questions are handed off to Claude. The chat shows "Copy question + league summary" and "Open Claude" buttons, and the dock header has "Copy league summary". The summary covers the league settings, standings with playoff odds and positional ranks, your roster, your picks, first-round value by slot and the top 2027 prospects. It's built in `leagueSummaryText` in `lib/leagueQuery.js`. Paste it into claude.ai.

To answer open-ended questions in the site itself instead, add an Anthropic API key (API use is billed separately from a Claude Pro plan):
1. Create a key at console.anthropic.com and **set a monthly spend limit** there, because a public site lets anyone use it.
2. Locally, put `ANTHROPIC_API_KEY=sk-ant-...` in a `.env.local` file in this folder (already covered by `.gitignore`), then restart `npm run dev`.
3. On Vercel: Project → Settings → Environment Variables → add `ANTHROPIC_API_KEY`, then redeploy.

Without a key, the chat still answers comparisons, comps, "top 10 RBs"-style lists and player lookups itself (with the same cards); only open-ended questions need the key. Each answered question costs roughly a few cents. Refusal fallbacks (`fallbacks: "default"`) are on, so a request the model declines is retried on a fallback model automatically.
