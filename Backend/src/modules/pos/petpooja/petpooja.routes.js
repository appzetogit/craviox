import express from 'express';
import { prisma } from '../../../config/prisma.js';
import { sendError } from '../../../utils/response.js';
import * as webhooks from './petpooja.webhooks.js';
import * as admin from './petpooja.admin.js';

/** Public: called by Petpooja, guarded by the shared webhook token. */
export const petpoojaWebhookRoutes = express.Router();
petpoojaWebhookRoutes.use(webhooks.requirePetpoojaToken);
petpoojaWebhookRoutes.post('/menu', webhooks.menuPush);
petpoojaWebhookRoutes.post('/stock', webhooks.stockUpdate);
petpoojaWebhookRoutes.post('/store-status', webhooks.storeStatusUpdate);
petpoojaWebhookRoutes.post('/store-status/get', webhooks.storeStatusGet);
petpoojaWebhookRoutes.post('/order-status', webhooks.orderStatus);

/** Admin → Petpooja. Mounted inside the admin router (auth and permissions already applied). */
export const petpoojaAdminRoutes = express.Router();
petpoojaAdminRoutes.get('/config', admin.getConfig);
petpoojaAdminRoutes.put('/config', admin.putConfig);
petpoojaAdminRoutes.post('/config/rotate-token', admin.rotateToken);
petpoojaAdminRoutes.get('/links', admin.listLinks);
petpoojaAdminRoutes.post('/links', admin.createLink);
petpoojaAdminRoutes.patch('/links/:id', admin.updateLink);
petpoojaAdminRoutes.delete('/links/:id', admin.deleteLink);
petpoojaAdminRoutes.post('/links/:id/sync-menu', admin.syncMenuNow);
petpoojaAdminRoutes.post('/links/:id/import-menu', admin.importMenu);
petpoojaAdminRoutes.get('/orders', admin.listOrders);
petpoojaAdminRoutes.post('/orders/:orderId/retry', admin.retryOrder);
petpoojaAdminRoutes.get('/logs', admin.listLogs);

const STOCK_ONLY_FIELDS = new Set(['isAvailable', 'stockResumeAt', 'stockOffMode']);

/**
 * Restaurant menu writes are refused while Petpooja owns the menu: the next
 * sync would overwrite them anyway. Switching a dish in or out of stock stays
 * allowed, so the kitchen can still react without the POS.
 */
export async function posMenuLock(req, res, next) {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId) return next();
        const link = await prisma.posRestaurantLink.findUnique({ where: { restaurantId }, select: { enabled: true, syncMenu: true } });
        if (!link?.enabled || !link.syncMenu) return next();
        const keys = Object.keys(req.body || {});
        const stockToggle = req.method === 'PATCH' && /^\/foods\//.test(req.path) && keys.length > 0 && keys.every((k) => STOCK_ONLY_FIELDS.has(k));
        if (stockToggle) return next();
        return sendError(res, 409, 'Your menu is managed in Petpooja. Make the change there and it will sync to Craviox.');
    } catch (err) {
        return next(err);
    }
}
