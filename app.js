/* Consumer take-private precedents
   Static, vanilla JS, no build step. */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

const PREMIUM_KEYS = [
  { key: 'premUnaff', label: 'vs. Undisturbed', infoKey: 'undisturbed' },
  { key: 'prem12mo',  label: 'vs. 12mo Avg',    infoKey: null },
  { key: 'prem24mo',  label: 'vs. 24mo Avg',    infoKey: null },
  { key: 'prem52wk',  label: 'vs. 52-wk High',  infoKey: null },
];

const INFO = {
  undisturbed: {
    title: 'Undisturbed price',
    body: 'The last closing price before any leak or public announcement of the deal. Used as the baseline against which the takeout premium is measured. If a story leaks before the formal announcement, the unaffected date is the trading day before the leak — not the day before the announcement.',
  },
};

function infoIcon(key) {
  if (!key || !INFO[key]) return '';
  return `<button type="button" class="info-btn" data-info="${key}" aria-label="What does ${key} mean?">i</button>`;
}

let DEALS = [];
let activeFilter = 'all';

/* ---------- formatters ---------- */
const fmtPct  = v => v == null || isNaN(v) ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(0) + '%';
const fmtPctP = v => v == null || isNaN(v) ? '—' : (v * 100).toFixed(0) + '%';
const fmtUsd  = v => v == null || isNaN(v) ? '—' : '$' + v.toFixed(2);
const fmtUsdR = v => v == null || isNaN(v) ? '—' : '$' + Math.round(v).toLocaleString();
const fmtUsdB = v => v == null || isNaN(v) ? '—' : '$' + (v / 1000).toFixed(1) + 'B';
const fmtDate = iso => {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};
const fmtDateLong = iso => {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/* ---------- stats ---------- */
function quantile(arr, q) {
  const sorted = [...arr].filter(v => typeof v === 'number' && !isNaN(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
const stats = arr => ({
  min:    quantile(arr, 0),
  q1:     quantile(arr, 0.25),
  median: quantile(arr, 0.5),
  q3:     quantile(arr, 0.75),
  max:    quantile(arr, 1),
  n:      arr.filter(v => typeof v === 'number' && !isNaN(v)).length,
});

/* ---------- filters ---------- */
function filterDeals(deals, filter) {
  if (filter === 'all') return deals;
  if (filter === 'failed') return deals.filter(d => d.outcome === 'Blocked' || d.outcome === 'Withdrawn');
  return deals.filter(d => d.outcome === filter);
}

/* ---------- deal list ---------- */
function statusClass(outcome) {
  return 'status-' + (outcome || '').toLowerCase();
}

function acquirerTypeBadge(type) {
  if (type === 'Strategic') return `<span class="badge-strategic">Strategic</span>`;
  return type || '';
}

function renderDealList() {
  const list = document.getElementById('deal-list');
  const visible = filterDeals(DEALS, activeFilter);
  document.getElementById('deal-count').textContent = `${visible.length} of ${DEALS.length}`;
  list.innerHTML = '';

  if (!visible.length) {
    list.innerHTML = '<div class="empty">No deals match this filter.</div>';
    return;
  }

  visible.forEach(d => {
    const li = document.createElement('li');
    li.className = 'deal-card';
    li.dataset.ticker = d.ticker;
    const prem = d.premUnaff;
    const premClass = (prem != null && prem < 0) ? 'negative' : '';
    li.innerHTML = `
      <div class="row1">
        <span class="ticker">${d.ticker}</span>
        <span class="company">${d.company}</span>
        <span class="status ${statusClass(d.outcome)}">${d.outcome}</span>
      </div>
      <div class="row2">
        ${shortAcquirer(d.acquirer)}<span class="sep">·</span>${acquirerTypeBadge(d.acquirerType)}<span class="sep">·</span>${fmtDate(d.announceDate)}
      </div>
      <div class="premium">
        <span class="value ${premClass}">${fmtPct(prem)}</span>
        <span class="label">vs. undist.${infoIcon('undisturbed')}</span>
      </div>
    `;
    li.addEventListener('click', e => {
      if (e.target.closest('.info-btn')) return;
      openDrawer(d);
    });
    list.appendChild(li);
  });
}

function shortAcquirer(s) {
  if (!s) return '—';
  // trim parenthetical descriptors for the list view
  return s.replace(/\s*[—-]\s*.*$/, '').replace(/\s*\(.*?\)\s*/g, '').trim();
}

/* ---------- distribution ---------- */
function renderDistribution() {
  const visible = filterDeals(DEALS, activeFilter);
  document.getElementById('dist-count').textContent = `n = ${visible.length}`;
  const container = document.getElementById('dist');
  container.innerHTML = '';

  PREMIUM_KEYS.forEach(p => {
    const values = visible.map(d => d[p.key]).filter(v => typeof v === 'number' && !isNaN(v));
    const s = stats(values);
    const row = document.createElement('div');
    row.className = 'dist-row';

    if (!values.length) {
      row.innerHTML = `<h3>${p.label}</h3><div class="empty" style="padding:8px 0">No data</div>`;
      container.appendChild(row);
      return;
    }

    row.innerHTML = `
      <h3>${p.label}${infoIcon(p.infoKey)} <span style="color:var(--ink-faint);font-weight:500;font-size:11px;letter-spacing:0">· n=${values.length}</span></h3>
      <div class="dist-stats"><div>Min</div><div>Q1</div><div>Median</div><div>Q3</div><div>Max</div></div>
      <div class="dist-values">
        <div class="${s.min  < 0 ? 'neg' : ''}">${fmtPct(s.min)}</div>
        <div class="${s.q1   < 0 ? 'neg' : ''}">${fmtPct(s.q1)}</div>
        <div class="median ${s.median < 0 ? 'neg' : ''}">${fmtPct(s.median)}</div>
        <div class="${s.q3   < 0 ? 'neg' : ''}">${fmtPct(s.q3)}</div>
        <div class="${s.max  < 0 ? 'neg' : ''}">${fmtPct(s.max)}</div>
      </div>
      <div class="dist-bar">${buildDistBar(values, s)}</div>
    `;
    container.appendChild(row);
  });
}

function buildDistBar(values, s) {
  let lo = s.min;
  let hi = s.max;
  if (lo === hi) { lo -= 0.05; hi += 0.05; }
  const pad = (hi - lo) * 0.06;
  lo -= pad; hi += pad;
  const pct = v => ((v - lo) / (hi - lo)) * 100;
  const q1L  = pct(s.q1), q3L = pct(s.q3);
  const minL = pct(s.min), maxL = pct(s.max), medL = pct(s.median);

  return `
    <div class="dist-bar-track"></div>
    <div class="dist-bar-range" style="left:${q1L}%; width:${q3L - q1L}%"></div>
    <div class="dist-bar-tick"        style="left:${minL}%" title="Min ${fmtPct(s.min)}"></div>
    <div class="dist-bar-tick median" style="left:${medL}%" title="Median ${fmtPct(s.median)}"></div>
    <div class="dist-bar-tick"        style="left:${maxL}%" title="Max ${fmtPct(s.max)}"></div>
    <div class="dist-bar-label" style="left:${minL}%">Min</div>
    <div class="dist-bar-label" style="left:${q1L}%">Q1</div>
    <div class="dist-bar-label median" style="left:${medL}%">Med</div>
    <div class="dist-bar-label" style="left:${q3L}%">Q3</div>
    <div class="dist-bar-label" style="left:${maxL}%">Max</div>
  `;
}

/* ---------- drawer ---------- */
const drawer = document.getElementById('drawer');
const drawerBody = document.getElementById('drawer-body');

async function openDrawer(d) {
  drawerBody.innerHTML = `<div class="empty">Loading…</div>`;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  let prices = [];
  try {
    const res = await fetch(`data/prices/${d.ticker}.json`);
    prices = await res.json();
  } catch (e) {
    // chart will just not render
  }

  drawerBody.innerHTML = renderDealDetail(d, prices);
}

function closeDrawer() {
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

drawer.addEventListener('click', e => {
  if (e.target.matches('[data-close]')) closeDrawer();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
});

function renderDealDetail(d, prices) {
  const premiums = PREMIUM_KEYS.map(p => {
    const v = d[p.key];
    const cls = (typeof v === 'number' && v < 0) ? 'neg' : '';
    return `<div class="dd-prem-cell">
      <span class="lbl">${p.label}${infoIcon(p.infoKey)}</span>
      <span class="v ${cls}">${fmtPct(v)}</span>
    </div>`;
  }).join('');

  const chart = buildChart(d, prices);
  const outcomeCls = (d.outcome || '').toLowerCase();

  return `
    <div class="dd-head">
      <div class="dd-ticker-line">
        <span class="dd-ticker">${d.ticker}</span>
        <span class="status ${statusClass(d.outcome)}">${d.outcome}</span>
      </div>
      <div class="dd-company">${d.company}</div>
      <div class="dd-meta"><strong>${d.acquirer}</strong></div>
      <div class="dd-meta">${acquirerTypeBadge(d.acquirerType)} · announced ${fmtDateLong(d.announceDate)}</div>
    </div>

    <div class="dd-chart">
      ${chart}
      <div class="dd-chart-legend">
        <span><span class="swatch" style="background:var(--navy)"></span>Daily close</span>
        <span><span class="swatch" style="background:var(--accent);height:0;border-top:2px dashed var(--accent)"></span>Takeout ${fmtUsd(d.takeoutPrice)}</span>
        <span><span class="dot" style="background:var(--red)"></span>Undisturbed${infoIcon('undisturbed')}</span>
        <span><span class="dot" style="background:var(--green)"></span>Announce</span>
      </div>
    </div>

    <div class="dd-section">
      <h4>Premiums</h4>
      <div class="dd-prem-grid">${premiums}</div>
    </div>

    <div class="dd-section">
      <h4>Key prices</h4>
      <div class="dd-key">
        <div><span class="lbl">Takeout</span><span class="v">${fmtUsd(d.takeoutPrice)}</span></div>
        <div><span class="lbl">Undisturbed close${infoIcon('undisturbed')}</span><span class="v">${fmtUsd(d.unaffectedClose)}</span></div>
        <div><span class="lbl">12mo avg</span><span class="v">${fmtUsd(d.avg12mo)}</span></div>
        <div><span class="lbl">24mo avg</span><span class="v">${fmtUsd(d.avg24mo)}</span></div>
        <div><span class="lbl">52-wk high</span><span class="v">${fmtUsd(d.high52wk)}</span></div>
        <div><span class="lbl">Undisturbed date${infoIcon('undisturbed')}</span><span class="v">${fmtDateLong(d.unaffectedDate)}</span></div>
      </div>
    </div>

    <div class="dd-section">
      <h4>Target</h4>
      <p class="dd-text">${d.description || ''}</p>
    </div>

    <div class="dd-section">
      <h4>Deal context</h4>
      <p class="dd-text">${d.context || ''}</p>
    </div>

    ${d.outcome !== 'Closed' ? `
    <div class="dd-section">
      <h4>Outcome reason</h4>
      <div class="dd-outcome-reason ${outcomeCls}">${d.outcomeReason || ''}</div>
    </div>` : ''}
  `;
}

/* ---------- SVG chart ---------- */
function buildChart(d, prices) {
  if (!prices || !prices.length) return '<div class="empty">No price history available.</div>';

  const W = 460, H = 200;
  const padL = 40, padR = 14, padT = 14, padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const pts = prices.map(([iso, p]) => ({ t: new Date(iso + 'T00:00:00').getTime(), p, iso }));
  const tMin = pts[0].t, tMax = pts[pts.length - 1].t;
  const ys = pts.map(o => o.p).concat([d.takeoutPrice].filter(v => typeof v === 'number'));
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  const ySpan = yMax - yMin;
  yMin -= ySpan * 0.08;
  yMax += ySpan * 0.08;

  const X = t => padL + ((t - tMin) / (tMax - tMin)) * innerW;
  const Y = p => padT + (1 - (p - yMin) / (yMax - yMin)) * innerH;

  // line path
  const path = pts.map((o, i) => `${i === 0 ? 'M' : 'L'}${X(o.t).toFixed(1)},${Y(o.p).toFixed(1)}`).join(' ');

  // y-axis ticks (4 evenly spaced)
  const yTicks = [];
  for (let i = 0; i <= 3; i++) {
    const v = yMin + ((yMax - yMin) * i) / 3;
    yTicks.push(v);
  }
  const yTickEls = yTicks.map(v => `
    <line x1="${padL}" x2="${W - padR}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="#e5e7eb" stroke-width="1"/>
    <text x="${padL - 6}" y="${(Y(v) + 3.5).toFixed(1)}" font-size="9" fill="#8a8a8a" text-anchor="end">$${v.toFixed(v < 10 ? 2 : 0)}</text>
  `).join('');

  // x-axis ticks: start / middle / end
  const xTickTimes = [tMin, (tMin + tMax) / 2, tMax];
  const xTickEls = xTickTimes.map((t, i) => {
    const d2 = new Date(t);
    const lbl = d2.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const anchor = i === 0 ? 'start' : i === xTickTimes.length - 1 ? 'end' : 'middle';
    return `<text x="${X(t).toFixed(1)}" y="${(H - 6).toFixed(1)}" font-size="9" fill="#8a8a8a" text-anchor="${anchor}">${lbl}</text>`;
  }).join('');

  // takeout horizontal line
  let takeoutLine = '';
  if (typeof d.takeoutPrice === 'number') {
    const y = Y(d.takeoutPrice);
    takeoutLine = `
      <line x1="${padL}" x2="${W - padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"
            stroke="#c9aa3d" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  }

  // unaffected and announce dots
  const dots = [];
  if (d.unaffectedDate) {
    const t = new Date(d.unaffectedDate + 'T00:00:00').getTime();
    // find closest price point
    const closest = pts.reduce((a, b) => Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a, pts[0]);
    dots.push(`<circle cx="${X(closest.t).toFixed(1)}" cy="${Y(closest.p).toFixed(1)}" r="5" fill="#c02828" stroke="#fff" stroke-width="2"/>`);
  }
  if (d.announceDate) {
    const t = new Date(d.announceDate + 'T00:00:00').getTime();
    // announce dot drawn at takeout price if available, else closest close
    let cy;
    if (typeof d.takeoutPrice === 'number') {
      cy = Y(d.takeoutPrice);
    } else {
      const closest = pts.reduce((a, b) => Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a, pts[0]);
      cy = Y(closest.p);
    }
    const cx = X(Math.min(tMax, Math.max(tMin, t)));
    dots.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5" fill="#2f7d3f" stroke="#fff" stroke-width="2"/>`);
  }

  return `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      ${yTickEls}
      ${xTickEls}
      ${takeoutLine}
      <path d="${path}" fill="none" stroke="#0a1f44" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots.join('')}
    </svg>
  `;
}

/* ---------- info modal ---------- */
const infoModal = document.getElementById('info-modal');

function openInfo(key) {
  const def = INFO[key];
  if (!def) return;
  document.getElementById('info-modal-title').textContent = def.title;
  document.getElementById('info-modal-body').textContent  = def.body;
  infoModal.classList.add('open');
  infoModal.setAttribute('aria-hidden', 'false');
}
function closeInfo() {
  infoModal.classList.remove('open');
  infoModal.setAttribute('aria-hidden', 'true');
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.info-btn');
  if (btn) {
    e.stopPropagation();
    openInfo(btn.dataset.info);
    return;
  }
  if (e.target.closest('[data-info-close]')) closeInfo();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && infoModal.classList.contains('open')) closeInfo();
});

/* ---------- bootstrap ---------- */
async function main() {
  const dealsRes = await fetch('data/deals.json');
  DEALS = await dealsRes.json();

  renderDealList();
  renderDistribution();

  const meta = document.getElementById('foot-meta');
  if (meta) meta.textContent = `${DEALS.length} consumer precedents · above $1B equity value · 2023–2026`;

  document.querySelectorAll('.chip[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderDealList();
      renderDistribution();
    });
  });
}

main().catch(err => {
  console.error(err);
  document.getElementById('deal-list').innerHTML =
    `<div class="empty">Failed to load data. If running locally, serve via <code>python -m http.server</code> rather than opening the file directly.</div>`;
});
