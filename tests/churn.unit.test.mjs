import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcChurn, pct1, MSG } from '../churn-calculator.js';

test('worked example: 18 of 200 customers, 32L of 4Cr revenue', () => {
  const r = calcChurn({ customers: 200, lost: 18, revenue: 40000000, revenueLost: 3200000, months: 12 });
  assert.equal(pct1(r.logo), '9%');
  assert.equal(pct1(r.revenueChurn), '8%');
  assert.equal(r.retained, 182);
});

test('monthly rate compounds: 2% a month is about 21.5% a year, not 24%', () => {
  const r = calcChurn({ customers: 100, lost: 2, months: 1 });
  assert.equal(pct1(r.logoAnnual), '21.5%');
});

test('revenue is optional; revenue lost without revenue is an error', () => {
  assert.equal(calcChurn({ customers: 10, lost: 1, revenue: null, revenueLost: null }).revenueChurn, null);
  assert.equal(calcChurn({ customers: 10, lost: 1, revenue: null, revenueLost: 5 }).error, MSG.revenue);
});

test('rejects bad input', () => {
  assert.equal(calcChurn({ customers: 0, lost: 0 }).error, MSG.customers);
  assert.equal(calcChurn({ customers: 10, lost: 11 }).error, MSG.lostOver);
  assert.equal(calcChurn({ customers: 10.5, lost: 1 }).error, MSG.whole);
  assert.equal(calcChurn({ customers: 10, lost: -1 }).error, MSG.negative);
  assert.equal(calcChurn({ customers: NaN, lost: 1 }).error, MSG.nan);
  assert.equal(calcChurn({ customers: 10, lost: 1, revenue: 100, revenueLost: 101 }).error, MSG.revOver);
});
