# Token Launch Radar — R7

[![make.fun rank](https://make.fun/badge/zxpast/makefun-token-radar-01-r7/rank.svg)](https://make.fun/bounty/token-radar-01)
[![make.fun reward](https://make.fun/badge/zxpast/makefun-token-radar-01-r7/reward.svg)](https://make.fun/bounty/token-radar-01)
[![make.fun](https://make.fun/badge/zxpast/makefun-token-radar-01-r7/entries.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar for [token-radar-01](https://make.fun/bounty/token-radar-01): every pre-token protocol, ranked by what its token would be worth **if it launches**.

## The model, in one paragraph

A Huber fit on the 119 protocols that already have a token: log₁₀(market cap) = 3.240 + 0.493 · log₁₀(TVL), plus a shrunk-median sector offset (categories with at least 3 live rows only) and half-damped growth, maturity and chain multipliers. Launch odds are a separate category-by-age share, shown as a column and used for the EV in the detail view only — never multiplied into the board's implied value. The farm verdict comes from the net of the slice against the $5 fee alone; the T-bill cost is a memo line in the detail view, never inside the net, because at these ratios no deposit size can cover a capital charge.

## Numbers (measured, not claimed)

| Check | Value | Bar |
|---|---|---|
| Leave-one-out error | 0.9047 dex | ≤ 0.905 |
| Repeated 5-fold error | 0.9066 dex | ≤ 0.915 |
| Walk-forward, last 35 | ×2.09 median miss | ≤ ×2.50 |
| Null walk-forward | ×4.78 | model beats null |
| Size curve alone, category-blind | ×3.36 median miss | ≤ ×3.50 |
| Range holds, P25–75 / P10–90 | 51% / 82% | stated 50% / 80% |
| Board rows / watchlist scored | 198 / 40 of 40 | 40 of 40 |
| Total implied / top-1 | $1.91B / $71.7M | ≤ $1.7B / ≤ $75M |
| Top-10 overlap vs R5 | 10 of 10 | ≥ 9 of 10 |

One bar is missed, stated plainly: the board's total implied value is **$1.91B against a $1.7B bar**. Twenty fitted variants were measured (OLS, Huber at three robustness constants, kNN blends, slope caps, two universes); the lowest total any variant reaches on the 198-row universe while still passing leave-one-out is $1.80B, and the 178-row universe that does pass the total drops the top-10 overlap to 8 of 10 by excluding Sentora and Polymarket. The two bars cannot both be met by a fitted conditional-value model — the total bar is calibrated to the field's odds-multiplied (EV) totals, and this board ranks on the conditional value. The build is submitted for verification with the miss on the record, not hidden. See `BUILD-LOG.md` for the full measurement table.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22, standard library only. Reads the sealed snapshot, writes `board.json`, `data.js`, copies `dashboard/` and `screenshots/` to the output, and writes `dossier.json` with the vendored make.fun library. Deterministic: two runs produce byte-identical output.

## Layout

- `main.ts` — the program.
- `lib/model.ts` — the model, the validation battery, the board builder.
- `dashboard/` — the static page (index.html, app.css, app.js). Reads `data.js` beside it.
- `screenshots/` — the board, a protocol's detail view, a filtered view.
- `vendor/makefun-board.ts` — the kit's library, byte for byte the scorer's own copy.

Built with [make.fun](https://make.fun/bounty/token-radar-01) — a bounty by
make.fun. Referral: `6hmpy1rq`.
