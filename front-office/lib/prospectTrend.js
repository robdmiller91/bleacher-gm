// Draft projections for the coming class: NFL draft slot and top-12 hit chance.

// Big-board rank read as a draft slot. Rounds are taken as 32 picks.
export function draftSlot(rank) {
  if (!rank) return null;
  return { round: Math.ceil(rank / 32), pick: ((rank - 1) % 32) + 1, overall: rank };
}

// Chance of hearing his name called at all, from big-board rank (judgement call, not fitted):
// a logistic centred on pick 224 (the end of round 7). Unranked prospects sit at rank 260.
export function draftedChance(rank) {
  const r = rank || 260;
  return Math.min(99, Math.max(1, Math.round(100 / (1 + Math.exp((r - 224) / 22)))));
}

// Top-12 season chance: past hit rates for his tier and for his projected round, weighted by
// sample size; ± is a 95% interval on the combined sample.
export function hitChance(x, hitRates, tierHits) {
  const parts = [tierHits?.[x.pos]?.[x.tier.key], hitRates?.[x.pos]?.[x.round || "R6-7"]].filter((h) => h?.n);
  const n = parts.reduce((s, h) => s + h.n, 0);
  if (!n) return null;
  const p = parts.reduce((s, h) => s + h.top12 * h.n, 0) / n / 100;
  return { pct: Math.round(p * 100), pm: Math.max(1, Math.round(196 * Math.sqrt((p * (1 - p)) / n))), n };
}
