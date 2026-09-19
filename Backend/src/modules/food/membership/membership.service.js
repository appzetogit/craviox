import { prisma } from '../../../config/prisma.js';
import { isId } from '../../../utils/helpers.js';
import { logger } from '../../../utils/logger.js';
import { ValidationError, NotFoundError } from '../../../core/auth/errors.js';
import { recordTransaction, ensureWallet } from '../../../core/payments/transaction.service.js';
import {
    confirmRazorpayPayment,
    createRazorpayOrder,
    getRazorpayKeyId,
    isRazorpayConfigured,
} from '../orders/helpers/razorpay.helper.js';

/**
 * Customer memberships ("Craviox Gold" and friends).
 *
 * The perk set combines what Zomato Gold and Swiggy One sell:
 *   - free delivery above a minimum order, optionally within a distance (both)
 *   - an extra % off at all or only partner restaurants, on top of coupons (both)
 *   - no surge / quick-delivery surcharge (Swiggy One)
 *   - platform fee waived
 *   - cashback to the wallet on delivered orders
 *
 * Plans are admin-defined. A purchase snapshots the plan's perks onto the
 * membership row, so editing a plan never changes what a member already paid for.
 * Every perk here is platform-funded: restaurant payouts are untouched.
 */

const MAX_PRICE = 100000;
const MAX_DURATION_DAYS = 3650;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => (v == null ? 0 : Number(v) || 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ─── plans ────────────────────────────────────────────────────────────────

/** The perk fields a membership snapshots. Plain numbers, JSON-safe. */
export const perksFromPlan = (plan) => ({
    freeDelivery: Boolean(plan.freeDelivery),
    freeDeliveryMinOrder: num(plan.freeDeliveryMinOrder),
    freeDeliveryMaxKm: num(plan.freeDeliveryMaxKm),
    extraDiscountPercent: num(plan.extraDiscountPercent),
    maxDiscountPerOrder: num(plan.maxDiscountPerOrder),
    discountMinOrder: num(plan.discountMinOrder),
    stackWithCoupons: plan.stackWithCoupons !== false,
    waivePlatformFee: Boolean(plan.waivePlatformFee),
    waiveSurge: Boolean(plan.waiveSurge),
    cashbackPercent: num(plan.cashbackPercent),
    maxCashbackPerOrder: num(plan.maxCashbackPerOrder),
    restaurantScope: plan.restaurantScope === 'selected' ? 'selected' : 'all',
    restaurantIds: Array.isArray(plan.restaurantIds) ? plan.restaurantIds.map(String) : [],
    extraPerks: Array.isArray(plan.extraPerks) ? plan.extraPerks : [],
});

export const toPlanDto = (plan) =>
    plan && {
        id: plan.id,
        name: plan.name,
        tagline: plan.tagline,
        description: plan.description,
        badgeColor: plan.badgeColor,
        price: num(plan.price),
        originalPrice: num(plan.originalPrice),
        durationDays: plan.durationDays,
        isActive: plan.isActive,
        isFeatured: plan.isFeatured,
        sortOrder: plan.sortOrder,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
        ...perksFromPlan(plan),
    };

/**
 * Validate an admin plan payload. `partial` (edit) only touches keys that were
 * sent, so a form posting a subset cannot zero the rest.
 */
export const sanitizePlanInput = (body = {}, { partial = false } = {}) => {
    const data = {};
    const has = (k) => body[k] !== undefined;

    if (!partial || has('name')) {
        const name = String(body.name || '').trim();
        if (!name) throw new ValidationError('Plan name is required');
        if (name.length > 64) throw new ValidationError('Plan name is too long');
        data.name = name;
    }
    if (has('tagline')) data.tagline = String(body.tagline || '').trim().slice(0, 160);
    if (has('description')) data.description = String(body.description || '').trim().slice(0, 2000);
    if (has('badgeColor')) {
        const c = String(body.badgeColor || '').trim();
        if (!/^#[0-9a-f]{3,8}$/i.test(c)) throw new ValidationError('Badge colour must be a hex colour');
        data.badgeColor = c;
    }

    if (!partial || has('price')) {
        const price = Number(body.price);
        if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) {
            throw new ValidationError('Price must be between 0 and 1,00,000');
        }
        data.price = round2(price);
    }
    if (has('originalPrice')) data.originalPrice = round2(clamp(num(body.originalPrice), 0, MAX_PRICE));
    if (!partial || has('durationDays')) {
        const d = Math.floor(Number(body.durationDays));
        if (!Number.isFinite(d) || d < 1 || d > MAX_DURATION_DAYS) {
            throw new ValidationError('Duration must be between 1 and 3650 days');
        }
        data.durationDays = d;
    }

    for (const k of ['freeDelivery', 'stackWithCoupons', 'waivePlatformFee', 'waiveSurge', 'isActive', 'isFeatured']) {
        if (has(k)) data[k] = Boolean(body[k]);
    }
    for (const k of ['freeDeliveryMinOrder', 'maxDiscountPerOrder', 'discountMinOrder', 'maxCashbackPerOrder']) {
        if (has(k)) data[k] = round2(clamp(num(body[k]), 0, MAX_PRICE));
    }
    if (has('freeDeliveryMaxKm')) data.freeDeliveryMaxKm = round2(clamp(num(body.freeDeliveryMaxKm), 0, 500));
    for (const k of ['extraDiscountPercent', 'cashbackPercent']) {
        if (has(k)) data[k] = round2(clamp(num(body[k]), 0, 100));
    }
    if (has('sortOrder')) data.sortOrder = Math.floor(num(body.sortOrder));

    if (has('restaurantScope')) data.restaurantScope = body.restaurantScope === 'selected' ? 'selected' : 'all';
    if (has('restaurantIds')) {
        data.restaurantIds = (Array.isArray(body.restaurantIds) ? body.restaurantIds : [])
            .map(String)
            .filter(isId);
    }
    if (has('extraPerks')) {
        data.extraPerks = (Array.isArray(body.extraPerks) ? body.extraPerks : [])
            .map((p) => String(p || '').trim().slice(0, 120))
            .filter(Boolean)
            .slice(0, 12);
    }

    const scope = data.restaurantScope;
    if (scope === 'selected' && (!data.restaurantIds || data.restaurantIds.length === 0) && !partial) {
        throw new ValidationError('Pick at least one partner restaurant, or apply the plan to all restaurants');
    }
    return data;
};

export const listPlans = async ({ activeOnly = false } = {}) => {
    const rows = await prisma.foodMembershipPlan.findMany({
        where: activeOnly ? { isActive: true } : {},
        orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }],
    });
    return rows.map(toPlanDto);
};

export const createPlan = async (body) => {
    const data = sanitizePlanInput(body);
    return toPlanDto(await prisma.foodMembershipPlan.create({ data }));
};

export const updatePlan = async (planId, body) => {
    if (!isId(planId)) throw new NotFoundError('Plan not found');
    const existing = await prisma.foodMembershipPlan.findUnique({ where: { id: planId } });
    if (!existing) throw new NotFoundError('Plan not found');
    const data = sanitizePlanInput(body, { partial: true });
    const scope = data.restaurantScope ?? existing.restaurantScope;
    const ids = data.restaurantIds ?? existing.restaurantIds;
    if (scope === 'selected' && ids.length === 0) {
        throw new ValidationError('Pick at least one partner restaurant, or apply the plan to all restaurants');
    }
    return toPlanDto(await prisma.foodMembershipPlan.update({ where: { id: planId }, data }));
};

/** Plans that were ever sold are deactivated, not deleted, so history keeps its FK. */
export const deletePlan = async (planId) => {
    if (!isId(planId)) throw new NotFoundError('Plan not found');
    const sold = await prisma.foodUserMembership.count({ where: { planId } });
    if (sold > 0) {
        await prisma.foodMembershipPlan.update({ where: { id: planId }, data: { isActive: false } });
        return { deleted: false, deactivated: true };
    }
    await prisma.foodMembershipPlan.delete({ where: { id: planId } });
    return { deleted: true, deactivated: false };
};

// ─── memberships ──────────────────────────────────────────────────────────

const activeWhere = (userId, at = new Date()) => ({
    userId: String(userId),
    status: 'active',
    startsAt: { lte: at },
    expiresAt: { gt: at },
});

/** The membership whose perks apply right now, or null. */
export const getActiveMembership = async (userId, at = new Date()) => {
    if (!isId(userId)) return null;
    return prisma.foodUserMembership.findFirst({
        where: activeWhere(userId, at),
        orderBy: { expiresAt: 'desc' },
    });
};

const toMembershipDto = (m, plan = null) =>
    m && {
        id: m.id,
        planId: m.planId,
        planName: m.planName,
        badgeColor: plan?.badgeColor || m.plan?.badgeColor || '#D4A017',
        perks: m.perks,
        pricePaid: num(m.pricePaid),
        source: m.source,
        status: m.status === 'active' && m.expiresAt <= new Date() ? 'expired' : m.status,
        startsAt: m.startsAt,
        expiresAt: m.expiresAt,
        note: m.note,
        createdAt: m.createdAt,
    };

/** Sum of what memberships saved this user on orders that were not cancelled. */
const savingsFor = async (where) => {
    const agg = await prisma.foodOrder.aggregate({
        where: { ...where, membershipId: { not: null }, orderStatus: { notIn: ['cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin', 'pending_payment'] } },
        _sum: { membershipSavings: true },
        _count: { _all: true },
    });
    return { totalSavings: round2(num(agg._sum.membershipSavings)), ordersCount: agg._count._all };
};

/** Everything the user app needs for its membership screen. */
export const getMyMembership = async (userId) => {
    if (!isId(userId)) throw new ValidationError('User not found');
    const now = new Date();
    const [current, upcoming, history, savings] = await Promise.all([
        prisma.foodUserMembership.findFirst({
            where: activeWhere(userId, now),
            orderBy: { expiresAt: 'desc' },
            include: { plan: true },
        }),
        prisma.foodUserMembership.findMany({
            where: { userId, status: 'active', startsAt: { gt: now } },
            orderBy: { startsAt: 'asc' },
            include: { plan: true },
        }),
        prisma.foodUserMembership.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: { plan: true },
        }),
        savingsFor({ userId }),
    ]);
    return {
        isMember: Boolean(current),
        current: toMembershipDto(current),
        upcoming: upcoming.map((m) => toMembershipDto(m)),
        history: history.map((m) => toMembershipDto(m)),
        ...savings,
    };
};

/**
 * Create the membership row. A renewal bought while a membership is still
 * running starts when the latest one ends, so no paid day is lost.
 */
const activateMembership = async (tx, { userId, plan, source, pricePaid, paymentRef = null, grantedBy = null, note = '', durationDays = null }) => {
    const now = new Date();
    const latest = await tx.foodUserMembership.findFirst({
        where: { userId, status: 'active', expiresAt: { gt: now } },
        orderBy: { expiresAt: 'desc' },
    });
    const startsAt = latest ? latest.expiresAt : now;
    const days = durationDays || plan.durationDays;
    const expiresAt = new Date(startsAt.getTime() + days * 24 * 60 * 60 * 1000);
    return tx.foodUserMembership.create({
        data: {
            userId,
            planId: plan.id,
            planName: plan.name,
            perks: perksFromPlan(plan),
            pricePaid: round2(pricePaid),
            source,
            status: 'active',
            startsAt,
            expiresAt,
            paymentRef,
            grantedBy,
            note,
        },
    });
};

const loadPurchasablePlan = async (planId) => {
    if (!isId(planId)) throw new NotFoundError('Plan not found');
    const plan = await prisma.foodMembershipPlan.findUnique({ where: { id: String(planId) } });
    if (!plan || !plan.isActive) throw new NotFoundError('This plan is no longer available');
    return plan;
};

/** Step 1 of a card/UPI purchase: a Razorpay order for the plan price. */
export const createPurchaseOrder = async (userId, planId) => {
    if (!isId(userId)) throw new ValidationError('User not found');
    const plan = await loadPurchasablePlan(planId);
    const amountPaise = Math.round(num(plan.price) * 100);
    if (amountPaise < 100) throw new ValidationError('Use wallet purchase for plans under ₹1');

    if (!isRazorpayConfigured()) {
        return {
            plan: toPlanDto(plan),
            razorpay: { key: getRazorpayKeyId() || 'rzp_test_dummy', orderId: `order_dev_${Date.now()}`, amount: amountPaise, currency: 'INR' },
        };
    }
    const receipt = `membership_${String(userId).slice(-8)}_${Date.now()}`;
    const order = await createRazorpayOrder(amountPaise, 'INR', receipt);
    return {
        plan: toPlanDto(plan),
        razorpay: { key: getRazorpayKeyId(), orderId: String(order.id), amount: Number(order.amount) || amountPaise, currency: order.currency || 'INR' },
    };
};

/**
 * Step 2: verify the payment and activate. The amount comes from Razorpay, never
 * the client, and must cover the plan price. The gateway order id is the unique
 * paymentRef, so a replayed verify returns the existing membership.
 */
export const verifyPurchase = async (userId, payload = {}) => {
    if (!isId(userId)) throw new ValidationError('User not found');
    const plan = await loadPurchasablePlan(payload.planId);
    const orderId = String(payload.razorpayOrderId || '').trim();
    const paymentId = String(payload.razorpayPaymentId || '').trim();
    const signature = String(payload.razorpaySignature || '').trim();
    if (!orderId || !paymentId || !signature) throw new ValidationError('Payment details are required');

    const paymentRef = `rzp:${orderId}`;
    const existing = await prisma.foodUserMembership.findUnique({ where: { paymentRef } });
    if (existing) {
        if (existing.userId !== String(userId)) throw new ValidationError('Payment verification failed');
        return getMyMembership(userId);
    }

    let paidInr;
    if (isRazorpayConfigured()) {
        try {
            paidInr = (await confirmRazorpayPayment({ orderId, paymentId, signature })) / 100;
        } catch (err) {
            logger.warn(`Membership purchase rejected for user ${userId}: ${err?.message || err}`);
            throw new ValidationError('Payment verification failed');
        }
        if (paidInr + 0.001 < num(plan.price)) {
            logger.error(`Membership underpaid: ${paidInr} < ${plan.price}; user ${userId}, order ${orderId}`);
            throw new ValidationError('Payment verification failed');
        }
    } else {
        paidInr = num(plan.price); // development only
    }

    try {
        await prisma.$transaction((tx) =>
            activateMembership(tx, { userId: String(userId), plan, source: 'razorpay', pricePaid: paidInr, paymentRef }),
        );
    } catch (err) {
        if (err?.code !== 'P2002') throw err; // concurrent duplicate verify — already activated
    }
    return getMyMembership(userId);
};

/** Buy with wallet balance: debit and activate share one idempotency key. */
export const purchaseWithWallet = async (userId, planId, requestId = '') => {
    if (!isId(userId)) throw new ValidationError('User not found');
    const plan = await loadPurchasablePlan(planId);
    const price = num(plan.price);
    const key = `membership_wallet:${userId}:${plan.id}:${String(requestId || Date.now()).slice(0, 40)}`;

    await ensureWallet('user', String(userId));
    if (price > 0) {
        try {
            await recordTransaction({
                entityType: 'user',
                entityId: String(userId),
                type: 'debit',
                amount: price,
                description: `${plan.name} membership`,
                category: 'wallet_debit',
                idempotencyKey: key,
                metadata: { source: 'membership_purchase', planId: plan.id },
            });
        } catch (err) {
            if (/Insufficient balance/i.test(err.message)) throw new ValidationError('Insufficient wallet balance');
            throw err;
        }
    }
    try {
        await prisma.$transaction((tx) =>
            activateMembership(tx, { userId: String(userId), plan, source: 'wallet', pricePaid: price, paymentRef: key }),
        );
    } catch (err) {
        if (err?.code !== 'P2002') {
            // Money left the wallet but no membership was made — give it back.
            if (price > 0) {
                await recordTransaction({
                    entityType: 'user',
                    entityId: String(userId),
                    type: 'credit',
                    amount: price,
                    description: `${plan.name} membership refund`,
                    category: 'order_refund',
                    idempotencyKey: `${key}:refund`,
                    metadata: { source: 'membership_purchase_refund', planId: plan.id },
                }).catch((e) => logger.error(`[CRITICAL] membership wallet refund failed: ${e.message}`));
            }
            throw err;
        }
    }
    return getMyMembership(userId);
};

// ─── pricing ──────────────────────────────────────────────────────────────

const restaurantEligible = (perks, restaurantId) =>
    perks.restaurantScope !== 'selected' ||
    (Array.isArray(perks.restaurantIds) && perks.restaurantIds.includes(String(restaurantId || '')));

/**
 * What a perk set does to one cart. Pure — used for real members and for the
 * "you'd save ₹X with Gold" upsell shown to everyone else.
 */
export const computeMembershipBenefits = (perks, ctx) => {
    const {
        subtotal = 0,
        distanceKm = null,
        restaurantId = null,
        deliveryFee = 0,
        platformFee = 0,
        surcharge = 0,
        isQuick = false,
        couponDiscount = 0,
        couponApplied = false,
    } = ctx;
    const none = { eligible: false, deliveryFeeWaived: 0, platformFeeWaived: 0, surgeWaived: 0, extraDiscount: 0, total: 0 };
    if (!perks || !restaurantEligible(perks, restaurantId)) return none;

    let deliveryFeeWaived = 0;
    if (perks.freeDelivery && deliveryFee > 0 && subtotal >= num(perks.freeDeliveryMinOrder)) {
        const maxKm = num(perks.freeDeliveryMaxKm);
        const withinKm = maxKm <= 0 || (Number.isFinite(distanceKm) && distanceKm <= maxKm);
        if (withinKm) deliveryFeeWaived = round2(deliveryFee);
    }

    const platformFeeWaived = perks.waivePlatformFee ? round2(platformFee) : 0;
    const surgeWaived = perks.waiveSurge && isQuick ? round2(surcharge) : 0;

    let extraDiscount = 0;
    const pct = num(perks.extraDiscountPercent);
    if (
        pct > 0 &&
        subtotal >= num(perks.discountMinOrder) &&
        (perks.stackWithCoupons !== false || !couponApplied)
    ) {
        const base = Math.max(0, subtotal - couponDiscount);
        let amount = (base * pct) / 100;
        const cap = num(perks.maxDiscountPerOrder);
        if (cap > 0) amount = Math.min(amount, cap);
        extraDiscount = Math.max(0, Math.min(base, Math.floor(amount)));
    }

    const total = round2(deliveryFeeWaived + platformFeeWaived + surgeWaived + extraDiscount);
    return { eligible: true, deliveryFeeWaived, platformFeeWaived, surgeWaived, extraDiscount, total };
};

/** Cheapest-first active plan that saves the most on this cart — for the upsell banner. */
export const bestPlanUpsell = async (ctx) => {
    const plans = await prisma.foodMembershipPlan.findMany({
        where: { isActive: true },
        orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { price: 'asc' }],
        take: 10,
    });
    let best = null;
    for (const plan of plans) {
        const b = computeMembershipBenefits(perksFromPlan(plan), ctx);
        if (b.total > 0 && (!best || b.total > best.savings)) {
            best = { planId: plan.id, planName: plan.name, badgeColor: plan.badgeColor, price: num(plan.price), durationDays: plan.durationDays, savings: b.total };
        }
    }
    return best;
};

// ─── delivered-order cashback ─────────────────────────────────────────────

/** Membership cashback on a delivered order. Idempotent per order, never throws. */
export const awardMembershipCashback = async (orderId) => {
    try {
        if (!isId(orderId)) return { awarded: false };
        const order = await prisma.foodOrder.findUnique({
            where: { id: String(orderId) },
            select: { id: true, order_id: true, userId: true, subtotal: true, discount: true, membershipDiscount: true, membershipId: true, orderStatus: true },
        });
        if (!order?.membershipId || order.orderStatus !== 'delivered') return { awarded: false };
        const membership = await prisma.foodUserMembership.findUnique({ where: { id: order.membershipId } });
        const perks = membership?.perks || {};
        const pct = num(perks.cashbackPercent);
        if (pct <= 0) return { awarded: false };

        const base = Math.max(0, num(order.subtotal) - num(order.discount) - num(order.membershipDiscount));
        let amount = (base * pct) / 100;
        const cap = num(perks.maxCashbackPerOrder);
        if (cap > 0) amount = Math.min(amount, cap);
        amount = Math.floor(amount);
        if (amount <= 0) return { awarded: false };

        const idempotencyKey = `membership_cashback:${order.id}`;
        if (await prisma.transaction.findUnique({ where: { idempotencyKey } })) return { awarded: false };

        await recordTransaction({
            entityType: 'user',
            entityId: order.userId,
            type: 'credit',
            amount,
            description: `Cashback (${membership.planName}) on order ${order.order_id || order.id}`,
            category: 'wallet_topup',
            orderId: order.id,
            idempotencyKey,
            metadata: { source: 'membership_cashback', membershipId: membership.id, orderId: order.id },
        });
        return { awarded: true, amount };
    } catch (e) {
        logger.warn(`awardMembershipCashback failed: ${e?.message || e}`);
        return { awarded: false };
    }
};

// ─── admin ────────────────────────────────────────────────────────────────

export const listMembers = async (query = {}) => {
    const page = Math.max(1, Math.floor(num(query.page)) || 1);
    const limit = clamp(Math.floor(num(query.limit)) || 20, 1, 100);
    const now = new Date();
    const where = {};
    if (isId(query.planId)) where.planId = query.planId;
    if (query.status === 'active') Object.assign(where, { status: 'active', expiresAt: { gt: now } });
    else if (query.status === 'expired') Object.assign(where, { OR: [{ status: 'expired' }, { status: 'active', expiresAt: { lte: now } }] });
    else if (query.status === 'cancelled') where.status = 'cancelled';
    const search = String(query.search || '').trim();
    if (search) {
        where.user = { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] };
    }

    const [rows, total] = await Promise.all([
        prisma.foodUserMembership.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
            include: { user: { select: { id: true, name: true, phone: true } }, plan: { select: { badgeColor: true } } },
        }),
        prisma.foodUserMembership.count({ where }),
    ]);
    return {
        members: rows.map((m) => ({
            ...toMembershipDto(m),
            status: m.status === 'active' && m.expiresAt <= now ? 'expired' : m.status,
            user: m.user,
        })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
};

export const getMembershipStats = async () => {
    const now = new Date();
    const [activeMembers, revenue, savings, byPlan] = await Promise.all([
        prisma.foodUserMembership.findMany({
            where: { status: 'active', startsAt: { lte: now }, expiresAt: { gt: now } },
            distinct: ['userId'],
            select: { userId: true },
        }),
        prisma.foodUserMembership.aggregate({ where: { status: { not: 'cancelled' }, source: { not: 'admin_grant' } }, _sum: { pricePaid: true }, _count: { _all: true } }),
        savingsFor({}),
        prisma.foodUserMembership.groupBy({
            by: ['planId'],
            where: { status: 'active', expiresAt: { gt: now } },
            _count: { _all: true },
        }),
    ]);
    return {
        activeMembers: activeMembers.length,
        totalPurchases: revenue._count._all,
        revenue: round2(num(revenue._sum.pricePaid)),
        perksCost: savings.totalSavings,
        memberOrders: savings.ordersCount,
        activeByPlan: Object.fromEntries(byPlan.map((r) => [r.planId, r._count._all])),
    };
};

/** Admin gives a membership for free (promotion, support goodwill). */
export const grantMembership = async (adminId, body = {}) => {
    const userId = String(body.userId || '');
    if (!isId(userId)) throw new ValidationError('Select a customer');
    const user = await prisma.foodUser.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundError('Customer not found');
    if (!isId(body.planId)) throw new NotFoundError('Plan not found');
    const plan = await prisma.foodMembershipPlan.findUnique({ where: { id: String(body.planId) } });
    if (!plan) throw new NotFoundError('Plan not found');
    const days = body.durationDays ? Math.floor(num(body.durationDays)) : plan.durationDays;
    if (days < 1 || days > MAX_DURATION_DAYS) throw new ValidationError('Duration must be between 1 and 3650 days');

    const m = await prisma.$transaction((tx) =>
        activateMembership(tx, {
            userId,
            plan,
            source: 'admin_grant',
            pricePaid: 0,
            grantedBy: isId(adminId) ? String(adminId) : null,
            note: String(body.note || '').slice(0, 500),
            durationDays: days,
        }),
    );
    return toMembershipDto(m, plan);
};

export const cancelMembership = async (membershipId, note = '') => {
    if (!isId(membershipId)) throw new NotFoundError('Membership not found');
    const m = await prisma.foodUserMembership.findUnique({ where: { id: membershipId } });
    if (!m) throw new NotFoundError('Membership not found');
    const updated = await prisma.foodUserMembership.update({
        where: { id: membershipId },
        data: { status: 'cancelled', note: note ? String(note).slice(0, 500) : m.note },
    });
    return toMembershipDto(updated);
};
