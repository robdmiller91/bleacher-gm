"use client";

import { useState } from "react";
import { Img, PageHead } from "./ui";

// Connect a Sleeper account: type a username, then pick one of that user's leagues.
// Sleeper's API is public and read-only, so there's no password, and nothing is stored
// on our side; the choice is remembered in this browser only.
export default function Connect({ initialUsername = "", onPick }) {
  const [username, setUsername] = useState(initialUsername);
  const [found, setFound] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const lookUp = async (e) => {
    e.preventDefault();
    const name = username.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      const d = await fetch(`/api/sleeper-user?username=${encodeURIComponent(name)}`).then((r) => r.json());
      if (d.error) setError(d.error);
      else if (!d.leagues.length) setError(`${d.user.name} isn't in any NFL leagues this season.`);
      else setFound(d);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="connect">
      <PageHead title="Connect your" accent="Sleeper league" sub="Enter your Sleeper username to see your leagues. No password needed: we only read public league data." />

      <form className="card connect-form" onSubmit={lookUp}>
        <label htmlFor="sleeperUser" className="small muted">Sleeper username</label>
        <div className="connect-row">
          <input
            id="sleeperUser"
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. dynastyguru"
            autoComplete="username"
            autoFocus
          />
          <button className="btn primary" type="submit" disabled={busy || !username.trim()}>
            {busy ? "Looking…" : "Find my leagues"}
          </button>
        </div>
        {error && <p className="small connect-error">{error}</p>}
      </form>

      {found && (
        <div className="card">
          <div className="card-title">
            <h3>{found.user.name}&rsquo;s leagues</h3>
            <span className="muted small">Pick one to open it</span>
          </div>
          <div className="connect-leagues">
            {found.leagues.map((l) => (
              <button
                key={l.id}
                type="button"
                className="connect-league"
                onClick={() => onPick({ leagueId: l.id, userId: found.user.id, username: found.user.username })}
              >
                <Img src={l.avatar} />
                <span className="connect-league-text">
                  <span className="connect-league-name">{l.name}</span>
                  <span className="muted small">
                    {l.season} · {l.teams ? `${l.teams} teams · ` : ""}{l.dynasty ? "Dynasty" : "Redraft"}{l.superflex ? " · Superflex" : ""}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {found.leagues.some((l) => !l.dynasty) && (
            <p className="muted small" style={{ marginBottom: 0 }}>Values and rankings here are dynasty values, so redraft leagues will open but won&rsquo;t read quite right.</p>
          )}
        </div>
      )}
    </div>
  );
}
