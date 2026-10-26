"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon, Img, Pos } from "./ui";
import PlayerModal from "./PlayerModal";
import Connect from "./Connect";

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

const LEAGUE_FREE = ["/", "/prospects"];

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "home" },
  { href: "/rankings", label: "Rankings", icon: "rankings" },
  { href: "/trade", label: "Trade", icon: "trade" },
  { href: "/roster-lab", label: "Roster Lab", icon: "lab" },
  { href: "/blueprint", label: "Blueprint", icon: "blueprint" },
  { href: "/league", label: "League", icon: "league" },
  { href: "/", label: "Prospects", icon: "cap" },
  { href: "/history", label: "History", icon: "history" },
];

function GlobalSearch() {
  const { data, openPlayer } = useApp();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term || !data) return [];
    return Object.values(data.players)
      .filter((p) => p.name.toLowerCase().includes(term))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [q, data]);

  const choose = (p) => {
    openPlayer(p.id);
    setQ("");
    setOpen(false);
    inputRef.current?.blur();
  };
  const teamName = (rid) => data?.teams.find((t) => t.rosterId === rid)?.name;

  return (
    <div className="search">
      <Icon name="search" size={18} />
      <input
        ref={inputRef}
        value={q}
        placeholder="Search any player…"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setHl(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setHl((h) => Math.min(h + 1, results.length - 1));
          if (e.key === "ArrowUp") setHl((h) => Math.max(h - 1, 0));
          if (e.key === "Enter" && results[hl]) choose(results[hl]);
          if (e.key === "Escape") inputRef.current?.blur();
        }}
      />
      <kbd>⌘K</kbd>
      {open && results.length > 0 && (
        <div className="search-results">
          {results.map((p, i) => (
            <button key={p.id} className={`search-item${i === hl ? " hl" : ""}`} onMouseDown={() => choose(p)}>
              <Img src={p.img} className="headshot" />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="pname" style={{ display: "block" }}>{p.name}</span>
                <span className="asset-meta">
                  <Pos pos={p.pos} rank={p.posRank} />
                  <span className="muted small">{p.team} · {p.owner ? teamName(p.owner) : "Free agent"}</span>
                </span>
              </span>
              <b className="small">{p.value ? p.value.toLocaleString() : ""}</b>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// The league this browser has open: { leagueId, userId, username }, remembered in localStorage.
// A ?league=<id> link opens that league instead, so a league can be shared.
const SELECTION_KEY = "bgm-selection";
const isId = (s) => /^\d{1,24}$/.test(String(s || ""));
function readSelection() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(SELECTION_KEY));
  } catch {}
  if (saved && !isId(saved.leagueId)) saved = null;
  const linked = new URLSearchParams(window.location.search).get("league");
  if (isId(linked) && linked !== saved?.leagueId) return { leagueId: linked, userId: saved?.userId || null, username: saved?.username || "" };
  return saved;
}

function Loading({ error, onSwitch }) {
  if (error) {
    return (
      <div className="card empty">
        <h3>Couldn't load your league</h3>
        <p className="small">{error}</p>
        <div style={{ display: "flex", gap: "0.6rem", justifyContent: "center" }}>
          <button className="btn" onClick={() => window.location.reload()}>Try again</button>
          <button className="btn" onClick={onSwitch}>Pick another league</button>
        </div>
      </div>
    );
  }
  return (
    <div className="grid">
      <div className="skeleton" style={{ height: 60, width: 320 }} />
      <div className="stats-row">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 88 }} />)}
      </div>
      <div className="skeleton" style={{ height: 320 }} />
    </div>
  );
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sel, setSel] = useState(undefined); // undefined until read from the browser, null when no league is chosen
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [live, setLive] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme || "dark");
    setSel(readSelection() || null);
  }, []);
  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    try {
      localStorage.setItem("theme", nextTheme);
    } catch {}
    setTheme(nextTheme);
  };

  const pickLeague = useCallback((s) => {
    try {
      localStorage.setItem(SELECTION_KEY, JSON.stringify(s));
    } catch {}
    if (window.location.search.includes("league=")) window.history.replaceState(null, "", window.location.pathname);
    setData(null);
    setLive(null);
    setError(null);
    setSel(s);
  }, []);
  const switchLeague = useCallback(() => {
    setPlayerId(null);
    setData(null);
    setLive(null);
    setError(null);
    setSel((s) => (s ? { ...s, leagueId: null } : null));
  }, []);

  const leagueId = sel?.leagueId || null;
  const leagueQuery = leagueId ? `league=${leagueId}` : "";

  useEffect(() => {
    if (!leagueId) return;
    let alive = true;
    fetch(`/api/league?${leagueQuery}${sel?.userId ? `&user=${sel.userId}` : ""}`)
      .then((r) => r.json())
      .then((d) => alive && (d.error ? setError(d.error) : setData(d)))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [leagueId, leagueQuery, sel?.userId]);

  // Live scores refresh every minute while the tab is open.
  useEffect(() => {
    if (!leagueId) return;
    const load = () =>
      fetch(`/api/live?${leagueQuery}`)
        .then((r) => r.json())
        .then((d) => {
          if (!d.error) setLive(d);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [leagueId, leagueQuery]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setPlayerId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = playerId ? "hidden" : "";
  }, [playerId]);

  const openPlayer = useCallback((id) => setPlayerId(String(id)), []);
  const ctx = useMemo(() => ({ data, live, openPlayer, theme, leagueQuery }), [data, live, openPlayer, theme, leagueQuery]);
  const me = data?.teams.find((t) => t.rosterId === data.me);

  // The prospect pages don't need a Sleeper league, so they render before (or without) connecting one.
  const leagueFree = LEAGUE_FREE.includes(pathname);
  let body;
  if (leagueFree) body = children;
  else if (sel === undefined) body = <Loading />;
  else if (!leagueId) body = <Connect initialUsername={sel?.username || ""} onPick={pickLeague} />;
  else body = data ? children : <Loading error={error} onSwitch={switchLeague} />;

  return (
    <AppContext.Provider value={ctx}>
      <div className="shell">
        <aside className="rail">
          <div className="rail-logo">BGM</div>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`rail-link${pathname === n.href ? " active" : ""}`}>
              <Icon name={n.icon} size={22} />
              {n.label}
            </Link>
          ))}
          <div className="rail-spacer" />
        </aside>

        <div className="main">
          <header className="topbar">
            <button
              type="button"
              className="league-pill"
              onClick={() => {
                switchLeague();
                // The league picker lives on the league pages, not on the prospect board.
                if (LEAGUE_FREE.includes(pathname)) router.push("/dashboard");
              }}
              title="Switch league"
              disabled={!leagueId}
            >
              <Img src={me?.avatar || data?.league.avatar} />
              <div className="league-pill-text">
                <div className="league-pill-name">{data?.league.name || (leagueId ? "Loading league…" : "No league yet")}</div>
                <div className="league-pill-sub">{me ? `${me.name} · ${me.wins}-${me.losses}` : leagueId ? "Switch league" : "Connect Sleeper"}</div>
              </div>
            </button>
            {data && <GlobalSearch />}
            {live && (
              <span className="chip" title={`Updated ${new Date(live.fetchedAt).toLocaleTimeString()}`}>
                <span className="live-dot" /> Week {live.week}
              </span>
            )}
            <button className="icon-btn" onClick={toggleTheme} title="Switch light / dark">
              <Icon name={theme === "dark" ? "sun" : "moon"} />
            </button>
          </header>

          <main className="content">{body}</main>

          <footer className="credits small muted">
            League data from <a href="https://sleeper.com" target="_blank" rel="noopener noreferrer">Sleeper</a>.
            Dynasty values from <a href="https://fantasycalc.com" target="_blank" rel="noopener noreferrer">FantasyCalc</a>.
            Bleacher GM is an independent fan project, not affiliated with or endorsed by Sleeper, FantasyCalc or the NFL.
          </footer>
        </div>
      </div>
      {data && playerId && <PlayerModal key={playerId} id={playerId} onClose={() => setPlayerId(null)} />}
    </AppContext.Provider>
  );
}
