import {
    AD_CONFIG,
    approveAd,
    cancelRestaurantAd,
    createRestaurantAd,
    listAdsAdmin,
    listRestaurantAds,
    quoteAd,
    rejectAd,
    retryAdPayment,
    stopAd,
    verifyAdPayment,
} from '../services/restaurantAd.service.js';
import { sendResponse } from '../../../../utils/response.js';

const handle = (fn, message, status = 200) => async (req, res, next) => {
    try {
        return sendResponse(res, status, message, await fn(req));
    } catch (error) {
        return next(error);
    }
};

const restaurantId = (req) => req.user?.userId;

// Restaurant
export const getAdConfigController = handle(async () => ({ config: AD_CONFIG }), 'Ad settings fetched');
export const quoteAdController = handle(async (req) => ({ quote: quoteAd(req.body || {}) }), 'Ad quote');
export const listMyAdsController = handle((req) => listRestaurantAds(restaurantId(req)), 'Ads fetched');
export const createAdController = handle((req) => createRestaurantAd(restaurantId(req), req.body || {}), 'Ad created', 201);
export const retryAdPaymentController = handle((req) => retryAdPayment(restaurantId(req), req.params.id), 'Payment order created');
export const verifyAdPaymentController = handle(
    (req) => verifyAdPayment(restaurantId(req), req.params.id, req.body || {}),
    'Payment verified. Your ad is waiting for approval.',
);
export const cancelAdController = handle((req) => cancelRestaurantAd(restaurantId(req), req.params.id), 'Ad cancelled');

// Admin
export const listAdsAdminController = handle((req) => listAdsAdmin(req.query || {}), 'Ads fetched');
export const approveAdController = handle((req) => approveAd(req.params.id), 'Ad approved');
export const rejectAdController = handle((req) => rejectAd(req.params.id, req.body?.reason), 'Ad rejected');
export const stopAdController = handle((req) => stopAd(req.params.id), 'Ad stopped');
