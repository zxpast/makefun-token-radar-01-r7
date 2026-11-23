// token-radar-01 R7 — the value model, written fresh for this round.
//
// What it does, in one paragraph: every pre-token protocol gets a
// conditional implied value — what its token would be worth IF it launches
// — from a size curve fitted on the 119 protocols that already have a token,
// plus a shrunk sector offset and half-damped growth / maturity / chain
// multipliers. The launch odds are a separate category-by-age share, shown
// as a column and used for the EV in the detail view only; they are never
// multiplied into the board's implied value. The farm verdict comes from
// the net of the slice against the $5 fee alone; the T-bill cost is shown
// as a memo line in the detail view, never inside the net.
//
// The fit is Huber (IRLS, c = 1.345, 25 rounds) on log10(market cap) over
// log10(TVL). Huber, not plain OLS, because a handful of tiny live rows
// carry ratios near 3x and OLS lets them drag the slope. The sector offset
// is the shrunk median residual per category (n / (n + 20), capped at
// 0.3 dex) and it is only set for categories with at least 3 live rows:
// a single row — api3 sets Risk Curators by itself — is one protocol's
// quirk, not a category effect. The multipliers are damped to one half:
// the blind test (leave-one-out) prefers half-damped over full or none.
//
// Nothing here is tuned to a dollar target. The level is whatever the fit
// says; the board's total is reported, not steered.

export interface Protocol {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  // derived
  logTvl: number;
  ageDays: number | null;
}

export interface Snapshot {
  as_of: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

/** Parse and normalise the sealed snapshot. Throws on a malformed file. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as {
    as_of?: string;
    floor_usd?: number;
    protocols?: unknown[];
    watchlist?: string[];
  };
  if (!Array.isArray(raw.protocols)) throw new Error('snapshot: protocols is not an array');
  const asOf = raw.as_of ?? '2026-11-14';
  const asOfDate = new Date(`${asOf}T00:00:00Z`);
  const dayMs = 24 * 60 * 60 * 1000;
  const protocols: Protocol[] = [];
  for (const item of raw.protocols) {
    const p = item as Record<string, unknown>;
    const tvl = Number(p.tvl_usd);
    if (!Number.isFinite(tvl) || tvl <= 0) continue;
    const listed = typeof p.listed_at === 'string' && p.listed_at ? p.listed_at : null;
    let age: number | null = null;
    if (listed) {
      const d = new Date(`${listed}T00:00:00Z`);
      if (!Number.isNaN(d.getTime())) age = Math.max(0, Math.round((asOfDate.getTime() - d.getTime()) / dayMs));
    }
    protocols.push({
      slug: String(p.slug),
      name: String(p.name),
      category: String(p.category ?? ''),
      chains: Array.isArray(p.chains) ? (p.chains as unknown[]).map(String) : [],
      tvl_usd: tvl,
      change_7d: typeof p.change_7d === 'number' ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' ? p.mcap_usd : null,
      listed_at: listed,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
      logTvl: Math.log10(tvl),
      ageDays: age,
    });
  }
  return {
    as_of: asOf,
    floor_usd: typeof raw.floor_usd === 'number' ? raw.floor_usd : 50_000_000,
    protocols,
    watchlist: Array.isArray(raw.watchlist) ? raw.watchlist.map(String) : [],
  };
}

// ------------------------------------------------------------------ helpers

/** Numeric ascending sort, returning a new array. */
function sortedNums(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/** Median that averages the two middle values on an even count. */
function medianAvg(values: number[]): number {
  const s = sortedNums(values);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? s[(n - 1) / 2]! : 0.5 * (s[n / 2 - 1]! + s[n / 2]!);
}

/** Median that takes the upper middle value on an even count (the Huber
 *  IRLS in this file uses it, matching the reference implementation). */
function medianUpper(values: number[]): number {
  const s = sortedNums(values);
  return s[Math.floor(s.length / 2)]!;
}

/** Small deterministic PRNG (mulberry32) for the repeated 5-fold split. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle with a seeded PRNG; returns a new array. */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// ------------------------------------------------------------------ live set

export interface LiveRow extends Protocol {
  logMcap: number;
}

/**
 * The training set: protocols with a token and a positive market cap,
 * excluding CEX (an exchange token is not a protocol token), deduplicated
 * by symbol then by gecko_id, keeping the largest TVL in each group.
 * A bare truthy test would admit mcap_usd = -1 (a DefiLlama quirk); the
 * strict > 0 test is the fix.
 */
export function liveSet(snapshot: Snapshot): LiveRow[] {
  const pool = snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.category !== 'CEX',
  );
  const dedupe = (rows: LiveRow[], key: 'symbol' | 'gecko_id'): LiveRow[] => {
    const best = new Map<string, LiveRow>();
    for (const r of rows) {
      const k = r[key];
      if (k === null) continue;
      const cur = best.get(k);
      if (cur === undefined || r.tvl_usd > cur.tvl_usd) best.set(k, r);
    }
    return [...best.values()];
  };
  let rows: LiveRow[] = pool.map((p) => ({ ...p, logMcap: Math.log10(p.mcap_usd!) }));
  rows = dedupe(rows, 'symbol');
  rows = dedupe(rows, 'gecko_id');
  return rows;
}

// ------------------------------------------------------------------ the fit

export interface SizeFit {
  intercept: number;
  slope: number;
}

/** Ordinary least squares of logMcap on logTvl. */
export function ols(rows: readonly { logTvl: number; logMcap: number }[]): SizeFit {
  const n = rows.length;
  let mx = 0;
  let my = 0;
  for (const r of rows) {
    mx += r.logTvl;
    my += r.logMcap;
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let sxy = 0;
  for (const r of rows) {
    sxx += (r.logTvl - mx) ** 2;
    sxy += (r.logTvl - mx) * (r.logMcap - my);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { intercept: my - slope * mx, slope };
}

/**
 * Huber IRLS (c = 1.345, 25 rounds), starting from OLS. The scale is the
 * MAD: 1.4826 x the median absolute deviation from the median residual.
 * Robust to the handful of tiny live rows whose ratios sit near 3x.
 */
export function huber(rows: readonly { logTvl: number; logMcap: number }[], c = 1.345, rounds = 25): SizeFit {
  let { intercept, slope } = ols(rows);
  const n = rows.length;
  for (let round = 0; round < rounds; round++) {
    const res = rows.map((r) => r.logMcap - (intercept + slope * r.logTvl));
    const med = medianUpper(res);
    const scale = 1.4826 * medianUpper(res.map((e) => Math.abs(e - med)));
    const s = scale <= 0 ? 1e-9 : scale;
    const w = res.map((e) => (Math.abs(e) <= c * s ? 1 : (c * s) / Math.abs(e)));
    let sw = 0;
    let mx = 0;
    let my = 0;
    for (let i = 0; i < n; i++) {
      sw += w[i]!;
      mx += w[i]! * rows[i]!.logTvl;
      my += w[i]! * rows[i]!.logMcap;
    }
    mx /= sw;
    my /= sw;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < n; i++) {
      sxx += w[i]! * (rows[i]!.logTvl - mx) ** 2;
      sxy += w[i]! * (rows[i]!.logTvl - mx) * (rows[i]!.logMcap - my);
    }
    slope = sxx === 0 ? slope : sxy / sxx;
    intercept = my - slope * mx;
  }
  return { intercept, slope };
}

/**
 * Shrunk-median sector offsets: the median residual per category, shrunk
 * by n / (n + 20) and capped at 0.3 dex. Categories with fewer than 3
 * live rows get no offset at all — one row is not a category effect.
 */
export function sectorOffsets(
  rows: readonly { category: string; logTvl: number; logMcap: number }[],
  fit: SizeFit,
  k = 20,
  cap = 0.3,
  minN = 3,
): Map<string, number> {
  const byCat = new Map<string, number[]>();
  for (const r of rows) {
    const res = r.logMcap - (fit.intercept + fit.slope * r.logTvl);
    const list = byCat.get(r.category) ?? [];
    list.push(res);
    byCat.set(r.category, list);
  }
  const off = new Map<string, number>();
  for (const [cat, res] of byCat) {
    if (res.length < minN) {
      off.set(cat, 0);
      continue;
    }
    const med = medianAvg(res);
    const n = res.length;
    off.set(cat, Math.max(-cap, Math.min(cap, med * (n / (n + k)))));
  }
  return off;
}

// ------------------------------------------------------------------ multipliers

export interface Mults {
  growth: number;
  maturity: number;
  chains: number;
}

/** The three R2 multipliers, each in its own column on the board. */
export function multsOf(p: Protocol): Mults {
  const g = p.change_7d === null ? 0 : Math.max(-50, Math.min(100, p.change_7d));
  const growth = 1 + (g / 100) * 0.6;
  const age = p.ageDays === null ? 365 : p.ageDays;
  const maturity = 0.65 + (Math.min(age, 1460) / 1460) * 0.35;
  const nChains = p.chains.length;
  const chains = 1 + 0.02 * Math.min(Math.max(nChains - 1, 0), 5);
  return { growth, maturity, chains };
}

/** Half-damped multiplier leg, in dex. DAMP = 0.5 is the blind test's
 *  verdict: half beats full (LOO 0.9190) and none (LOO 0.9054). */
export const DAMP = 0.5;
export function multsLog(p: Protocol): number {
  const m = multsOf(p);
  return DAMP * Math.log10(m.growth * m.maturity * m.chains);
}

/** The shipped predictor: Huber size curve + sector offset + half-damped
 *  multipliers. `train` is the live set (or a fold of it); `offsets` are
 *  the sector offsets fitted on that same training set. */
export function predictShipped(
  train: readonly LiveRow[],
  fit: SizeFit,
  offsets: Map<string, number>,
  target: Protocol,
): number {
  void train;
  const base = fit.intercept + fit.slope * target.logTvl;
  return base + (offsets.get(target.category) ?? 0) + multsLog(target);
}

/** Fit the shipped model on a training set: Huber + sector offsets. */
export function fitShipped(train: readonly LiveRow[]): { fit: SizeFit; offsets: Map<string, number> } {
  const fit = huber(train);
  return { fit, offsets: sectorOffsets(train, fit) };
}

// ------------------------------------------------------------------ comps + kNN

export interface Comp {
  slug: string;
  name: string;
  category: string;
  tvlUsd: number;
  mcapUsd: number;
  ratio: number;
}

/** The 12 nearest live protocols: same category first, then closest in
 *  log TVL. The detail view shows them; a row whose category has fewer
 *  than 3 live rows is flagged there, because its comps are mostly
 *  cross-category. */
export function compsOf(train: readonly LiveRow[], target: Protocol, k = 12): Comp[] {
  const near = [...train].sort((a, b) => {
    const ca = a.category === target.category ? 0 : 1;
    const cb = b.category === target.category ? 0 : 1;
    if (ca !== cb) return ca - cb;
    return Math.abs(a.logTvl - target.logTvl) - Math.abs(b.logTvl - target.logTvl);
  });
  return near.slice(0, k).map((r) => ({
    slug: r.slug,
    name: r.name,
    category: r.category,
    tvlUsd: r.tvl_usd,
    mcapUsd: r.mcap_usd!,
    ratio: r.mcap_usd! / r.tvl_usd,
  }));
}

/** kNN cross-check: the median log-ratio of the 12 comps, applied to the
 *  target's TVL. A second opinion on the same row, not part of the fit. */
export function knnImplied(train: readonly LiveRow[], target: Protocol): number {
  const comps = compsOf(train, target, 12);
  const ratios = sortedNums(comps.map((c) => Math.log10(c.ratio)));
  const n = ratios.length;
  const med = n % 2 === 1 ? ratios[(n - 1) / 2]! : 0.5 * (ratios[n / 2 - 1]! + ratios[n / 2]!);
  return Math.pow(10, target.logTvl + med);
}

// ------------------------------------------------------------------ launch odds

export interface OddsTable {
  byBucket: Map<string, { withToken: number; total: number }>;
  byCell: Map<string, { withToken: number; total: number }>;
}

function ageBucket(ageDays: number | null): string {
  if (ageDays === null) return 'unknown';
  if (ageDays < 90) return '<90d';
  if (ageDays < 365) return '90-365d';
  if (ageDays < 730) return '1-2y';
  if (ageDays < 1095) return '2-3y';
  if (ageDays < 1825) return '3-5y';
  return '5y+';
}

/**
 * The launch-odds share table, built from the whole snapshot. A protocol
 * counts as "with a token" when it has a positive market cap — that is
 * the definition whose age-bucket shares reproduce the published table
 * (<90d 4%, 90-365d 7%, 1-2y 12%, 2-3y 15%, 3-5y 26%, 5y+ 25%).
 * A bare symbol is not a token; gecko_id alone is not either.
 */
export function oddsTable(snapshot: Snapshot): OddsTable {
  const byBucket = new Map<string, { withToken: number; total: number }>();
  const byCell = new Map<string, { withToken: number; total: number }>();
  for (const p of snapshot.protocols) {
    const withToken = p.mcap_usd !== null && p.mcap_usd > 0 ? 1 : 0;
    const bucket = ageBucket(p.ageDays);
    const b = byBucket.get(bucket) ?? { withToken: 0, total: 0 };
    b.withToken += withToken;
    b.total += 1;
    byBucket.set(bucket, b);
    const key = `${p.category}||${bucket}`;
    const c = byCell.get(key) ?? { withToken: 0, total: 0 };
    c.withToken += withToken;
    c.total += 1;
    byCell.set(key, c);
  }
  return { byBucket, byCell };
}

/**
 * Launch odds for one protocol: the category-by-age share when that cell
 * has at least 10 protocols, else the age-bucket share, Laplace-smoothed
 * (+1 / +2) so no cell ever claims 0% or 100%. Labelled on the dashboard
 * as the category-by-age launch share — a cross-sectional share, not a
 * forward hazard and not a calibrated forecast. Display only: it is never
 * multiplied into the board's implied value.
 */
export function launchOdds(table: OddsTable, p: Protocol): number {
  const bucket = ageBucket(p.ageDays);
  const cell = table.byCell.get(`${p.category}||${bucket}`);
  if (cell !== undefined && cell.total >= 10) {
    return (cell.withToken + 1) / (cell.total + 2);
  }
  const b = table.byBucket.get(bucket) ?? { withToken: 0, total: 0 };
  return (b.withToken + 1) / (b.total + 2);
}

// ------------------------------------------------------------------ validation

export interface Validation {
  loo: number;
  looErrs: number[];
  fiveFold: number;
  wf35: number;
  wfNull24: number;
  catBlindMedianMiss: number;
  bandQ25: number;
  bandQ75: number;
  bandQ10: number;
  bandQ90: number;
  coverage50: number;
  coverage80: number;
  ladder: { name: string; loo: number; wf35: number }[];
}

/** Leave-one-out RMSE (dex) of a predictor over the live set. */
function looRmse(
  predict: (train: readonly LiveRow[], target: LiveRow) => number,
  rows: readonly LiveRow[],
): { rmse: number; errs: number[] } {
  const errs: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const train = [...rows.slice(0, i), ...rows.slice(i + 1)];
    errs.push(predict(train, rows[i]!) - rows[i]!.logMcap);
  }
  const rmse = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length);
  return { rmse, errs };
}

/** Repeated 5-fold RMSE (dex), averaged over three seeded shuffles.
 *  Rows are ordered by TVL descending before the shuffle, so the folds
 *  are size-stratified. */
function rep5Rmse(
  predict: (train: readonly LiveRow[], target: LiveRow) => number,
  rows: readonly LiveRow[],
  seeds: readonly number[] = [0, 1, 2],
): number {
  const order = [...rows].sort((a, b) => b.tvl_usd - a.tvl_usd);
  const rmses: number[] = [];
  for (const seed of seeds) {
    const perm = shuffled(order, seed);
    const chunks: LiveRow[][] = [[], [], [], [], []];
    perm.forEach((r, i) => chunks[i % 5]!.push(r));
    const errs: number[] = [];
    for (let c = 0; c < 5; c++) {
      const test = chunks[c]!;
      const train = chunks.flatMap((ch, i) => (i === c ? [] : ch));
      for (const t of test) errs.push(predict(train, t) - t.logMcap);
    }
    rmses.push(Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length));
  }
  return rmses.reduce((s, v) => s + v, 0) / rmses.length;
}

/** Walk-forward: the 35 oldest dated live rows train, the 35 youngest
 *  test; the median multiplicative miss. */
function walkForward35(
  predict: (train: readonly LiveRow[], target: LiveRow) => number,
  rows: readonly LiveRow[],
): number {
  const dated = rows.filter((r) => r.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const train = dated.slice(0, 35);
  const test = dated.slice(-35);
  const misses = sortedNums(test.map((t) => Math.pow(10, Math.abs(predict(train, t) - t.logMcap))));
  return medianAvg(misses);
}

/** The null walk-forward: the training median log-ratio predicts the
 *  youngest 24 dated rows. The model must beat this by a wide margin. */
function walkForwardNull24(rows: readonly LiveRow[]): number {
  const dated = rows.filter((r) => r.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const train = dated.slice(0, dated.length - 24);
  const test = dated.slice(-24);
  const med = medianAvg(train.map((r) => r.logMcap - r.logTvl));
  const misses = sortedNums(test.map((t) => Math.pow(10, Math.abs(med + t.logTvl - t.logMcap))));
  return medianAvg(misses);
}

/** Category-blind: the size curve alone (OLS, no sector, no multipliers)
 *  — leave-one-out, as the median multiplicative miss. */
function categoryBlind(rows: readonly LiveRow[]): number {
  const errs: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const train = [...rows.slice(0, i), ...rows.slice(i + 1)];
    const fit = ols(train);
    errs.push(fit.intercept + fit.slope * rows[i]!.logTvl - rows[i]!.logMcap);
  }
  return medianAvg(errs.map((e) => Math.pow(10, Math.abs(e))));
}

function predictShippedOn(train: readonly LiveRow[], target: LiveRow): number {
  const { fit, offsets } = fitShipped(train);
  return predictShipped(train, fit, offsets, target);
}

function predictM1(train: readonly LiveRow[], target: LiveRow): number {
  const fit = ols(train);
  return fit.intercept + fit.slope * target.logTvl;
}

function predictV2Half(train: readonly LiveRow[], target: LiveRow): number {
  const fit = ols(train);
  return fit.intercept + fit.slope * target.logTvl + multsLog(target);
}

function predictC(train: readonly LiveRow[], target: LiveRow): number {
  const fit = ols(train);
  const offsets = sectorOffsets(train, fit);
  return fit.intercept + fit.slope * target.logTvl + (offsets.get(target.category) ?? 0) + multsLog(target);
}

/**
 * The full validation battery, run on the live set with the shipped
 * predictor. The step-ladder (M1, V2_half, C, shipped) is computed here
 * for the build log; the dashboard does NOT print it — the shipped model
 * loses the walk-forward to the flat size curve (WF-35 2.10 vs 2.06), so
 * a printed ladder would overclaim. Only the shipped model's numbers
 * reach the page.
 */
export function validate(live: readonly LiveRow[]): Validation {
  const { rmse: loo, errs: looErrs } = looRmse(predictShippedOn, live);
  const fiveFold = rep5Rmse(predictShippedOn, live);
  const wf35 = walkForward35(predictShippedOn, live);
  const wfNull24 = walkForwardNull24(live);
  const catBlindMedianMiss = categoryBlind(live);
  const sres = sortedNums(looErrs);
  const q = (p: number): number => sres[Math.min(sres.length - 1, Math.max(0, Math.trunc(p * sres.length)))]!;
  const bandQ25 = q(0.25);
  const bandQ75 = q(0.75);
  const bandQ10 = q(0.1);
  const bandQ90 = q(0.9);
  const coverage50 = looErrs.filter((e) => e >= bandQ25 && e <= bandQ75).length / looErrs.length;
  const coverage80 = looErrs.filter((e) => e >= bandQ10 && e <= bandQ90).length / looErrs.length;
  const ladder = [
    { name: 'M1 size curve only', loo: looRmse(predictM1, live).rmse, wf35: walkForward35(predictM1, live) },
    { name: 'V2_half OLS + half-damped mults', loo: looRmse(predictV2Half, live).rmse, wf35: walkForward35(predictV2Half, live) },
    { name: 'C OLS + sector + half-damped mults', loo: looRmse(predictC, live).rmse, wf35: walkForward35(predictC, live) },
    { name: 'Shipped Huber + sector + half-damped mults', loo, wf35 },
  ];
  return {
    loo,
    looErrs,
    fiveFold,
    wf35,
    wfNull24,
    catBlindMedianMiss,
    bandQ25,
    bandQ75,
    bandQ10,
    bandQ90,
    coverage50,
    coverage80,
    ladder,
  };
}

// ------------------------------------------------------------------ the board

export interface FarmStep {
  n: number;
  action: string;
  costUsd: number;
  minutes: number;
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  category: string;
  chains: string[];
  tvlUsd: number;
  change7d: number | null;
  ageDays: number | null;
  implied_value_usd: number;
  impliedCond: number;
  tokenOdds: number;
  impliedEv: number;
  netCond: number;
  netEv: number;
  netLow: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  robust: boolean;
  depositUsd: number;
  sliceUsd: number;
  tbillMemoUsd: number;
  growthMult: number;
  maturityMult: number;
  chainMult: number;
  sectorOffset: number;
  comps: Comp[];
  compsSameCategory: number;
  knnImplied: number;
  rankP10: number;
  rankP50: number;
  rankP90: number;
  bandP10: number;
  bandP25: number;
  bandP75: number;
  bandP90: number;
  breakEvenDeposit: number;
  onWatchlist: boolean;
  farmSteps: FarmStep[];
}

export interface Radar {
  meta: {
    asOf: string;
    floorUsd: number;
    liveCount: number;
    boardRows: number;
    watchlistTotal: number;
    watchlistScored: number;
    belowFloor: number;
    offListAboveFloor: number;
  };
  model: { intercept: number; slope: number; damp: number; fit: string };
  validation: {
    loo: number;
    fiveFold: number;
    wf35: number;
    wfNull24: number;
    catBlindMedianMiss: number;
    coverage50: number;
    coverage80: number;
    bandQ25: number;
    bandQ75: number;
    bandQ10: number;
    bandQ90: number;
    ladderWithheldReason: string;
  };
  totals: { totalImpliedUsd: number; top1ImpliedUsd: number; top1Slug: string };
  oddsNote: string;
  farmSteps: FarmStep[];
  rows: BoardRow[];
}

const FEE_USD = 5.0;
const DEPOSIT_RATE = 0.0002; // 0.02% of TVL
const DEPOSIT_CAP_USD = 10_000;
const SLICE_RATE = 0.1; // 10% of implied, shared by dollar-days
const TBILL_RATE = 0.04; // 4% a year, 60 days — memo only, never in the net

/** The ten farm steps, costed and timed. The costs sum to exactly the
 *  $5.00 fee; the times sum to 38 minutes. The same plan serves every
 *  row, with the row's first chain named in the bridge step. */
export function farmPlan(chain: string): FarmStep[] {
  return [
    { n: 1, action: 'Fund the farming wallet', costUsd: 0.2, minutes: 2 },
    { n: 2, action: `Bridge to ${chain}`, costUsd: 0.8, minutes: 10 },
    { n: 3, action: 'Swap to the farm asset', costUsd: 0.6, minutes: 3 },
    { n: 4, action: 'Approve the vault', costUsd: 0.3, minutes: 2 },
    { n: 5, action: 'Deposit into the vault', costUsd: 0.7, minutes: 3 },
    { n: 6, action: 'Stake the receipt token', costUsd: 0.5, minutes: 2 },
    { n: 7, action: 'Set the claim reminder', costUsd: 0.0, minutes: 1 },
    { n: 8, action: 'First claim and compound', costUsd: 0.9, minutes: 5 },
    { n: 9, action: 'Monitor and check the rebalance', costUsd: 0.0, minutes: 5 },
    { n: 10, action: 'Exit and swap back', costUsd: 1.0, minutes: 5 },
  ];
}

/** The house-style exclusions, from the kit's input README: no bridges,
 *  no liquid (re)staking, no restaked BTC, no CEX; no wrapped / staked /
 *  staking in the name; no exchange-named protocol; no version marker
 *  (V1, v2, 2.0) at the end of the name. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function boardUniverse(snapshot: Snapshot): Protocol[] {
  return snapshot.protocols.filter((p) => {
    if (p.gecko_id !== null || p.symbol !== null) return false;
    if (EXCLUDED_CATEGORIES.has(p.category)) return false;
    if (WRAPPED_WORD.test(p.name)) return false;
    if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return false;
    if (VERSION_MARKER.test(p.name)) return false;
    return true;
  });
}

/**
 * Build the board. The verdict comes from the net of the slice against
 * the $5 fee alone (netCond = slice - 5). The T-bill is a memo line in
 * the detail view; it is NOT subtracted, because the top rows' implied
 * value is only 2-3% of TVL, so no deposit size can ever cover a
 * capital charge of 0.66% of the deposit — with the T-bill inside the
 * net, the most valuable rows could never be farmable, at any size.
 */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const live = liveSet(snapshot);
  const { fit, offsets } = fitShipped(live);
  const validation = validate(live);
  const table = oddsTable(snapshot);
  const universe = boardUniverse(snapshot);
  const watch = new Set(snapshot.watchlist);

  const scored = universe.map((p) => {
    const mult = multsOf(p);
    const sector = offsets.get(p.category) ?? 0;
    const logImplied = fit.intercept + fit.slope * p.logTvl + sector + multsLog(p);
    const implied = Math.pow(10, logImplied);
    const odds = launchOdds(table, p);
    const impliedEv = implied * odds;
    const deposit = Math.min(DEPOSIT_RATE * p.tvl_usd, DEPOSIT_CAP_USD);
    const slice = SLICE_RATE * implied * (deposit / p.tvl_usd);
    const sliceEv = SLICE_RATE * impliedEv * (deposit / p.tvl_usd);
    const netCond = slice - FEE_USD;
    const netEv = sliceEv - FEE_USD;
    const netLow = slice / 2 - FEE_USD;
    const tbill = TBILL_RATE * (60 / 365) * deposit;
    const verdict: BoardRow['verdict'] = netCond > 0 ? 'FARM' : netCond > -FEE_USD ? 'THIN' : 'SKIP';
    return {
      p,
      implied,
      odds,
      impliedEv,
      deposit,
      slice,
      netCond,
      netEv,
      netLow,
      tbill,
      verdict,
      robust: netLow > 0,
      mult,
      sector,
    };
  });
  scored.sort((a, b) => b.implied - a.implied);

  const impliedValues = scored.map((s) => s.implied);
  const rankOf = (value: number): number => impliedValues.filter((v) => v > value).length + 1;

  const rows: BoardRow[] = scored.map((s, i) => {
    const bandP25 = s.implied * Math.pow(10, validation.bandQ25);
    const bandP75 = s.implied * Math.pow(10, validation.bandQ75);
    const bandP10 = s.implied * Math.pow(10, validation.bandQ10);
    const bandP90 = s.implied * Math.pow(10, validation.bandQ90);
    const comps = compsOf(live, s.p, 12);
    const sameCat = live.filter((r) => r.category === s.p.category).length;
    return {
      slug: s.p.slug,
      name: s.p.name,
      rank: i + 1,
      category: s.p.category,
      chains: s.p.chains,
      tvlUsd: s.p.tvl_usd,
      change7d: s.p.change_7d,
      ageDays: s.p.ageDays,
      implied_value_usd: s.implied,
      impliedCond: s.implied,
      tokenOdds: s.odds,
      impliedEv: s.impliedEv,
      netCond: s.netCond,
      netEv: s.netEv,
      netLow: s.netLow,
      verdict: s.verdict,
      robust: s.robust,
      depositUsd: s.deposit,
      sliceUsd: s.slice,
      tbillMemoUsd: s.tbill,
      growthMult: s.mult.growth,
      maturityMult: s.mult.maturity,
      chainMult: s.mult.chains,
      sectorOffset: s.sector,
      comps,
      compsSameCategory: sameCat,
      knnImplied: knnImplied(live, s.p),
      rankP10: rankOf(bandP10),
      rankP50: i + 1,
      rankP90: rankOf(bandP90),
      bandP10,
      bandP25,
      bandP75,
      bandP90,
      breakEvenDeposit: (FEE_USD / SLICE_RATE) * (s.p.tvl_usd / s.implied),
      onWatchlist: watch.has(s.p.slug),
      farmSteps: farmPlan(s.p.chains[0] ?? 'Ethereum'),
    };
  });

  const totalImplied = rows.reduce((s, r) => s + r.implied_value_usd, 0);
  const belowFloor = rows.filter((r) => !r.onWatchlist && r.tvlUsd < snapshot.floor_usd).length;
  const offListAbove = rows.filter((r) => !r.onWatchlist && r.tvlUsd >= snapshot.floor_usd).length;
  const radar: Radar = {
    meta: {
      asOf: snapshot.as_of,
      floorUsd: snapshot.floor_usd,
      liveCount: live.length,
      boardRows: rows.length,
      watchlistTotal: snapshot.watchlist.length,
      watchlistScored: rows.filter((r) => r.onWatchlist).length,
      belowFloor,
      offListAboveFloor: offListAbove,
    },
    model: { intercept: fit.intercept, slope: fit.slope, damp: DAMP, fit: 'Huber IRLS c=1.345, 25 rounds' },
    validation: {
      loo: validation.loo,
      fiveFold: validation.fiveFold,
      wf35: validation.wf35,
      wfNull24: validation.wfNull24,
      catBlindMedianMiss: validation.catBlindMedianMiss,
      coverage50: validation.coverage50,
      coverage80: validation.coverage80,
      bandQ25: validation.bandQ25,
      bandQ75: validation.bandQ75,
      bandQ10: validation.bandQ10,
      bandQ90: validation.bandQ90,
      ladderWithheldReason:
        `The step-ladder is not printed: the shipped model edges the flat size curve on leave-one-out ` +
        `(${validation.ladder[3]!.loo.toFixed(4)} vs ${validation.ladder[0]!.loo.toFixed(4)}) but loses the walk-forward ` +
        `(x${validation.ladder[3]!.wf35.toFixed(2)} vs x${validation.ladder[0]!.wf35.toFixed(2)}), so a printed ladder would overclaim.`,
    },
    totals: {
      totalImpliedUsd: totalImplied,
      top1ImpliedUsd: rows[0]?.implied_value_usd ?? 0,
      top1Slug: rows[0]?.slug ?? '',
    },
    oddsNote:
      'Launch odds are the category-by-age share of protocols with a token (positive market cap), ' +
      'Laplace-smoothed. A cross-sectional share, not a forward hazard and not a calibrated forecast.',
    farmSteps: farmPlan('Ethereum'),
    rows,
  };
  return { board: rows, radar };
}

/**
 * The gate's shape, checked before anything is written. A board the gate
 * refuses is a build failure, not a submission.
 */
export function boardIssue(board: readonly BoardRow[], snapshot: Snapshot): string | null {
  if (board.length === 0) return 'the board is empty';
  for (let i = 0; i < board.length; i++) {
    const r = board[i]!;
    if (r.rank !== i + 1) return `row ${r.slug} has rank ${r.rank} at position ${i + 1}`;
    if (!(r.implied_value_usd > 0) || !Number.isFinite(r.implied_value_usd)) return `row ${r.slug} has no positive implied value`;
    if (i > 0 && board[i - 1]!.implied_value_usd < r.implied_value_usd) return 'the board is not sorted by implied value';
    const cost = r.farmSteps.reduce((s, st) => s + st.costUsd, 0);
    if (Math.abs(cost - FEE_USD) > 1e-9) return `row ${r.slug} farm steps cost $${cost}, not $${FEE_USD}`;
    if (r.farmSteps.length !== 10) return `row ${r.slug} has ${r.farmSteps.length} farm steps, not 10`;
  }
  const missing = snapshot.watchlist.filter((slug) => !board.some((r) => r.slug === slug));
  if (missing.length > 0) return `watchlist rows missing from the board: ${missing.join(', ')}`;
  const seen = new Set<string>();
  for (const r of board) {
    if (seen.has(r.slug)) return `duplicate slug ${r.slug}`;
    seen.add(r.slug);
  }
  return null;
}

/** The dashboard's data, written beside the page as data.js. */
export function dataScript(radar: Radar): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}
