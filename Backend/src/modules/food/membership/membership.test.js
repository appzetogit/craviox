import test from 'node:test';
import assert from 'node:assert/strict';

import { computeMembershipBenefits, perksFromPlan, sanitizePlanInput } from './membership.service.js';

/**
 * The perk maths decides what a member is charged, so it is checked without a
 * database: every waiver, every cap, and the partner-restaurant scope.
 */

const gold = perksFromPlan({
    freeDelivery: true,
    freeDeliveryMinOrder: 199,
    freeDeliveryMaxKm: 7,
    extraDiscountPercent: 20,
    maxDiscountPerOrder: 100,
    discountMinOrder: 0,
    stackWithCoupons: true,
    waivePlatformFee: true,
    waiveSurge: true,
    restaurantScope: 'all',
});

const cart = { subtotal: 400, distanceKm: 3, restaurantId: 'r1', deliveryFee: 40, platformFee: 10, surcharge: 25, isQuick: true };

test('gold waives delivery, platform fee and surge and adds the extra discount', () => {
    const b = computeMembershipBenefits(gold, cart);
    assert.equal(b.deliveryFeeWaived, 40);
    assert.equal(b.platformFeeWaived, 10);
    assert.equal(b.surgeWaived, 25);
    assert.equal(b.extraDiscount, 80);
    assert.equal(b.total, 155);
});

test('free delivery needs the minimum order and the distance limit', () => {
    assert.equal(computeMembershipBenefits(gold, { ...cart, subtotal: 150 }).deliveryFeeWaived, 0);
    assert.equal(computeMembershipBenefits(gold, { ...cart, distanceKm: 9 }).deliveryFeeWaived, 0);
    assert.equal(computeMembershipBenefits(gold, { ...cart, distanceKm: null }).deliveryFeeWaived, 0);
});

test('extra discount is capped and taken after the coupon', () => {
    assert.equal(computeMembershipBenefits(gold, { ...cart, subtotal: 2000 }).extraDiscount, 100);
    assert.equal(computeMembershipBenefits(gold, { ...cart, couponDiscount: 100, couponApplied: true }).extraDiscount, 60);
});

test('non-stacking plans skip the extra discount when a coupon is applied', () => {
    const lite = { ...gold, stackWithCoupons: false };
    assert.equal(computeMembershipBenefits(lite, { ...cart, couponApplied: true, couponDiscount: 50 }).extraDiscount, 0);
    assert.equal(computeMembershipBenefits(lite, cart).extraDiscount, 80);
});

test('surge is only waived on quick orders', () => {
    assert.equal(computeMembershipBenefits(gold, { ...cart, isQuick: false }).surgeWaived, 0);
});

test('partner-only plans give nothing at other restaurants', () => {
    const partner = { ...gold, restaurantScope: 'selected', restaurantIds: ['r2'] };
    const b = computeMembershipBenefits(partner, cart);
    assert.equal(b.eligible, false);
    assert.equal(b.total, 0);
    assert.equal(computeMembershipBenefits(partner, { ...cart, restaurantId: 'r2' }).eligible, true);
});

test('plan input is validated and clamped', () => {
    assert.throws(() => sanitizePlanInput({ price: 99, durationDays: 30 }), /name/);
    assert.throws(() => sanitizePlanInput({ name: 'Gold', price: -1, durationDays: 30 }), /Price/);
    assert.throws(() => sanitizePlanInput({ name: 'Gold', price: 99, durationDays: 0 }), /Duration/);
    const d = sanitizePlanInput({ name: 'Gold', price: 99, durationDays: 30, extraDiscountPercent: 250, extraPerks: [' Priority support ', ''] });
    assert.equal(d.extraDiscountPercent, 100);
    assert.deepEqual(d.extraPerks, ['Priority support']);
    const partial = sanitizePlanInput({ waiveSurge: true }, { partial: true });
    assert.deepEqual(partial, { waiveSurge: true });
});
