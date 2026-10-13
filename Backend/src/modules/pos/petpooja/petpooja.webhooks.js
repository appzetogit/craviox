import { prisma } from '../../../config/prisma.js';
import { invalidateCache } from '../../../middleware/cache.js';
import { loadConfig, tokenMatches } from './petpooja.config.js';
import { logPosEvent } from './petpooja.log.js';
import { normalizeMenu, applyMenu, setStock } from './petpooja.menu.js';
import { handleOrderCallback } from './petpooja.orders.js';

/**
 * Endpoints Petpooja calls (give these URLs to Petpooja during onboarding;
 * Admin → Petpooja shows them with the secret token filled in):
 *
 *   POST /api/v1/integrations/petpooja/menu               push menu
 *   POST /api/v1/integrations/petpooja/stock              item / add-on in or out of stock
 *   POST /api/v1/integrations/petpooja/store-status       outlet on / off
 *   POST /api/v1/integrations/petpooja/store-status/get   current outlet status
 *   POST /api/v1/integrations/petpooja/order-status       order accepted / ready / rejected
 */

// Petpooja's endpoints answer in two styles; send both so either parser is happy.
const reply = (res, ok, message, extra = {}) =>
    res.status(200).json({ success: ok ? '1' : '0', code: ok ? '200' : '400', status: ok ? 'success' : 'failed', message, ...extra });

/** Checks the shared token and that the integration is on. */
export async function requirePetpoojaToken(req, res, next) {
    try {
        const cfg = await loadConfig();
        const given = req.query.token || req.get('x-craviox-token') || req.body?.token;
        if (!tokenMatches(cfg, given)) return res.status(403).json({ success: '0', message: 'Invalid token' });
        if (!cfg.enabled) return res.status(503).json({ success: '0', message: 'Petpooja integration is turned off' });
        req.petpoojaConfig = cfg;
        return next();
    } catch (err) {
        return next(err);
    }
}

const restIdOf = (body = {}) =>
    String(body.restID ?? body.restId ?? body.restaurants?.[0]?.restaurantid ?? body.restaurants?.[0]?.details?.restaurantid ?? '').trim();

async function linkFor(body) {
    const restId = restIdOf(body);
    if (!restId) return { error: 'restID is missing' };
    const link = await prisma.posRestaurantLink.findUnique({ where: { externalRestId: restId } });
    if (!link || !link.enabled) return { error: `restID ${restId} is not linked to a Craviox restaurant` };
    return { link };
}

export async function menuPush(req, res, next) {
    try {
        const { link, error } = await linkFor(req.body);
        if (error) {
            await logPosEvent({ direction: 'in', type: 'menu_push', ok: false, message: error });
            return reply(res, false, error);
        }
        if (!link.syncMenu) return reply(res, false, 'Menu sync is off for this restaurant in Craviox');
        const summary = await applyMenu(link.restaurantId, normalizeMenu(req.body));
        const note = `${summary.items} dishes, ${summary.addons} add-ons${summary.skipped.length ? `, ${summary.skipped.length} skipped` : ''}`;
        await prisma.posRestaurantLink.update({
            where: { id: link.id },
            data: { lastMenuSyncAt: new Date(), lastMenuSyncStatus: 'ok', lastMenuSyncNote: note.slice(0, 300) },
        });
        await logPosEvent({ restaurantId: link.restaurantId, direction: 'in', type: 'menu_push', ok: true, message: note, payload: { summary } });
        return reply(res, true, 'Menu received');
    } catch (err) {
        const { link } = await linkFor(req.body).catch(() => ({}));
        if (link) {
            await prisma.posRestaurantLink.update({ where: { id: link.id }, data: { lastMenuSyncStatus: 'error', lastMenuSyncNote: String(err.message).slice(0, 300) } });
        }
        await logPosEvent({ restaurantId: link?.restaurantId, direction: 'in', type: 'menu_push', ok: false, message: err.message });
        return next(err);
    }
}

export async function stockUpdate(req, res, next) {
    try {
        const { link, error } = await linkFor(req.body);
        if (error) return reply(res, false, error);
        const b = req.body || {};
        const kind = String(b.type || 'item').toLowerCase() === 'addon' ? 'addon' : 'item';
        const ids = (Array.isArray(b.itemID) ? b.itemID : Array.isArray(b.itemIds) ? b.itemIds : [b.itemID]).filter(Boolean).map(String);
        const inStock = ['1', 1, true, 'true'].includes(b.inStock ?? b.in_stock);
        const resumeRaw = b.customTurnOnTime || b.turn_on_time;
        const resumeAt = !inStock && resumeRaw && !Number.isNaN(Date.parse(resumeRaw)) ? new Date(resumeRaw) : null;
        const result = await setStock(link.restaurantId, { kind, externalIds: ids, inStock, resumeAt });
        const message = `${result.updated} ${kind === 'addon' ? 'add-ons' : 'dishes'} ${inStock ? 'back in stock' : 'out of stock'}${result.unknown ? `, ${result.unknown} unknown ids` : ''}`;
        await logPosEvent({ restaurantId: link.restaurantId, direction: 'in', type: 'stock', ok: true, message, payload: b });
        return reply(res, true, message);
    } catch (err) {
        return next(err);
    }
}

export async function storeStatusUpdate(req, res, next) {
    try {
        const { link, error } = await linkFor(req.body);
        if (error) return reply(res, false, error);
        const open = ['1', 1, true, 'true'].includes(req.body?.store_status);
        await prisma.foodRestaurant.update({ where: { id: link.restaurantId }, data: { isAcceptingOrders: open } });
        await Promise.all(['restaurants:*', 'restaurant_detail:*'].map((p) => invalidateCache(p).catch(() => {})));
        const message = open ? 'Outlet is open on Craviox' : `Outlet is closed on Craviox${req.body?.reason ? `: ${String(req.body.reason).slice(0, 100)}` : ''}`;
        await logPosEvent({ restaurantId: link.restaurantId, direction: 'in', type: 'store_status', ok: true, message, payload: req.body });
        return reply(res, true, message);
    } catch (err) {
        return next(err);
    }
}

export async function storeStatusGet(req, res, next) {
    try {
        const { link, error } = await linkFor(req.body);
        if (error) return reply(res, false, error);
        const r = await prisma.foodRestaurant.findUnique({ where: { id: link.restaurantId }, select: { isAcceptingOrders: true } });
        return reply(res, true, 'Store status', { store_status: r?.isAcceptingOrders ? '1' : '0' });
    } catch (err) {
        return next(err);
    }
}

export async function orderStatus(req, res, next) {
    try {
        const result = await handleOrderCallback(req.body || {});
        await logPosEvent({
            restaurantId: result.restaurantId, orderId: result.orderId, direction: 'in', type: 'order_status',
            ok: result.ok, message: result.message, payload: req.body,
        });
        // A status we could not apply (already accepted in Craviox, cancelled…)
        // is still acknowledged, so Petpooja does not retry it forever.
        return reply(res, result.ok || Boolean(result.soft), result.message);
    } catch (err) {
        return next(err);
    }
}
