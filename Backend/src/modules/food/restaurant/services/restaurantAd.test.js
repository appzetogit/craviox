import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteAd, displayStatus, AD_CONFIG } from './restaurantAd.service.js';

const istDay = (offsetDays = 0) =>
    new Date(Date.now() + 5.5 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10);

test('quote: cost is daily budget × days, both ends inclusive', () => {
    const q = quoteAd({ startDate: istDay(1), endDate: istDay(7), dailyBudget: 500 });
    assert.equal(q.days, 7);
    assert.equal(q.totalAmount, 3500);
    assert.equal(q.estimatedVisits, 3500 / AD_CONFIG.estimatedCostPerVisit);
});

test('quote: a one-day campaign starting today is allowed', () => {
    const q = quoteAd({ startDate: istDay(0), endDate: istDay(0), dailyBudget: 750 });
    assert.equal(q.days, 1);
    assert.equal(q.totalAmount, 750);
});

test('quote: refuses budgets under the minimum, past starts, reversed and over-long ranges', () => {
    assert.throws(() => quoteAd({ startDate: istDay(1), endDate: istDay(2), dailyBudget: 499 }), /at least ₹500/);
    assert.throws(() => quoteAd({ startDate: istDay(-1), endDate: istDay(2), dailyBudget: 500 }), /past/);
    assert.throws(() => quoteAd({ startDate: istDay(5), endDate: istDay(2), dailyBudget: 500 }), /on or after/);
    assert.throws(() => quoteAd({ startDate: istDay(0), endDate: istDay(AD_CONFIG.maxDays), dailyBudget: 500 }), /at most/);
    assert.throws(() => quoteAd({ startDate: '01/10/2026', endDate: istDay(2), dailyBudget: 500 }), /date like/);
});

test('display status follows the dates once approved', () => {
    const day = 86400000;
    const now = Date.now();
    const ad = (start, end, status = 'approved') => ({ status, startDate: new Date(start), endDate: new Date(end) });
    assert.equal(displayStatus(ad(now + day, now + 2 * day)), 'scheduled');
    assert.equal(displayStatus(ad(now - day, now + day)), 'live');
    assert.equal(displayStatus(ad(now - 2 * day, now - day)), 'completed');
    assert.equal(displayStatus(ad(now - day, now + day, 'pending_approval')), 'pending_approval');
});
