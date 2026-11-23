# token-radar-01 R7 — BUILD-LOG

| Item | Value |
|---|---|
| Date built | 2026-11-23 (WIB) |
| Decision | cycle 47 — BUILD DENGAN SYARAT, Cabang 2 revisi + bar D1–D12 |
| Builder | R7 builder subagent (different agent from verifier K3/K4a and from the R6 builder) |
| Repo | `zxpast/makefun-token-radar-01-r7` — https://github.com/zxpast/makefun-token-radar-01-r7 |
| Code commit (remote) | `92d9303f903c9453f92eb7a3fa2e6ee5913bf487` (main.ts C2c fix; the code verified in §5–§6) |
| This log (remote) | committed on top of the code commit; see the repo for the current HEAD |
| Local HEAD | `335157d` (this BUILD-LOG; same tree as the remote HEAD at push time) |
| Submit | **DO NOT SUBMIT — main agent verifies + bundles + submits after a separate Verifier checks D1–D12** |

## 1. Verdict

**TAHAN — D5-total fails.** 11 of 12 bars pass. The board's total implied value is **$1.9139B against a $1.7B bar** (top-1 $71.69M passes its $75M leg). Twenty fitted variants were measured across two universes (§4); no honest fitted conditional-value model meets the total bar on the 198-row universe while passing leave-one-out, and the 178-row universe that does pass the total drops the top-10 overlap to 8/10 by excluding Sentora and Polymarket. **D5-total and D12 are jointly unachievable for a fitted conditional model** — the total bar is calibrated to the field's odds-multiplied (EV) totals, and this board ranks on the conditional value, as cycle 47 directs. The miss is on the record here, not hidden. The parent decides whether the D5 bar is miscalibrated or the build holds.

## 2. The model (shipped)

Huber IRLS (c = 1.345, 25 rounds) on log₁₀(market cap) over log₁₀(TVL), live set n = 119 (mcap_usd > 0, tvl_usd > 0, not CEX, deduped by symbol then gecko_id, largest TVL kept). Fit: intercept **3.2398**, slope **0.4928**. Sector offset: shrunk median residual, n/(n+20), capped 0.3 dex, **only for categories with ≥ 3 live rows** — a single row (api3 sets Risk Curators alone) is one protocol's quirk, not a category effect. Multipliers, half-damped (damp 0.5): growth (change_7d clipped [−50, +100], ×0.6), maturity (age from listed_at, default 365d, capped 1460d: 0.65 + age/1460 × 0.35), chains (1 + 0.02 × min(max(n−1, 0), 5)). Implied = 10^(3.2398 + 0.4928·log₁₀(TVL) + sector + 0.5·log₁₀(growth × maturity × chains)). Training L0.

Kept from R6: the 10-step farm plan (costed + timed, $5.00 / 38 min) and the value-model validation (held-out / walk-forward / explicit equation). Discarded from R6: the economics inside the net (T-bill) and the three WF numbers on the cover (one WF number only).

**T-bill is a memo, never in the net.** Proof, from the board: the top rows' implied value is 2–3% of TVL, so the slice at the $10,000 deposit cap is $21–$30 while the T-bill is $65.75. With the T-bill inside the net, no deposit size can ever make the top rows positive (raising the deposit makes them more negative, because the T-bill grows with the deposit while the slice grows only with the implied/TVL ratio). R7 net = slice − $5 fee; the T-bill is shown as a memo line in the detail view.

**Launch odds** are the category-by-age share of protocols with a token (mcap_usd > 0 — the definition whose age-bucket shares reproduce the published table: <90d 4%, 90–365d 7%, 1–2y 12%, 2–3y 15%, 3–5y 26%, 5y+ 25%), Laplace-smoothed, cell n ≥ 10 else the age-bucket marginal. Display only: shown as a column, used for the EV in the detail view, **never multiplied into the board's implied value**. Labelled on the page as a cross-sectional share, not a forward hazard.

**Universe: 198 rows** — both-null (gecko_id AND symbol null) + full house exclusions including the version-marker regex from the kit README (`\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$`). That is the house's own rule; R6 kept 3 versioned rows (metric-v1, privacy-pools-v1, rysk-v12) and dropped 8 V2/V3 rows. 40 watchlist + 138 below the $50M floor + 20 off-list above the floor. All 40 watchlist rows scored.

## 3. D1–D12 scorecard (measured from disk, not claimed)

| Bar | Definition | Measured | Result |
|---|---|---|---|
| D1 | LOO ≤ 0.905 | **0.9047** (TS = Python, exact) | PASS (margin 0.0003) |
| D2 | 5-fold ≤ 0.915 | **0.9066** (TS; Python 0.9096, PRNG differs) | PASS |
| D3 | WF-35 ≤ ×2.50 | **×2.09** | PASS |
| D4 | category-blind ≤ ×3.50 | **×3.36** median miss | PASS |
| D5 | total ≤ $1.7B AND top-1 ≤ $75M | total **$1.9139B**, top-1 **$71.69M** | **FAIL (total)** |
| D6 | top-3 net > $0, top-12 FARM ≥ 8, ROBUST first ≤ 12, FARM first ≤ 3 | nets +$21.03/+$20.34/+$30.35; top-12 FARM **12**; ROBUST first **1**; FARM first **1** | PASS |
| D7 | WF-null24 | WF-35 ×2.09 vs null **×4.78** (TS; Python ×5.11) | PASS |
| D8 | EV only in detail view + odds column | one net column; odds column on the board; EV in detail only | PASS |
| D9 | 0 concessions | grep: 0 matches (`cannot calibrate`, `R²`, `not explained`, `does not pretend`, `Break-even: none`) | PASS |
| D10 | ladder printed only if shipped wins LOO AND WF-35 over every step | shipped loses WF-35 to M1 (×2.10 vs ×2.06) → **ladder NOT printed** | PASS (withheld) |
| D11 | range honesty, measured vs stated ±10pp | P25–75 holds **51%** (stated 50%); P10–90 holds **82%** (stated 80%) | PASS |
| D12 | top-10 overlap vs R5 ≥ 9/10 | **10/10** (same set as R6's top-10) | PASS |

D1's margin is 0.0003 — the TypeScript Huber was verified to reproduce the Python LOO exactly (0.9047), so the shipped code passes the bar it was measured against.

## 4. The D5 finding — why the total cannot reach $1.7B

Candidates measured (198-row universe unless noted; D1 ≤ 0.905, D5 total ≤ $1.7B + top-1 ≤ $75M):

| Candidate | LOO | WF-35 | Total | Top-1 | D1 | D5 |
|---|---|---|---|---|---|---|
| C OLS + sector + damp 0.5 (= R5 exact) | 0.9070 | 2.33 | $1.854B | $69.48M | FAIL | FAIL |
| D Huber + sector + damp 0.5 (**shipped**) | 0.9047 | 2.09 | $1.914B | $71.69M | PASS | FAIL |
| E Huber + sector + damp 0.25 | 0.9017 | 2.13 | $2.069B | $81.77M | PASS | FAIL |
| K OLS + sector + damp 0.25 | 0.9043 | 2.19 | $1.972B | $72.43M | PASS | FAIL |
| H Huber + sector + 0.3·kNN | 0.9026 | 2.33 | $2.106B | $81.30M | PASS | FAIL |
| D + slope cap 0.47 | 0.9011 | 2.30 | $1.819B | $62.93M | PASS | FAIL |
| D + slope cap 0.40 | 0.9031 | 2.14 | $1.735B | $46.85M | PASS | FAIL |
| D, 178-row universe (watchlist + below-floor) | 0.9047 | 2.09 | $1.566B | $71.69M | PASS | PASS total, **D12 8/10 FAIL** |

The total has a floor near $1.73B for this model family on the 198-row universe (even a slope cap of 0.40, far below the fitted 0.493, only reaches $1.735B — the intercept refit compensates). The 178-row universe passes the total but drops Sentora (#2) and Polymarket (#10), both off-list and above the $50M floor, so the top-10 overlap caps at 8/10. Including only those two rows back (180 rows) would pass both bars but is universe-gaming — the rule would be "include exactly the rows that make the bars pass" — and is rejected. The slope cap is reported as an explored sensitivity, not shipped: it improves LOO slightly but is a post-hoc parameter and does not change the D5 verdict. The shipped model is the plan's intended variant (Huber + sector + damp 0.5) with the min-n sector guard.

## 5. Dev metrics (from out/board.json + the program's stdout)

| Metric | Value |
|---|---|
| Board rows | 198 |
| Total implied | $1.9139B |
| Top-1 | steakhouse-financial, $71.69M |
| Top-3 net (conditional) | +$21.03 / +$20.34 / +$30.35 |
| FARM / THIN / SKIP | 198 / 0 / 0 |
| ROBUST | 198 |
| Median net | +$103.75 |
| Watchlist scored | 40 / 40 |
| Odds, median / p10 / p90 / range | 0.1243 / 0.0556 / 0.2800 / 0.0545–0.5000 |
| Farm steps | 10, costs sum $5.00, 38 min |
| kNN cross-check, top-1 | $88.39M vs implied $71.69M |
| LOO / 5-fold / WF-35 / WF-null24 / cat-blind | 0.9047 / 0.9066 / ×2.09 / ×4.78 / ×3.36 |
| Range coverage P25–75 / P10–90 | 51% / 82% |
| Dossier | 721,505 bytes total; text 20,452 bytes (cap 65,536); 3 screenshots 1440×1200, 191/145/189 KiB (cap 512 KiB) |
| Determinism | 2 runs byte-identical (board.json sha256 `9c385a79…`, dossier.json sha256 `3e4cdb3e…`) |

**Finding — verdicts are degenerate under the R7 net definition.** With the T-bill out of the net, net = slice − $5 and slice ≥ 0, so net ≥ −$5 always: THIN (net in (−$5, $0]) and SKIP (net ≤ −$5) can never occur. Hence FARM 198/198 and ROBUST 198/198. This is the direct, intended consequence of the B1 T-bill removal (the top rows flip from SKIP to FARM), not a broken verdict rule — but the verdict column now carries no discrimination; the discrimination lives in the ranking and in the net-$ column. The thresholds were NOT changed unilaterally; the Verifier should judge whether they need tightening. The D6 bar passes as written.

**Finding — ladder (D10).** Step-ladder, LOO / WF-35: M1 0.9054 / 2.064; V2_half 0.9106 / 2.33; C 0.9075 / 2.33; shipped D 0.9047 / 2.095. The shipped model beats every step on LOO but loses the walk-forward to the flat size curve (×2.10 vs ×2.06), so the ladder is NOT printed on the dashboard. The dashboard states the reason with the shipped-vs-flat numbers only.

## 6. Technical gates

- **G0–G5 / harness:** Node 22 stdlib only; no network; no `process.exit()` on the happy path; program writes board.json + data.js + dashboard + screenshots + dossier.json; dossier built with the kit's vendored `makefun-board.ts` (byte-for-byte the scorer's copy, verified by diff); text 20,452 B < 65,536; dossier 721,505 B < 1.5 MiB; screenshots 1440×1200, each < 512 KiB. Screenshots viewed first-hand: board (12 rows, formula, 6 KPI cards, integrity line, search + what-if), detail (Steakhouse: value steps, 10-step farm plan, T-bill memo, comps with the <3-live-rows flag), filtered (watchlist, 40 rows).
- **Determinism:** two runs produce byte-identical output (diff -r clean). A stale-file test (junk placed in the output dir) confirms the new prepare step removes it.
- **cycle39 C1–C9** (script `diagnosis/cycle39-pre-submit-check.sh`): C1 PASS, C1b PASS, C2 PASS, C2b PASS, C2c PASS (after the main.ts fix — the entrypoint now empties the output contents via readdirSync, never the directory itself), C3 PASS after commit, C4 SKIP (not meme-x), C5 PASS, C6 SKIP, C7 SKIP (no bundle given — the parent runs `makefun check --transcripts` at bundle time), C9 SKIP (the script invokes the entrypoint without `--input`; determinism was verified manually 2× byte-identical instead).
- **Authorship:** all R7 code (main.ts, lib/model.ts, dashboard/*) written fresh in this session from the plan + the author's own Python exploration. The R5/R6 repo source files were NOT read. The kit starter was read only for the program contract (buildDossier call, output layout); the kit vendor file is copied byte-for-byte as the kit requires. The model numbers were reproduced independently in Python first (LOO 0.9047 matches exactly between the Python exploration and the shipped TypeScript).

## 7. Build fixes made in-session (all committed)

| Fix | Cause |
|---|---|
| `floorUsd` added to the Radar meta | integrity line printed `$NaNM` (the field was missing) |
| Detail view: `detail-only` body class for `?detail=` | headless `--screenshot` does not follow a scripted scroll reliably (measured: scrollY=507, detailTop=0, yet the capture showed a 400px gap); the detail panel is now the whole page in that mode, no scroll needed |
| main.ts: empty output contents via readdirSync | cycle39 C2c FAIL → PASS; stale-file test confirms junk is removed |
| Remote repo: `out/` removed | push_repo.py uploads the local dir without respecting .gitignore, so the first push carried `out/`; fixed with a two-commit gitdata push (temp commit matching the remote tree, then the removal). GitHub token has no delete_repo scope, so delete + recreate was not possible. Remote HEAD is now `42d1cabf`, tree `3136f988` = the clean 13-file tree |

## 8. What the parent / Verifier still needs to decide

1. **D5-total:** accept the $1.9139B total as the honest level of a conditional-value board (the bar looks calibrated to EV totals), or hold the build. The measurement table in §4 is the evidence.
2. **Verdict thresholds:** whether FARM/THIN/SKIP needs a stricter rule now that the T-bill is a memo (see §5).
3. **D1 margin:** 0.0003 is thin; the shipped TypeScript reproduces the Python LOO exactly, but any future model touch must re-measure it.
