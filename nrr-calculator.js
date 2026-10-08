// NRR / GRR calculator. The maths is a pure function (importable by node --test);
// the DOM wiring at the bottom runs only in a browser. Nothing leaves the page.

export const MSG = {
  start: 'Starting ARR must be more than 0.',
  negative: "Values can't be negative.",
  over: "Contraction and churn can't be more than starting ARR.",
  nan: 'Enter numbers only, for example 4,00,00,000.',
};

export const CURRENCIES = {
  '₹': { locale: 'en-IN' },
  '$': { locale: 'en-US' },
  '€': { locale: 'en-US' },
  '£': { locale: 'en-US' },
};

// End = start + expansion - contraction - churn; NRR = end / start;
// GRR = (start - contraction - churn) / start, capped at 100%.
export function calcRetention({ start, expansion, contraction, churn }) {
  const v = [start, expansion, contraction, churn];
  if (!v.every((n) => typeof n === 'number' && Number.isFinite(n))) return { ok: false, error: MSG.nan };
  if (!(start > 0)) return { ok: false, error: MSG.start };
  if (expansion < 0 || contraction < 0 || churn < 0) return { ok: false, error: MSG.negative };
  // Relative epsilon: 0.1 + 0.2 is a hair above 0.3 in floating point.
  if (contraction + churn > start * (1 + 1e-9)) return { ok: false, error: MSG.over };
  const snap = (x) => (Math.abs(x) < start * 1e-9 ? 0 : x);
  const end = snap(start + expansion - contraction - churn);
  const kept = snap(start - contraction - churn);
  return { ok: true, end, nrr: end / start, grr: Math.min(1, kept / start) };
}

// Whole-number percentage for display only; the epsilon keeps 106.5 from landing on 106.
export const pct = (ratio) => Math.round(ratio * 100 + 1e-9);

// "4,00,00,000" / "4,000,000" / " 4 000 000 " -> number. '' -> 0 (or null with allowEmpty). Junk -> NaN.
export function parseAmount(text, { allowEmpty = false } = {}) {
  const raw = String(text ?? '');
  // '1.000,50' (European grouping) would otherwise read as 1.0005: reject a comma after a dot.
  if (/\..*,/.test(raw)) return NaN;
  const s = raw.replace(/[,\s ]/g, '');
  if (s === '') return allowEmpty ? null : 0;
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN;
}

export function formatNumber(n, symbol = '₹') {
  const locale = (CURRENCIES[symbol] || CURRENCIES.$).locale;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Math.round(n * 100) / 100);
}
export const formatMoney = (n, symbol = '₹') => (n < 0 ? '−' : '') + symbol + formatNumber(Math.abs(n), symbol);

// Short labels for the chart: lakh/crore for rupees, K/M/B otherwise.
export function formatCompact(n, symbol = '₹') {
  const abs = Math.abs(n);
  const units = symbol === '₹'
    ? [[1e7, ' Cr'], [1e5, ' L'], [1e3, 'K']]
    : [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  let out = null;
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const x = abs / size;
      const s = x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
      out = s.replace(/\.0+$|(\.\d*[1-9])0+$/, '$1') + suffix;
      break;
    }
  }
  if (out === null) out = String(Math.round(abs * 100) / 100);
  return (n < 0 ? '−' : '') + symbol + out;
}

// Geometry for the ARR bridge. Bars share one scale: the tallest point the chart reaches
// (start, end, or start + expansion), so nothing can leave the viewBox.
export const CHART = { w: 320, h: 176, top: 22, base: 148, bar: 50, pitch: 61, x0: 8 };
export function bridgeBars({ start, expansion, contraction, churn, end }) {
  const peak = Math.max(start, end, start + expansion);
  const room = CHART.base - CHART.top;
  const y = (v) => CHART.base - (v / peak) * room;
  const bar = (i, from, to, kind, label, value) => {
    const top = y(Math.max(from, to));
    return { kind, label, value, x: CHART.x0 + i * CHART.pitch, y: top, width: CHART.bar, height: Math.max(2, y(Math.min(from, to)) - top) };
  };
  return [
    bar(0, 0, start, 'start', 'Start', start),
    bar(1, start, start + expansion, 'exp', '+ Exp', expansion),
    bar(2, start + expansion - contraction, start + expansion, 'con', '− Contr', contraction),
    bar(3, end, start + expansion - contraction, 'churn', '− Churn', churn),
    bar(4, 0, end, 'end', 'End', end),
  ];
}

/* ---------------- DOM wiring ---------------- */
function init(root) {
  const $ = (sel) => root.querySelector(sel);
  const fields = ['start', 'expansion', 'contraction', 'churn'];
  const inputs = Object.fromEntries(fields.map((f) => [f, $(`[name=${f}]`)]));
  const out = {
    error: $('.calc-error'), results: $('.calc-results'), nrr: $('.out-nrr'), grr: $('.out-grr'),
    end: $('.out-end'), note: $('.out-note'), chart: $('.bridge'), idle: $('.calc-idle'),
  };
  const symbolEls = root.querySelectorAll('.sym');
  const NS = 'http://www.w3.org/2000/svg';
  let symbol = '₹';

  const el = (tag, attrs, text) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    return n;
  };

  function drawChart(vals, r) {
    out.chart.replaceChildren();
    for (const b of bridgeBars({ ...vals, end: r.end })) {
      const cx = b.x + b.width / 2;
      out.chart.append(
        el('rect', { class: `br br-${b.kind}`, x: b.x, y: b.y.toFixed(2), width: b.width, height: b.height.toFixed(2), rx: 3 }),
        el('text', { class: 'br-val', x: cx, y: Math.max(13, b.y - 5).toFixed(2), 'text-anchor': 'middle' }, formatCompact(b.value, symbol)),
        el('text', { class: 'br-lab', x: cx, y: CHART.base + 18, 'text-anchor': 'middle' }, b.label),
      );
    }
    out.chart.setAttribute('aria-label',
      `ARR bridge: start ${formatMoney(vals.start, symbol)}, plus expansion ${formatMoney(vals.expansion, symbol)}, ` +
      `minus contraction ${formatMoney(vals.contraction, symbol)}, minus churn ${formatMoney(vals.churn, symbol)}, ` +
      `end ${formatMoney(r.end, symbol)}`);
  }

  function update() {
    if (!fields.some((f) => inputs[f].value.trim() !== '')) {
      out.error.textContent = '';
      out.results.hidden = true;
      out.idle.hidden = false;
      fields.forEach((f) => inputs[f].removeAttribute('aria-invalid'));
      return;
    }
    const vals = Object.fromEntries(fields.map((f) => [f, parseAmount(inputs[f].value)]));
    const r = calcRetention(vals);
    out.idle.hidden = true;
    if (!r.ok) {
      out.error.textContent = r.error;
      out.results.hidden = true;
      fields.forEach((f) => inputs[f].setAttribute('aria-invalid', 'true'));
      return;
    }
    fields.forEach((f) => inputs[f].removeAttribute('aria-invalid'));
    out.error.textContent = '';
    out.results.hidden = false;
    out.nrr.textContent = `${pct(r.nrr)}%`;
    out.grr.textContent = `${pct(r.grr)}%`;
    out.end.textContent = formatMoney(r.end, symbol);
    out.note.textContent = pct(r.nrr) >= 100
      ? 'NRR is at or above 100%: your existing customers grew by more than they lost.'
      : 'NRR is below 100%: your existing customers shrank over the period, before counting any new business.';
    drawChart(vals, r);
  }

  function reformat() {
    for (const f of fields) {
      const n = parseAmount(inputs[f].value, { allowEmpty: true });
      if (n !== null && Number.isFinite(n)) inputs[f].value = formatNumber(n, symbol);
    }
  }

  function setSymbol(s) {
    symbol = s;
    symbolEls.forEach((e) => { e.textContent = s; });
  }

  for (const f of fields) {
    inputs[f].addEventListener('input', update);
    inputs[f].addEventListener('blur', reformat);
  }
  root.querySelectorAll('input[name=currency]').forEach((radio) => {
    radio.addEventListener('change', () => { setSymbol(radio.value); reformat(); update(); });
  });
  $('.try-example')?.addEventListener('click', () => {
    root.querySelector('input[name=currency][value="₹"]').checked = true;
    setSymbol('₹');
    inputs.start.value = '4,00,00,000';
    inputs.expansion.value = '60,00,000';
    inputs.contraction.value = '10,00,000';
    inputs.churn.value = '22,00,000';
    update();
  });
  update();
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('nrr-calc');
  if (root) init(root);
}
