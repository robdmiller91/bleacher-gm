// Recent trades involving an asset, and trade ideas built from the league's rosters.
// Everything is valued on this league's FantasyCalc scale, today.

import { POSITIONS, ordinal } from "./model";

// A traded pick is valued as the average of this league's picks for that season and round.
export function pickValues(data) {
  const sums = {};
  for (const k of data.picks) {
    const key = `${k.season}-${k.round}`;
    sums[key] = sums[key] || { n: 0, v: 0 };
    sums[key].n += 1;
    sums[key].v += k.value;
  }
  return Object.fromEntries(Object.entries(sums).map(([key, s]) => [key, Math.round(s.v / s.n)]));
}

const ROUND_WORD = { 1: "1st", 2: "2nd", 3: "3rd" };
export const pickName = (season, round) => `${season} ${ROUND_WORD[round] || `${round}th`}`;

// What a trade looks like today: each asset with its current value, plus side totals.
export function valueTrade(t, data, pv) {
  const sides = t.sides.map((s) => {
    const assets = s.assets.map((a) => {
      if (a.type === "pick") return { ...a, label: pickName(a.season, a.round), value: pv[`${a.season}-${a.round}`] ?? null };
      const p = data.players[a.id];
      return { ...a, label: p?.name || a.name, pos: p?.pos || a.pos, team: p?.team, img: p?.img, posRank: p?.posRank, value: p ? p.value : null };
    });
    return { ...s, assets, total: assets.reduce((sum, a) => sum + (a.value || 0), 0), partial: assets.some((a) => a.value == null) };
  });
  return { ...t, sides };
}

// The thing being looked up: a league player (by Sleeper id) or a pick (by season and round).
export function focusOf(id, data) {
  if (!id) return null;
  const p = data.players[id];
  if (p) return { kind: "player", id, label: p.name, pos: p.pos, value: p.value, owner: p.owner ?? null, img: p.img };
  const k = data.picks.find((x) => x.id === id);
  if (k) return { kind: "pick", id, label: k.label, season: k.season, round: k.round, value: k.value, owner: k.owner, k };
  return null;
}

export const involves = (t, f) =>
  t.sides.some((s) => s.assets.some((a) => (f.kind === "player" ? a.type === "player" && a.id === f.id : a.type === "pick" && a.season === f.season && a.round === f.round)));

// How close a trade's league is to this one: same size and scoring first.
export function formatDistance(f, mine) {
  return Math.abs((f.teams || 12) - (mine.teams || 12)) / 2 + Math.abs((f.ppr ?? 1) - (mine.ppr ?? 1)) * 2 + (f.superflex !== mine.superflex ? 10 : 0);
}

// 0 = strongest group in the league, 1 = weakest.
const need = (team, pos, n) => (POSITIONS.includes(pos) ? (team[`${pos}Rank`] - 1) / Math.max(n - 1, 1) : 0.5);

function assetsOf(data, rosterId) {
  const players = Object.values(data.players)
    .filter((p) => p.owner === rosterId && p.value > 0)
    .map((p) => ({ id: p.id, kind: "player", label: p.name, pos: p.pos, value: p.value, img: p.img, posRank: p.posRank, team: p.team }));
  const picks = data.picks.filter((k) => k.owner === rosterId).map((k) => ({ id: k.id, kind: "pick", label: k.label, value: k.value, k }));
  return [...players, ...picks];
}

// Packages of one to three assets from `pool` worth about `target`, scored for fit.
function packages(pool, target, fit) {
  const lo = target * 0.9;
  const hi = target * 1.15;
  const out = [];
  const items = pool.filter((a) => a.value <= hi && a.value >= target * 0.08);
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (a.value >= lo) out.push([a]);
    if (a.value >= lo) continue;
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      if (b.value >= lo) continue;
      const sum = a.value + b.value;
      if (sum >= lo && sum <= hi) out.push([a, b]);
      else if (sum < lo) {
        // Three pieces only when no two of them already get there.
        for (let k = j + 1; k < items.length; k++) {
          const c = items[k];
          const s3 = sum + c.value;
          if (s3 >= lo && s3 <= hi && a.value + c.value < lo && b.value + c.value < lo) out.push([a, b, c]);
        }
      }
    }
  }
  return out
    .map((pkg) => {
      const total = pkg.reduce((s, a) => s + a.value, 0);
      const closeness = 1 - Math.abs(total - target) / target; // 1 = exact
      return { pkg, total, score: closeness * 2 + fit(pkg) - (pkg.length - 1) * 0.15 };
    })
    .sort((a, b) => b.score - a.score);
}

// Trade ideas for the focus asset. If you own it: what each team could send for it, favoring teams
// weak at that position and returns that fill your weak spots. If someone else owns it: what you
// could offer, favoring pieces at positions you're deep in and they're thin at.
export function suggestTrades(data, me, focus, { perTeam = 1, limit = 6 } = {}) {
  if (!focus || !focus.value || focus.owner == null) return [];
  const n = data.teams.length;
  const team = (rid) => data.teams.find((t) => t.rosterId === rid);
  const mine = team(me);
  const out = [];
  if (focus.owner === me) {
    for (const t of data.teams) {
      if (t.rosterId === me) continue;
      const theirNeed = focus.kind === "player" ? need(t, focus.pos, n) : t.window === "Rebuilding" ? 0.8 : 0.3;
      const fit = (pkg) => theirNeed * 0.6 + pkg.reduce((s, a) => s + (a.kind === "player" ? need(mine, a.pos, n) : 0.4), 0) / pkg.length * 0.6;
      packages(assetsOf(data, t.rosterId), focus.value, fit)
        .slice(0, perTeam)
        .forEach((p) => out.push({ partner: t.rosterId, partnerName: t.name, give: [focus], get: p.pkg, total: p.total, score: p.score, why: whyAway(focus, t, p.pkg, mine, n) }));
    }
  } else {
    const t = team(focus.owner);
    if (!t) return [];
    const myPool = assetsOf(data, me).filter((a) => a.id !== focus.id);
    // Spare parts: positions where you're strong and they're weak.
    const fit = (pkg) => pkg.reduce((s, a) => s + (a.kind === "player" ? (1 - need(mine, a.pos, n)) * 0.5 + need(t, a.pos, n) * 0.5 : t.window === "Rebuilding" ? 0.7 : 0.4), 0) / pkg.length;
    packages(myPool, focus.value, fit)
      .slice(0, limit)
      .forEach((p) => out.push({ partner: t.rosterId, partnerName: t.name, give: p.pkg, get: [focus], total: p.total, score: p.score, why: whyGet(t, p.pkg, mine, n) }));
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}


function whyAway(focus, t, pkg, mine, n) {
  const bits = [];
  if (focus.kind === "player" && POSITIONS.includes(focus.pos) && need(t, focus.pos, n) >= 0.5) bits.push(`${t.name} ranks ${ordinal(t[`${focus.pos}Rank`])} at ${focus.pos}`);
  const fills = [...new Set(pkg.filter((a) => a.kind === "player" && need(mine, a.pos, n) >= 0.5).map((a) => a.pos))];
  if (fills.length) bits.push(`adds to your ${fills.join("/")} room (${fills.map((p) => ordinal(mine[`${p}Rank`])).join(", ")})`);
  if (pkg.some((a) => a.kind === "pick") && mine.window === "Rebuilding") bits.push("picks fit a rebuild");
  return bits.join(" · ") || "Close in value";
}

function whyGet(t, pkg, mine, n) {
  const bits = [];
  const spare = [...new Set(pkg.filter((a) => a.kind === "player" && need(mine, a.pos, n) < 0.5).map((a) => a.pos))];
  if (spare.length) bits.push(`you're deep at ${spare.join("/")}`);
  const helps = [...new Set(pkg.filter((a) => a.kind === "player" && need(t, a.pos, n) >= 0.5).map((a) => a.pos))];
  if (helps.length) bits.push(`${t.name} needs ${helps.join("/")} (${helps.map((p) => ordinal(t[`${p}Rank`])).join(", ")})`);
  if (pkg.some((a) => a.kind === "pick") && t.window === "Rebuilding") bits.push(`${t.name} is rebuilding`);
  return bits.join(" · ") || "Close in value";
}

// FantasyCalc's public feed of real trades (it allows browser requests). Each call returns only the
// latest ~50 for one league setup, so ask for the setups closest to yours, a couple at a time and
// only a few per refresh (it answers bursts with 429). Results are kept in this browser: fresh for an hour, and trades seen
// before are kept for 60 days so the pool grows with each visit.
const FC_TEAMS = [8, 10, 12, 14, 16];
const FC_PPR = [0, 0.5, 1];

function marketTrades(list) {
  const asset = (a) => {
    if (a.position === "PICK") {
      const m = /FP_(\d{4})_(\d)/.exec(a.sleeperId || a.mflId || "");
      return m ? { type: "pick", season: Number(m[1]), round: Number(m[2]) } : null;
    }
    return a.sleeperId ? { type: "player", id: String(a.sleeperId), name: a.name, pos: a.position } : null;
  };
  return (Array.isArray(list) ? list : []).map((t) => ({
    id: `market-${t.id}`,
    source: "market",
    date: Date.parse(t.date) || 0,
    format: { teams: t.numTeams, superflex: (t.numSuperflex || 0) > 0 || t.numQbs === 2, ppr: t.ppr, tep: t.tePremium || 0 },
    sides: [t.side1, t.side2].map((s) => ({ assets: (s || []).map(asset).filter(Boolean) })),
  })).filter((t) => t.sides.every((s) => s.assets.length));
}

const MARKET_KEY = "bgm-market-trades";
const MARKET_FRESH = 60 * 60 * 1000;
const MARKET_SETUPS = 8; // requests per refresh; FantasyCalc blocks an IP for a while after a burst
const MARKET_KEEP = 60 * 86400000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readMarket() {
  try {
    return JSON.parse(localStorage.getItem(MARKET_KEY)) || null;
  } catch {
    return null;
  }
}

export async function fetchMarketTrades(format = {}) {
  const cached = readMarket();
  const keep = (list) => list.filter((t) => Date.now() - t.date < MARKET_KEEP);
  if (cached && Date.now() - cached.at < MARKET_FRESH) return { trades: keep(cached.trades), ok: cached.ok, of: cached.of, cached: true };

  const sf = format.superflex ? 2 : 1;
  const teams = format.teams || 12;
  const ppr = format.ppr ?? 1;
  const setups = [sf, 3 - sf]
    .flatMap((qbs) => FC_TEAMS.flatMap((n) => FC_PPR.map((p) => ({ qbs, n, p }))))
    .sort((a, b) => (a.qbs !== sf) - (b.qbs !== sf) || Math.abs(a.n - teams) - Math.abs(b.n - teams) || Math.abs(a.p - ppr) - Math.abs(b.p - ppr))
    .slice(0, MARKET_SETUPS);
  const lists = [];
  let limited = false;
  for (let i = 0; i < setups.length && !limited; i += 2) {
    const batch = await Promise.all(
      setups.slice(i, i + 2).map(({ qbs, n, p }) =>
        fetch(`https://api.fantasycalc.com/trades?isDynasty=true&numQbs=${qbs}&numTeams=${n}&ppr=${p}`)
          .then((r) => (r.status === 429 ? ((limited = true), []) : r.ok ? r.json() : []))
          .catch(() => []),
      ),
    );
    lists.push(...batch);
    if (!limited) await sleep(400);
  }

  const seen = new Set();
  const trades = keep([...marketTrades(lists.flat()), ...(cached?.trades || [])]).filter((t) => !seen.has(t.id) && seen.add(t.id));
  const ok = lists.filter((l) => Array.isArray(l) && l.length).length;
  try {
    localStorage.setItem(MARKET_KEY, JSON.stringify({ at: Date.now(), ok, of: setups.length, trades: trades.slice(0, 4000) }));
  } catch {
    // storage full or blocked: still return this load's trades
  }
  return { trades, ok, of: setups.length, limited };
}
