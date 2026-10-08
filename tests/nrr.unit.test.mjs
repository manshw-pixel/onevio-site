import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcRetention, pct, parseAmount, formatMoney, formatNumber, formatCompact, bridgeBars, CHART, MSG } from '../nrr-calculator.js';

const EX = { start: 40000000, expansion: 6000000, contraction: 1000000, churn: 2200000 };

test('spec example: NRR 107%, GRR 92%, end 4,28,00,000', () => {
  const r = calcRetention(EX);
  assert.equal(r.ok, true);
  assert.equal(pct(r.nrr), 107);
  assert.equal(pct(r.grr), 92);
  assert.equal(r.end, 42800000);
  assert.equal(formatMoney(r.end, '₹'), '₹4,28,00,000');
});

test('GRR is capped at 100% (it cannot exceed 1 even with odd inputs)', () => {
  const r = calcRetention({ start: 100, expansion: 50, contraction: 0, churn: 0 });
  assert.equal(r.grr, 1);
  assert.equal(pct(r.nrr), 150);
});

test('zero expansion', () => {
  const r = calcRetention({ start: 100, expansion: 0, contraction: 10, churn: 20 });
  assert.equal(pct(r.nrr), 70);
  assert.equal(pct(r.grr), 70);
  assert.equal(r.end, 70);
});

test('everything lost is a valid 0%', () => {
  const r = calcRetention({ start: 100, expansion: 0, contraction: 40, churn: 60 });
  assert.equal(r.ok, true);
  assert.equal(r.nrr, 0);
});

test('errors', () => {
  assert.deepEqual(calcRetention({ ...EX, start: 0 }), { ok: false, error: 'Starting ARR must be more than 0.' });
  assert.equal(calcRetention({ ...EX, start: -5 }).error, MSG.start);
  assert.deepEqual(calcRetention({ ...EX, churn: -1 }), { ok: false, error: "Values can't be negative." });
  assert.equal(calcRetention({ ...EX, expansion: -1 }).error, MSG.negative);
  assert.deepEqual(calcRetention({ start: 100, expansion: 0, contraction: 60, churn: 41 }),
    { ok: false, error: "Contraction and churn can't be more than starting ARR." });
  assert.equal(calcRetention({ ...EX, churn: NaN }).ok, false);
});

test('floating-point inputs round only for display', () => {
  const r = calcRetention({ start: 0.3, expansion: 0.1, contraction: 0.1, churn: 0.1 });
  assert.equal(pct(r.nrr), 67);
  const half = calcRetention({ start: 200, expansion: 13, contraction: 0, churn: 0 });
  assert.equal(pct(half.nrr), 107); // 106.5 rounds up
  assert.equal(pct(calcRetention({ start: 1234.56, expansion: 78.9, contraction: 12.34, churn: 56.78 }).nrr), 101);
});

test('parseAmount strips commas and spaces', () => {
  assert.equal(parseAmount('4,00,00,000'), 40000000);
  assert.equal(parseAmount('4,000,000'), 4000000);
  assert.equal(parseAmount(' 4 000 000 '), 4000000);
  assert.equal(parseAmount('12.5'), 12.5);
  assert.equal(parseAmount(''), 0);
  assert.equal(parseAmount('', { allowEmpty: true }), null);
  assert.ok(Number.isNaN(parseAmount('12abc')));
  assert.equal(parseAmount('-5'), -5);
});

test('formatting: en-IN grouping for rupees, en-US otherwise', () => {
  assert.equal(formatNumber(40000000, '₹'), '4,00,00,000');
  assert.equal(formatNumber(40000000, '$'), '40,000,000');
  assert.equal(formatMoney(4280000, '€'), '€4,280,000');
  assert.equal(formatMoney(1234.5, '£'), '£1,234.5');
  assert.equal(formatCompact(42800000, '₹'), '₹4.28 Cr');
  assert.equal(formatCompact(6000000, '₹'), '₹60 L');
  assert.equal(formatCompact(42800000, '$'), '$42.8M');
  assert.equal(formatCompact(950, '$'), '$950');
});

test('bridge bars stay inside the viewBox and share one scale', () => {
  for (const v of [EX, { start: 100, expansion: 500, contraction: 0, churn: 0 }, { start: 100, expansion: 0, contraction: 50, churn: 50 }]) {
    const r = calcRetention(v);
    for (const b of bridgeBars({ ...v, end: r.end })) {
      assert.ok(b.y >= CHART.top - 0.001 && b.y + b.height <= CHART.base + 2.001, JSON.stringify(b));
      assert.ok(b.x >= 0 && b.x + b.width <= CHART.w);
    }
  }
  const bars = bridgeBars({ ...EX, end: 42800000 });
  assert.ok(bars[4].height > bars[0].height); // end > start
});
