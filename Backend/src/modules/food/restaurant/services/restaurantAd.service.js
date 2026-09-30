/**
 * Restaurant advertisements.
 *
 * A restaurant buys a campaign — a date range and a daily budget — to be shown
 * first, marked "Promoted", in the customer restaurant list and search. Cost is
 * fixed and known upfront: daily budget × days. Payment is either prepaid
 * (Razorpay, before approval) or postpaid (taken off the restaurant's payout
 * balance, see getWalletSummaries). Every ad waits for an admin to approve it.
 *
 * Stored status is the workflow state; whether an approved ad is scheduled, live
 * or completed follows from its dates (displayStatus).
 */
import { prisma } from '../../../../config/prisma.js';
import { isId } from '../../../../utils/helpers.js';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';
import { invalidateCache } from '../../../../middleware/cache.js';
import { notifyAdminsSafely, notifyOwnersSafely } from '../../../../core/notifications/firebase.service.js';
import {
    createRazorpayOrder,
    confirmRazorpayPayment,
    getRazorpayKeyId,
    initiateRazorpayRefund,
    isRazorpayConfigured,
} from '../../orders/helpers/razorpay.helper.js';

export const AD_CONFIG = {
    minDailyBudget: 500,
    recommendedDailyBudget: 750,
    maxDailyBudget: 50000,
    maxDays: 90,
    /** Rough planning figures behind the estimates shown before purchase. */
    estimatedCostPerVisit: 5,
    reachPerVisit: 6,
    ordersPerVisit: 0.08,
};

const IST_OFFSET = '+05:30';
const DAY_MS = 24 * 60 * 60 * 1000;
const num = (v) => Number(v) || 0;
const money = (v) => Math.round(num(v) * 100) / 100;

/** 'YYYY-MM-DD' in Asia/Kolkata for an instant. */
const istDay = (date = new Date()) =>
    new Date(date.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

const parseDay = (value, label) => {
    const text = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T00:00:00${IST_OFFSET}`).getTime())) {
        throw new ValidationError(`${label} must be a date like 2026-10-01`);
    }
    return text;
};

/**
 * Price and estimates for a campaign. Pure apart from "today", so the restaurant
 * app can call it (POST /ads/quote) to preview before buying.
 */
export function quoteAd({ startDate, endDate, dailyBudget } = {}) {
    const start = parseDay(startDate, 'Start date');
    const end = parseDay(endDate, 'End date');
    if (start < istDay()) throw new ValidationError('Start date cannot be in the past');
    if (end < start) throw new ValidationError('End date must be on or after the start date');

    const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1;
    if (days > AD_CONFIG.maxDays) throw new ValidationError(`A campaign can run for at most ${AD_CONFIG.maxDays} days`);

    const budget = money(dailyBudget);
    if (!Number.isFinite(budget) || budget < AD_CONFIG.minDailyBudget) {
        throw new ValidationError(`Daily budget must be at least ₹${AD_CONFIG.minDailyBudget}`);
    }
    if (budget > AD_CONFIG.maxDailyBudget) {
        throw new ValidationError(`Daily budget can be at most ₹${AD_CONFIG.maxDailyBudget}`);
    }

    const totalAmount = money(budget * days);
    const estimatedVisits = Math.round(totalAmount / AD_CONFIG.estimatedCostPerVisit);
    return {
        startDate: start,
        endDate: end,
        days,
        dailyBudget: budget,
        totalAmount,
        estimatedVisits,
        estimatedReach: estimatedVisits * AD_CONFIG.reachPerVisit,
        estimatedOrders: Math.round(estimatedVisits * AD_CONFIG.ordersPerVisit),
        recommendedDailyBudget: AD_CONFIG.recommendedDailyBudget,
        minDailyBudget: AD_CONFIG.minDailyBudget,
    };
}

/** scheduled / live / completed for approved ads; the stored status otherwise. */
export function displayStatus(ad, now = new Date()) {
    if (ad.status !== 'approved') return ad.status;
    if (now < ad.startDate) return 'scheduled';
    if (now > ad.endDate) return 'completed';
    return 'live';
}

/** Orders placed with the restaurant during the campaign (online ones once paid). */
async function countCampaignOrders(ad) {
    const until = ad.stoppedAt && ad.stoppedAt < ad.endDate ? ad.stoppedAt : ad.endDate;
    if (ad.status !== 'approved' && ad.status !== 'stopped') return 0;
    return prisma.foodOrder.count({
        where: {
            restaurantId: ad.restaurantId,
            createdAt: { gte: ad.startDate, lte: until },
            orderStatus: { notIn: ['pending_payment', 'cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin'] },
        },
    });
}

async function serializeAd(ad, { withOrders = true } = {}) {
    return {
        id: ad.id,
        _id: ad.id,
        restaurantId: ad.restaurantId,
        restaurantName: ad.restaurant?.restaurantName,
        startDate: istDay(ad.startDate),
        endDate: istDay(new Date(ad.endDate.getTime() - 1)),
        days: ad.days,
        dailyBudget: num(ad.dailyBudget),
        totalAmount: num(ad.totalAmount),
        chargedAmount: num(ad.chargedAmount),
        refundedAmount: num(ad.refundedAmount),
        paymentMode: ad.paymentMode,
        paymentStatus: ad.paymentStatus,
        status: ad.status,
        displayStatus: displayStatus(ad),
        rejectionReason: ad.rejectionReason,
        estimates: {
            visits: ad.estimatedVisits,
            reach: ad.estimatedReach,
            orders: ad.estimatedOrders,
        },
        results: {
            menuVisits: ad.menuVisits,
            orders: withOrders ? await countCampaignOrders(ad) : undefined,
        },
        approvedAt: ad.approvedAt,
        rejectedAt: ad.rejectedAt,
        stoppedAt: ad.stoppedAt,
        cancelledAt: ad.cancelledAt,
        createdAt: ad.createdAt,
    };
}

// ── Which restaurants are promoted right now ────────────────────────────────

let promotedCache = null;
let promotedLoadedAt = 0;
const PROMOTED_CACHE_MS = 60 * 1000;

/**
 * Restaurant ids (and normalised names, for slug URLs) with an approved ad
 * running now. Cached for a minute; approving or stopping an ad clears it.
 */
export async function getPromotedRestaurants() {
    const now = Date.now();
    if (promotedCache && now - promotedLoadedAt < PROMOTED_CACHE_MS) return promotedCache;
    const at = new Date();
    const ads = await prisma.foodRestaurantAd.findMany({
        where: { status: 'approved', startDate: { lte: at }, endDate: { gte: at } },
        select: { restaurantId: true, restaurant: { select: { restaurantNameNormalized: true, status: true } } },
    });
    const live = ads.filter((a) => a.restaurant?.status === 'approved');
    promotedCache = {
        ids: new Set(live.map((a) => a.restaurantId)),
        names: new Map(live.map((a) => [a.restaurant.restaurantNameNormalized, a.restaurantId])),
    };
    promotedLoadedAt = now;
    return promotedCache;
}

async function dropPromotionCaches() {
    promotedCache = null;
    await Promise.all([invalidateCache('restaurants:*'), invalidateCache('search_unified:*')]).catch(() => {});
}

/**
 * Express middleware for the public restaurant page: counts a menu visit on a
 * live ad. Sits in front of the response cache, so cached views still count,
 * and never delays or fails the request.
 */
export function countAdMenuVisit(req, _res, next) {
    const key = String(req.params?.id || '').trim();
    if (key) {
        getPromotedRestaurants()
            .then(({ ids, names }) => {
                const restaurantId = ids.has(key) ? key : names.get(key.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' '));
                if (!restaurantId) return null;
                const at = new Date();
                return prisma.foodRestaurantAd.updateMany({
                    where: { restaurantId, status: 'approved', startDate: { lte: at }, endDate: { gte: at } },
                    data: { menuVisits: { increment: 1 } },
                });
            })
            .catch((err) => logger.warn(`Ad visit count failed: ${err?.message || err}`));
    }
    next();
}

// ── Restaurant side ─────────────────────────────────────────────────────────

const ownAd = async (restaurantId, adId) => {
    if (!isId(adId)) throw new NotFoundError('Ad not found');
    const ad = await prisma.foodRestaurantAd.findFirst({ where: { id: String(adId), restaurantId: String(restaurantId) } });
    if (!ad) throw new NotFoundError('Ad not found');
    return ad;
};

export async function listRestaurantAds(restaurantId) {
    const ads = await prisma.foodRestaurantAd.findMany({
        where: { restaurantId: String(restaurantId) },
        orderBy: { createdAt: 'desc' },
        take: 100,
    });
    return { ads: await Promise.all(ads.map((ad) => serializeAd(ad))), config: AD_CONFIG };
}

const razorpayCheckout = async (ad) => {
    if (!isRazorpayConfigured()) throw new ValidationError('Online payment is not available right now. Choose postpaid.');
    const amountPaise = Math.round(num(ad.totalAmount) * 100);
    const order = await createRazorpayOrder(amountPaise, 'INR', `ad_${ad.id}`);
    await prisma.foodRestaurantAd.update({ where: { id: ad.id }, data: { razorpayOrderId: String(order.id) } });
    return { key: getRazorpayKeyId(), orderId: String(order.id), amount: Number(order.amount) || amountPaise, currency: order.currency || 'INR' };
};

const notifyAdminsOfRequest = (ad, restaurantName) =>
    void notifyAdminsSafely({
        title: 'New ad request 📣',
        body: `${restaurantName || 'A restaurant'} wants to advertise ${istDay(ad.startDate)} → ${ad.days} day(s), ₹${num(ad.totalAmount)}.`,
        data: { type: 'approval_request', subType: 'restaurant_ad', id: ad.id },
    }).catch((err) => logger.warn(`Ad request notification failed: ${err?.message || err}`));

/**
 * Create a campaign. Postpaid goes straight to the approval queue; prepaid
 * returns a Razorpay order to pay first (then POST /ads/:id/verify-payment).
 */
export async function createRestaurantAd(restaurantId, body = {}) {
    const restaurant = await prisma.foodRestaurant.findUnique({
        where: { id: String(restaurantId) },
        select: { id: true, status: true, restaurantName: true },
    });
    if (!restaurant) throw new NotFoundError('Restaurant not found');
    if (restaurant.status !== 'approved') throw new ValidationError('Your restaurant must be approved before it can advertise');

    const paymentMode = body.paymentMode === 'postpaid' ? 'postpaid' : body.paymentMode === 'prepaid' ? 'prepaid' : null;
    if (!paymentMode) throw new ValidationError('Choose prepaid or postpaid');

    const quote = quoteAd(body);
    const ad = await prisma.foodRestaurantAd.create({
        data: {
            restaurantId: restaurant.id,
            startDate: new Date(`${quote.startDate}T00:00:00${IST_OFFSET}`),
            endDate: new Date(new Date(`${quote.endDate}T00:00:00${IST_OFFSET}`).getTime() + DAY_MS - 1),
            days: quote.days,
            dailyBudget: quote.dailyBudget,
            totalAmount: quote.totalAmount,
            paymentMode,
            paymentStatus: paymentMode === 'postpaid' ? 'postpaid' : 'unpaid',
            status: paymentMode === 'postpaid' ? 'pending_approval' : 'awaiting_payment',
            estimatedVisits: quote.estimatedVisits,
            estimatedReach: quote.estimatedReach,
            estimatedOrders: quote.estimatedOrders,
        },
    });

    if (paymentMode === 'postpaid') {
        notifyAdminsOfRequest(ad, restaurant.restaurantName);
        return { ad: await serializeAd(ad, { withOrders: false }), razorpay: null };
    }
    return { ad: await serializeAd(ad, { withOrders: false }), razorpay: await razorpayCheckout(ad) };
}

/** A fresh Razorpay order for a prepaid ad still awaiting payment (retry). */
export async function retryAdPayment(restaurantId, adId) {
    const ad = await ownAd(restaurantId, adId);
    if (ad.status !== 'awaiting_payment') throw new ValidationError('This ad is not waiting for payment');
    if (ad.startDate < new Date(`${istDay()}T00:00:00${IST_OFFSET}`)) {
        throw new ValidationError('The start date has passed. Cancel this ad and create a new one.');
    }
    return { razorpay: await razorpayCheckout(ad) };
}

export async function verifyAdPayment(restaurantId, adId, payload = {}) {
    const ad = await ownAd(restaurantId, adId);
    const orderId = payload.razorpay_order_id || payload.razorpayOrderId;
    const paymentId = payload.razorpay_payment_id || payload.razorpayPaymentId;
    const signature = payload.razorpay_signature || payload.razorpaySignature;
    if (!orderId || !paymentId || !signature) throw new ValidationError('Payment details are missing');

    // Replay of an already verified payment: answer the same, change nothing.
    if (ad.paymentStatus === 'paid' && ad.razorpayPaymentId === String(paymentId)) {
        return { ad: await serializeAd(ad, { withOrders: false }) };
    }
    if (ad.status !== 'awaiting_payment') throw new ValidationError('This ad is not waiting for payment');
    if (String(ad.razorpayOrderId) !== String(orderId)) throw new ValidationError('Payment does not belong to this ad');

    try {
        await confirmRazorpayPayment({
            orderId: String(orderId),
            paymentId: String(paymentId),
            signature: String(signature),
            expectedPaise: Math.round(num(ad.totalAmount) * 100),
        });
    } catch (err) {
        throw new ValidationError(err?.message || 'Payment could not be verified');
    }

    const { count } = await prisma.foodRestaurantAd.updateMany({
        where: { id: ad.id, status: 'awaiting_payment' },
        data: { status: 'pending_approval', paymentStatus: 'paid', razorpayPaymentId: String(paymentId) },
    });
    const updated = await prisma.foodRestaurantAd.findUnique({ where: { id: ad.id }, include: { restaurant: { select: { restaurantName: true } } } });
    if (count) notifyAdminsOfRequest(updated, updated.restaurant?.restaurantName);
    return { ad: await serializeAd(updated, { withOrders: false }) };
}

/** Refund part or all of a prepaid ad's payment to the original payment method. */
async function refundPrepaid(ad, amount) {
    const value = money(amount);
    if (ad.paymentMode !== 'prepaid' || ad.paymentStatus !== 'paid' || !ad.razorpayPaymentId || value <= 0) return {};
    const result = await initiateRazorpayRefund(ad.razorpayPaymentId, value);
    if (!result?.success) {
        logger.error(`Ad refund failed for ${ad.id}: ${result?.error}`);
        throw new ValidationError(`Refund failed: ${result?.error || 'Razorpay error'}. Nothing was changed; try again.`);
    }
    return {
        refundedAmount: value,
        refundId: result.refundId,
        paymentStatus: value >= num(ad.totalAmount) ? 'refunded' : 'partially_refunded',
    };
}

/** The restaurant withdraws a request that has not been approved yet. */
export async function cancelRestaurantAd(restaurantId, adId) {
    const ad = await ownAd(restaurantId, adId);
    if (!['awaiting_payment', 'pending_approval'].includes(ad.status)) {
        throw new ValidationError('Only an ad that is not yet approved can be cancelled. Contact support to stop a running ad.');
    }
    const refund = await refundPrepaid(ad, ad.totalAmount);
    const updated = await prisma.foodRestaurantAd.update({
        where: { id: ad.id },
        data: { status: 'cancelled', cancelledAt: new Date(), chargedAmount: 0, ...refund },
    });
    return { ad: await serializeAd(updated, { withOrders: false }) };
}

// ── Admin side ──────────────────────────────────────────────────────────────

const ADMIN_TABS = {
    pending: { status: 'pending_approval' },
    live: () => ({ status: 'approved', startDate: { lte: new Date() }, endDate: { gte: new Date() } }),
    scheduled: () => ({ status: 'approved', startDate: { gt: new Date() } }),
    completed: () => ({ OR: [{ status: 'approved', endDate: { lt: new Date() } }, { status: 'stopped' }] }),
    rejected: { status: { in: ['rejected', 'cancelled'] } },
    all: { status: { not: 'awaiting_payment' } },
};

export async function listAdsAdmin(query = {}) {
    const tab = ADMIN_TABS[query.tab] ? query.tab : 'pending';
    const where = typeof ADMIN_TABS[tab] === 'function' ? ADMIN_TABS[tab]() : ADMIN_TABS[tab];
    const ads = await prisma.foodRestaurantAd.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { restaurant: { select: { restaurantName: true } } },
    });
    const counts = Object.fromEntries(
        await Promise.all(
            Object.entries(ADMIN_TABS).map(async ([key, w]) => [
                key,
                await prisma.foodRestaurantAd.count({ where: typeof w === 'function' ? w() : w }),
            ]),
        ),
    );
    return { tab, counts, ads: await Promise.all(ads.map((ad) => serializeAd(ad))) };
}

const adForAdmin = async (adId) => {
    if (!isId(adId)) throw new NotFoundError('Ad not found');
    const ad = await prisma.foodRestaurantAd.findUnique({
        where: { id: String(adId) },
        include: { restaurant: { select: { restaurantName: true } } },
    });
    if (!ad) throw new NotFoundError('Ad not found');
    return ad;
};

const tellRestaurant = (ad, title, body) =>
    void notifyOwnersSafely([{ ownerType: 'RESTAURANT', ownerId: ad.restaurantId }], {
        title,
        body,
        data: { type: 'restaurant_ad', adId: ad.id },
    }).catch((err) => logger.warn(`Ad notification failed: ${err?.message || err}`));

export async function approveAd(adId) {
    const ad = await adForAdmin(adId);
    if (ad.status !== 'pending_approval') throw new ValidationError('Only a pending ad can be approved');
    if (ad.endDate < new Date()) throw new ValidationError('This ad\'s dates have already passed. Reject it instead.');

    const { count } = await prisma.foodRestaurantAd.updateMany({
        where: { id: ad.id, status: 'pending_approval' },
        data: { status: 'approved', approvedAt: new Date(), chargedAmount: ad.totalAmount },
    });
    if (!count) throw new ValidationError('This ad was already handled');
    await dropPromotionCaches();
    tellRestaurant(ad, 'Your ad is approved 🎉', `Your ad runs ${istDay(ad.startDate)} for ${ad.days} day(s).`);
    return { ad: await serializeAd(await adForAdmin(ad.id)) };
}

export async function rejectAd(adId, reason) {
    const ad = await adForAdmin(adId);
    if (ad.status !== 'pending_approval') throw new ValidationError('Only a pending ad can be rejected');
    const text = String(reason || '').trim();
    if (!text) throw new ValidationError('Give a reason so the restaurant knows what to fix');

    const refund = await refundPrepaid(ad, ad.totalAmount);
    const updated = await prisma.foodRestaurantAd.update({
        where: { id: ad.id },
        data: { status: 'rejected', rejectedAt: new Date(), rejectionReason: text, chargedAmount: 0, ...refund },
    });
    tellRestaurant(
        ad,
        'Your ad was not approved',
        `${text}${refund.refundedAmount ? ` ₹${refund.refundedAmount} is being refunded to your payment method.` : ''}`,
    );
    return { ad: await serializeAd({ ...updated, restaurant: ad.restaurant }) };
}

/**
 * End an approved ad early. It is charged for the days it ran (today counts);
 * a prepaid ad gets the rest refunded, a postpaid one is only charged for those days.
 */
export async function stopAd(adId) {
    const ad = await adForAdmin(adId);
    if (ad.status !== 'approved') throw new ValidationError('Only an approved ad can be stopped');
    const now = new Date();
    if (now > ad.endDate) throw new ValidationError('This ad has already finished');

    const daysRun = now < ad.startDate
        ? 0
        : Math.min(ad.days, Math.round((Date.parse(`${istDay(now)}T00:00:00Z`) - Date.parse(`${istDay(ad.startDate)}T00:00:00Z`)) / DAY_MS) + 1);
    const charged = money(num(ad.dailyBudget) * daysRun);
    const refund = await refundPrepaid(ad, num(ad.totalAmount) - charged);

    const updated = await prisma.foodRestaurantAd.update({
        where: { id: ad.id },
        data: { status: 'stopped', stoppedAt: now, chargedAmount: charged, ...refund },
    });
    await dropPromotionCaches();
    tellRestaurant(
        ad,
        'Your ad was stopped',
        `Charged ₹${charged} for ${daysRun} day(s).${refund.refundedAmount ? ` ₹${refund.refundedAmount} is being refunded.` : ''}`,
    );
    return { ad: await serializeAd({ ...updated, restaurant: ad.restaurant }) };
}

/** Postpaid ad charges per restaurant, for the payout balance (getWalletSummaries). */
export async function sumPostpaidAdCharges(restaurantIds, { db = prisma } = {}) {
    const rows = await db.foodRestaurantAd.groupBy({
        by: ['restaurantId'],
        where: { restaurantId: { in: restaurantIds }, paymentMode: 'postpaid', status: { in: ['approved', 'stopped'] } },
        _sum: { chargedAmount: true },
    });
    return new Map(rows.map((r) => [r.restaurantId, num(r._sum.chargedAmount)]));
}
