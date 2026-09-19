import { sendResponse } from '../../../utils/response.js';
import * as membership from './membership.service.js';

const wrap = (fn) => async (req, res, next) => {
    try {
        await fn(req, res);
    } catch (e) {
        next(e);
    }
};

// ── user ──
export const listPlansForUser = wrap(async (_req, res) =>
    sendResponse(res, 200, 'Membership plans fetched', { plans: await membership.listPlans({ activeOnly: true }) }));

export const getMyMembership = wrap(async (req, res) =>
    sendResponse(res, 200, 'Membership fetched', await membership.getMyMembership(req.user?.userId)));

export const createPurchaseOrder = wrap(async (req, res) =>
    sendResponse(res, 200, 'Payment order created', await membership.createPurchaseOrder(req.user?.userId, req.body?.planId)));

export const verifyPurchase = wrap(async (req, res) =>
    sendResponse(res, 200, 'Membership activated', await membership.verifyPurchase(req.user?.userId, req.body || {})));

export const purchaseWithWallet = wrap(async (req, res) =>
    sendResponse(res, 200, 'Membership activated', await membership.purchaseWithWallet(req.user?.userId, req.body?.planId, req.body?.requestId)));

// ── admin ──
export const adminListPlans = wrap(async (_req, res) =>
    sendResponse(res, 200, 'Membership plans fetched', { plans: await membership.listPlans() }));

export const adminCreatePlan = wrap(async (req, res) =>
    sendResponse(res, 201, 'Plan created', { plan: await membership.createPlan(req.body || {}) }));

export const adminUpdatePlan = wrap(async (req, res) =>
    sendResponse(res, 200, 'Plan updated', { plan: await membership.updatePlan(req.params.planId, req.body || {}) }));

export const adminDeletePlan = wrap(async (req, res) => {
    const result = await membership.deletePlan(req.params.planId);
    return sendResponse(res, 200, result.deleted ? 'Plan deleted' : 'Plan has members, so it was deactivated instead', result);
});

export const adminListMembers = wrap(async (req, res) =>
    sendResponse(res, 200, 'Members fetched', await membership.listMembers(req.query || {})));

export const adminStats = wrap(async (_req, res) =>
    sendResponse(res, 200, 'Membership stats fetched', { stats: await membership.getMembershipStats() }));

export const adminGrant = wrap(async (req, res) =>
    sendResponse(res, 201, 'Membership granted', {
        membership: await membership.grantMembership(req.user?.userId || req.user?.id, req.body || {}),
    }));

export const adminCancel = wrap(async (req, res) =>
    sendResponse(res, 200, 'Membership cancelled', {
        membership: await membership.cancelMembership(req.params.membershipId, req.body?.note),
    }));
