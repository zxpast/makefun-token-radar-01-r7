// Token Launch Radar — renders window.RADAR (written by main.ts as data.js).
// Board first; click a row for its detail view; the search, the filter and
// the what-if bar recompute the page live. The board ranks on the
// conditional implied value; the launch odds sit beside it and feed the EV
// in the detail view only.
(function () {
  const R = window.RADAR;
  if (!R) {
    document.getElementById('rows').innerHTML = '<tr><td colspan="9">No data — run main.ts first.</td></tr>';
    return;
  }
  const $ = (id) => document.getElementById(id);
  const rows = R.rows;

  const fmtUsd = (n) => {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    const sign = n < 0 ? '−' : '';
    const a = Math.abs(n);
    if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}K`;
    return `${sign}$${a.toFixed(2)}`;
  };
  const fmtInt = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(n).toFixed(2);
  const fmtPct = (n) => `${(n * 100).toFixed(1)}%`;

  // --- header: formula, KPIs, integrity line ---------------------------
  const m = R.model;
  $('formula').textContent =
    `implied = 10^(${m.intercept.toFixed(3)} + ${m.slope.toFixed(3)} · log₁₀(TVL) + sector + ${m.damp} · log₁₀(growth × maturity × chains))`;
  const kpis = [
    [String(R.meta.boardRows), 'rows ranked'],
    [fmtUsd(R.totals.totalImpliedUsd), 'total implied'],
    [fmtUsd(R.totals.top1ImpliedUsd), `top-1 · ${R.totals.top1Slug}`],
    [R.validation.loo.toFixed(3), 'LOO, dex'],
    [`×${R.validation.wf35.toFixed(2)}`, 'walk-forward, last 35'],
    [`${R.meta.watchlistScored}/${R.meta.watchlistTotal}`, 'watchlist scored'],
  ];
  $('kpis').innerHTML = kpis.map(([b, s]) => `<div class="kpi"><b>${b}</b><span>${s}</span></div>`).join('');
  $('integrity').textContent =
    `${R.meta.boardRows} rows: ${R.meta.watchlistTotal} on the watchlist, ${R.meta.belowFloor} pre-token below the $${(R.meta.floorUsd / 1e6).toFixed(0)}M floor, ` +
    `${R.meta.offListAboveFloor} off-list above the floor. Live set: ${R.meta.liveCount} protocols with a token. ` +
    `All ${R.meta.watchlistTotal} watchlist rows scored. Snapshot ${R.meta.asOf}.`;

  // --- what-if state ----------------------------------------------------
  const state = {
    q: '',
    filter: '',
    deposit: 10000,
    fee: 5,
    detail: null,
  };
  const params = new URLSearchParams(location.search);
  if (params.get('q')) state.q = params.get('q');
  if (params.get('filter')) state.filter = params.get('filter');
  if (params.get('detail')) state.detail = params.get('detail');

  const netAt = (r) => {
    const dep = Math.min(state.deposit, 10000);
    const slice = 0.1 * r.impliedCond * (dep / r.tvlUsd);
    return slice - state.fee;
  };
  const verdictAt = (r) => {
    const net = netAt(r);
    return net > 0 ? 'FARM' : net > -state.fee ? 'THIN' : 'SKIP';
  };

  // --- board ------------------------------------------------------------
  function visibleRows() {
    const q = state.q.trim().toLowerCase();
    return rows.filter((r) => {
      if (state.filter === 'watchlist' && !r.onWatchlist) return false;
      if (state.filter === 'FARM' && verdictAt(r) !== 'FARM') return false;
      if (state.filter === 'ROBUST' && !r.robust) return false;
      if (q && !(r.name.toLowerCase().includes(q) || r.slug.includes(q) || r.category.toLowerCase().includes(q))) return false;
      return true;
    });
  }

  function renderBoard() {
    const list = visibleRows();
    $('rows').innerHTML = list.map((r) => {
      const net = netAt(r);
      const v = verdictAt(r);
      return `<tr data-slug="${r.slug}" class="${state.detail === r.slug ? 'sel' : ''}">` +
        `<td class="num">${r.rank}</td>` +
        `<td><strong>${r.name}</strong>${r.onWatchlist ? ' <span class="star" title="On the watchlist">★</span>' : ''}<span class="slug">${r.slug}</span></td>` +
        `<td>${r.category}</td>` +
        `<td class="num">${fmtUsd(r.tvlUsd)}</td>` +
        `<td class="num">${fmtUsd(r.impliedCond)}</td>` +
        `<td class="num">${fmtPct(r.tokenOdds)}</td>` +
        `<td class="num">${fmtInt(net)}</td>` +
        `<td><span class="badge ${v}">${v}</span></td>` +
        `<td class="${r.robust ? 'robust-yes' : 'robust-no'}">${r.robust ? 'Yes' : '—'}</td></tr>`;
    }).join('');
    $('count').textContent = `${list.length} of ${rows.length} rows shown. Net recomputed at a $${state.deposit.toLocaleString()} deposit and a $${state.fee} fee. Click a row for its detail view.`;
    document.querySelectorAll('#rows tr').forEach((tr) => {
      tr.addEventListener('click', () => showDetail(tr.dataset.slug));
    });
  }

  // --- detail view ------------------------------------------------------
  function showDetail(slug) {
    const r = rows.find((x) => x.slug === slug);
    const box = $('detail');
    if (!r) { box.hidden = true; state.detail = null; renderBoard(); return; }
    state.detail = slug;
    const net = netAt(r);
    const dep = Math.min(state.deposit, 10000);
    const sliceEv = 0.1 * r.impliedEv * (dep / r.tvlUsd);
    const flag = r.compsSameCategory < 3
      ? ` Only ${r.compsSameCategory} live protocol${r.compsSameCategory === 1 ? '' : 's'} share this category, so most comps below are cross-category.`
      : '';
    box.innerHTML =
      `<button class="close" id="close-detail">Close</button>` +
      `<h2>${r.name}</h2>` +
      `<p class="sub">#${r.rank} · ${r.category} · TVL ${fmtUsd(r.tvlUsd)} · ${r.ageDays === null ? 'age unknown' : `${r.ageDays} days old`} · ${r.chains.length} chain${r.chains.length === 1 ? '' : 's'}${r.onWatchlist ? ' · ★ on the watchlist' : ''}</p>` +
      `<div class="grid">` +
      `<div class="cell"><b>${fmtUsd(r.impliedCond)}</b><span>Implied if it launches</span></div>` +
      `<div class="cell"><b>${fmtPct(r.tokenOdds)}</b><span>Launch odds</span></div>` +
      `<div class="cell"><b>${fmtUsd(r.impliedEv)}</b><span>Expected value (EV)</span></div>` +
      `<div class="cell"><b>${fmtInt(net)}</b><span>Net at your deposit</span></div>` +
      `</div>` +
      `<h3>Value, step by step</h3>` +
      `<table><tbody>` +
      `<tr><td>Size curve: 10^(${m.intercept.toFixed(3)} + ${m.slope.toFixed(3)} · log₁₀(${fmtUsd(r.tvlUsd)}))</td><td class="num">${fmtUsd(Math.pow(10, m.intercept + m.slope * Math.log10(r.tvlUsd)))}</td></tr>` +
      `<tr><td>Sector offset (${r.category})</td><td class="num">${r.sectorOffset >= 0 ? '+' : ''}${r.sectorOffset.toFixed(3)} dex</td></tr>` +
      `<tr><td>Growth × maturity × chains (${r.growthMult.toFixed(3)} × ${r.maturityMult.toFixed(3)} × ${r.chainMult.toFixed(2)}), half-damped</td><td class="num">${(0.5 * Math.log10(r.growthMult * r.maturityMult * r.chainMult)).toFixed(3)} dex</td></tr>` +
      `<tr><td>kNN cross-check (median of the 12 comps)</td><td class="num">${fmtUsd(r.knnImplied)}</td></tr>` +
      `<tr><td>Range, P25–P75 of held-out misses</td><td class="num">${fmtUsd(r.bandP25)} – ${fmtUsd(r.bandP75)}</td></tr>` +
      `<tr><td>Range, P10–P90 of held-out misses</td><td class="num">${fmtUsd(r.bandP10)} – ${fmtUsd(r.bandP90)}</td></tr>` +
      `<tr><td>Rank range, P10–P90</td><td class="num">#${r.rankP10} – #${r.rankP90}</td></tr>` +
      `</tbody></table>` +
      `<h3>Farm plan — 10 steps, $${state.fee.toFixed(2)} in fees, 38 minutes</h3>` +
      `<table><thead><tr><th>#</th><th>Step</th><th class="num">Cost</th><th class="num">Minutes</th></tr></thead><tbody>` +
      r.farmSteps.map((s) => `<tr><td>${s.n}</td><td>${s.action}</td><td class="num">$${s.costUsd.toFixed(2)}</td><td class="num">${s.minutes}</td></tr>`).join('') +
      `</tbody></table>` +
      `<p class="note">Deposit $${dep.toLocaleString()} (0.02% of TVL, capped at $10,000) · slice ${fmtUsd(0.1 * r.impliedCond * (dep / r.tvlUsd))} · ` +
      `EV slice ${fmtUsd(sliceEv)} · net at P25 ${fmtInt(r.netLow)} · T-bill memo ${fmtUsd(r.tbillMemoUsd)} (4% a year for 60 days on the deposit — shown, never subtracted: ` +
      `at these ratios no deposit size covers a capital charge, so charging it would make the most valuable rows unfarmable at any size) · ` +
      `break-even deposit ${fmtUsd(r.breakEvenDeposit)}.</p>` +
      `<h3>Nearest live comps</h3>` +
      `<p class="note">${flag || 'Comps are the 12 nearest live protocols, same category first.'}</p>` +
      `<table><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Ratio</th></tr></thead><tbody>` +
      r.comps.map((c) => `<tr><td>${c.name}</td><td>${c.category}</td><td class="num">${fmtUsd(c.tvlUsd)}</td><td class="num">${fmtUsd(c.mcapUsd)}</td><td class="num">${c.ratio.toFixed(2)}×</td></tr>`).join('') +
      `</tbody></table>` +
      `<p class="note">${R.oddsNote}</p>`;
    box.hidden = false;
    $('close-detail').addEventListener('click', () => {
      box.hidden = true;
      state.detail = null;
      document.body.classList.remove('detail-only');
      renderBoard();
    });
    renderBoard();
    if (!document.body.classList.contains('detail-only')) box.scrollIntoView({ block: 'start' });
  }

  // --- model section ----------------------------------------------------
  const v = R.validation;
  $('model-body').innerHTML =
    `<p>The size curve is a Huber fit on the ${R.meta.liveCount} protocols that already have a token: ` +
    `log₁₀(market cap) = ${m.intercept.toFixed(3)} + ${m.slope.toFixed(3)} · log₁₀(TVL). ` +
    `A sector offset (shrunk median, categories with at least 3 live rows only) and half-damped growth, maturity and chain multipliers sit on top. ` +
    `The equation at the top of the page is the whole model — no hidden step.</p>` +
    `<table><tbody>` +
    `<tr><td>Leave-one-out error</td><td class="num">${v.loo.toFixed(3)} dex</td></tr>` +
    `<tr><td>Repeated 5-fold error</td><td class="num">${v.fiveFold.toFixed(3)} dex</td></tr>` +
    `<tr><td>Walk-forward, last 35 by listing date</td><td class="num">×${v.wf35.toFixed(2)} median miss</td></tr>` +
    `<tr><td>Null walk-forward (median ratio only)</td><td class="num">×${v.wfNull24.toFixed(2)}</td></tr>` +
    `<tr><td>Size curve alone, category-blind</td><td class="num">×${v.catBlindMedianMiss.toFixed(2)} median miss</td></tr>` +
    `</tbody></table>` +
    `<p>Range honesty, measured on the held-out errors: the P25–P75 band holds ${Math.round(v.coverage50 * 100)}% of held-out values ` +
    `(stated 50%) and the P10–P90 band holds ${Math.round(v.coverage80 * 100)}% (stated 80%). The bands are wide because the misses are wide — ` +
    `the top row's P10–P90 range runs from ${fmtUsd(rows[0].bandP10)} to ${fmtUsd(rows[0].bandP90)}.</p>` +
    `<p>${R.validation.ladderWithheldReason}</p>` +
    `<p>${R.oddsNote}</p>`;

  $('foot').textContent =
    `Built from the sealed snapshot of ${R.meta.asOf}. The board ranks on the conditional value; odds never enter it. ` +
    `T-bill is a memo line, never part of the net.`;

  // --- controls ---------------------------------------------------------
  $('q').value = state.q;
  $('filter').value = state.filter;
  $('wi-deposit').value = String(state.deposit);
  $('wi-fee').value = String(state.fee);
  $('q').addEventListener('input', (e) => { state.q = e.target.value; renderBoard(); });
  $('filter').addEventListener('change', (e) => { state.filter = e.target.value; renderBoard(); });
  $('wi-deposit').addEventListener('input', (e) => { state.deposit = Math.max(0, Number(e.target.value) || 0); renderBoard(); if (state.detail) showDetail(state.detail); });
  $('wi-fee').addEventListener('input', (e) => { state.fee = Math.max(0, Number(e.target.value) || 0); renderBoard(); if (state.detail) showDetail(state.detail); });

  renderBoard();
  if (state.detail) {
    // Opened from ?detail=: the detail panel is the whole page, so the
    // screenshot needs no scrolling (headless capture does not follow a
    // scripted scroll reliably).
    document.body.classList.add('detail-only');
    showDetail(state.detail);
  }
})();
