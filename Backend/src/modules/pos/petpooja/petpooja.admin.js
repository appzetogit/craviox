import { prisma } from '../../../config/prisma.js';
import { sendResponse } from '../../../utils/response.js';
import { ValidationError, NotFoundError } from '../../../core/auth/errors.js';
import { isId } from '../../../utils/helpers.js';
import { loadConfig, toAdminConfig, updateConfig, rotateWebhookToken, callPetpooja } from './petpooja.config.js';
import { logPosEvent } from './petpooja.log.js';
import { normalizeMenu, applyMenu } from './petpooja.menu.js';
import { pushOrderToPetpooja } from './petpooja.orders.js';

/** Admin → Petpooja. Mounted at /api/v1/food/admin/integrations/petpooja. */

const wrap = (fn) => async (req, res, next) => {
    try {
        await fn(req, res);
    } catch (err) {
        next(err);
    }
};

const webhookUrls = (token) => {
    const base = String(process.env.PUBLIC_API_URL || 'https://craviox.com/api/v1').replace(/\/$/, '');
    const u = (p) => `${base}/integrations/petpooja/${p}?token=${token}`;
    return {
        menu: u('menu'),
        stock: u('stock'),
        storeStatus: u('store-status'),
        storeStatusGet: u('store-status/get'),
        orderStatus: u('order-status'),
    };
};

export const getConfig = wrap(async (req, res) => {
    const row = await loadConfig();
    sendResponse(res, 200, 'Petpooja settings', { config: toAdminConfig(row), webhooks: webhookUrls(row.webhookToken) });
});

export const putConfig = wrap(async (req, res) => {
    const config = await updateConfig(req.body || {});
    sendResponse(res, 200, 'Petpooja settings saved', { config, webhooks: webhookUrls(config.webhookToken) });
});

export const rotateToken = wrap(async (req, res) => {
    const config = await rotateWebhookToken();
    sendResponse(res, 200, 'New webhook token created. Send Petpooja the new URLs.', { config, webhooks: webhookUrls(config.webhookToken) });
});

// ----- Restaurant links -----

async function serializeLinks(where = {}) {
    const links = await prisma.posRestaurantLink.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { restaurant: { select: { restaurantName: true, city: true, area: true, isAcceptingOrders: true } } },
    });
    const ids = links.map((l) => l.restaurantId);
    const [mapped, failed] = await Promise.all([
        prisma.posEntityMap.groupBy({ by: ['restaurantId', 'kind'], where: { restaurantId: { in: ids } }, _count: { _all: true } }),
        prisma.posOrderLink.groupBy({ by: ['restaurantId'], where: { restaurantId: { in: ids }, pushStatus: 'failed' }, _count: { _all: true } }),
    ]);
    const countOf = (rid, kind) => mapped.find((m) => m.restaurantId === rid && m.kind === kind)?._count._all || 0;
    return links.map((l) => ({
        id: l.id,
        restaurantId: l.restaurantId,
        restaurantName: l.restaurant?.restaurantName || '',
        place: [l.restaurant?.area, l.restaurant?.city].filter(Boolean).join(', '),
        isAcceptingOrders: Boolean(l.restaurant?.isAcceptingOrders),
        externalRestId: l.externalRestId,
        enabled: l.enabled,
        syncMenu: l.syncMenu,
        pushOrders: l.pushOrders,
        lastMenuSyncAt: l.lastMenuSyncAt,
        lastMenuSyncStatus: l.lastMenuSyncStatus,
        lastMenuSyncNote: l.lastMenuSyncNote,
        linkedDishes: countOf(l.restaurantId, 'item'),
        linkedAddons: countOf(l.restaurantId, 'addon'),
        failedOrders: failed.find((f) => f.restaurantId === l.restaurantId)?._count._all || 0,
    }));
}

export const listLinks = wrap(async (req, res) => {
    sendResponse(res, 200, 'Linked restaurants', { links: await serializeLinks() });
});

const cleanRestId = (v) => String(v ?? '').trim().slice(0, 64);

export const createLink = wrap(async (req, res) => {
    const restaurantId = String(req.body?.restaurantId || '');
    const externalRestId = cleanRestId(req.body?.externalRestId);
    if (!isId(restaurantId)) throw new ValidationError('Choose a restaurant');
    if (!externalRestId) throw new ValidationError('Enter the Petpooja restaurant ID (restID)');
    const restaurant = await prisma.foodRestaurant.findUnique({ where: { id: restaurantId }, select: { id: true } });
    if (!restaurant) throw new NotFoundError('Restaurant not found');
    const clash = await prisma.posRestaurantLink.findFirst({ where: { OR: [{ restaurantId }, { externalRestId }] } });
    if (clash) throw new ValidationError(clash.restaurantId === restaurantId ? 'This restaurant is already linked' : 'That restID is already linked to another restaurant');
    const link = await prisma.posRestaurantLink.create({
        data: {
            restaurantId,
            externalRestId,
            syncMenu: req.body?.syncMenu !== false,
            pushOrders: req.body?.pushOrders !== false,
            enabled: req.body?.enabled !== false,
        },
    });
    await logPosEvent({ restaurantId, direction: 'out', type: 'link', ok: true, message: `Linked to Petpooja restID ${externalRestId}` });
    sendResponse(res, 201, 'Restaurant linked', { link: (await serializeLinks({ id: link.id }))[0] });
});

export const updateLink = wrap(async (req, res) => {
    const link = await prisma.posRestaurantLink.findUnique({ where: { id: String(req.params.id) } });
    if (!link) throw new NotFoundError('Link not found');
    const data = {};
    for (const k of ['enabled', 'syncMenu', 'pushOrders']) if (req.body?.[k] !== undefined) data[k] = Boolean(req.body[k]);
    if (req.body?.externalRestId !== undefined) {
        const ext = cleanRestId(req.body.externalRestId);
        if (!ext) throw new ValidationError('restID cannot be empty');
        const clash = await prisma.posRestaurantLink.findFirst({ where: { externalRestId: ext, NOT: { id: link.id } } });
        if (clash) throw new ValidationError('That restID is already linked to another restaurant');
        data.externalRestId = ext;
    }
    await prisma.posRestaurantLink.update({ where: { id: link.id }, data });
    sendResponse(res, 200, 'Link updated', { link: (await serializeLinks({ id: link.id }))[0] });
});

export const deleteLink = wrap(async (req, res) => {
    const link = await prisma.posRestaurantLink.findUnique({ where: { id: String(req.params.id) } });
    if (!link) throw new NotFoundError('Link not found');
    // The menu and id map stay, so relinking later updates the same dishes.
    await prisma.posRestaurantLink.delete({ where: { id: link.id } });
    await logPosEvent({ restaurantId: link.restaurantId, direction: 'out', type: 'link', ok: true, message: 'Unlinked from Petpooja' });
    sendResponse(res, 200, 'Restaurant unlinked', { deleted: true });
});

async function recordSync(link, ok, note) {
    await prisma.posRestaurantLink.update({
        where: { id: link.id },
        data: { lastMenuSyncAt: new Date(), lastMenuSyncStatus: ok ? 'ok' : 'error', lastMenuSyncNote: String(note).slice(0, 300) },
    });
}

const summaryNote = (s) => `${s.categories} categories, ${s.items} dishes, ${s.variants} sizes, ${s.addons} add-ons${s.switchedOff ? `, ${s.switchedOff} switched off` : ''}${s.skipped.length ? `, ${s.skipped.length} skipped` : ''}`;

/** Pull the menu from Petpooja's Fetch Menu API now. */
export const syncMenuNow = wrap(async (req, res) => {
    const link = await prisma.posRestaurantLink.findUnique({ where: { id: String(req.params.id) } });
    if (!link) throw new NotFoundError('Link not found');
    const cfg = await loadConfig();
    if (!cfg.appKey || !cfg.appSecret || !cfg.accessToken) throw new ValidationError('Add the Petpooja keys in settings first');
    const result = await callPetpooja(
        cfg.fetchMenuUrl,
        { restID: link.externalRestId },
        { headers: { 'app-key': cfg.appKey, 'app-secret': cfg.appSecret, 'access-token': cfg.accessToken }, timeoutMs: 30000 },
    );
    if (!result.ok) {
        await recordSync(link, false, result.error);
        await logPosEvent({ restaurantId: link.restaurantId, direction: 'out', type: 'fetch_menu', ok: false, message: result.error, payload: { response: result.data } });
        throw new ValidationError(`Petpooja did not return the menu: ${result.error}`);
    }
    const summary = await applyMenu(link.restaurantId, normalizeMenu(result.data));
    await recordSync(link, true, summaryNote(summary));
    await logPosEvent({ restaurantId: link.restaurantId, direction: 'out', type: 'fetch_menu', ok: true, message: summaryNote(summary), payload: { summary } });
    sendResponse(res, 200, 'Menu synced', { summary });
});

/** Apply a menu JSON pasted by the admin (Petpooja's sample or an export). Handy before live keys exist. */
export const importMenu = wrap(async (req, res) => {
    const link = await prisma.posRestaurantLink.findUnique({ where: { id: String(req.params.id) } });
    if (!link) throw new NotFoundError('Link not found');
    let payload = req.body?.menu;
    if (typeof payload === 'string') {
        try {
            payload = JSON.parse(payload);
        } catch {
            throw new ValidationError('That is not valid JSON');
        }
    }
    if (!payload || typeof payload !== 'object') throw new ValidationError('Paste the Petpooja menu JSON');
    const menu = normalizeMenu(payload);
    if (!menu.items.length) throw new ValidationError('No dishes found. Is this a Petpooja menu (with "items" and "categories")?');
    const summary = await applyMenu(link.restaurantId, menu);
    await recordSync(link, true, `Imported: ${summaryNote(summary)}`);
    await logPosEvent({ restaurantId: link.restaurantId, direction: 'in', type: 'menu_import', ok: true, message: summaryNote(summary), payload: { summary } });
    sendResponse(res, 200, 'Menu imported', { summary });
});

// ----- Orders sent to Petpooja -----

export const listOrders = wrap(async (req, res) => {
    const where = {};
    if (['pending', 'sent', 'failed', 'cancelled'].includes(req.query.status)) where.pushStatus = req.query.status;
    if (isId(String(req.query.restaurantId || ''))) where.restaurantId = String(req.query.restaurantId);
    const rows = await prisma.posOrderLink.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
    const orders = await prisma.foodOrder.findMany({
        where: { id: { in: rows.map((r) => r.orderId) } },
        select: { id: true, order_id: true, orderStatus: true, total: true, createdAt: true, restaurant: { select: { restaurantName: true } } },
    });
    const byId = new Map(orders.map((o) => [o.id, o]));
    sendResponse(res, 200, 'Orders sent to Petpooja', {
        orders: rows.map((r) => {
            const o = byId.get(r.orderId);
            return {
                orderId: r.orderId,
                displayId: o?.order_id || r.orderId,
                restaurantName: o?.restaurant?.restaurantName || '',
                orderStatus: o?.orderStatus || '',
                total: o ? Number(o.total) : 0,
                pushStatus: r.pushStatus,
                posStatus: r.posStatus,
                externalOrderId: r.externalOrderId,
                attempts: r.attempts,
                lastError: r.lastError,
                createdAt: r.createdAt,
                sentAt: r.sentAt,
            };
        }),
    });
});

export const retryOrder = wrap(async (req, res) => {
    const orderId = String(req.params.orderId || '');
    if (!isId(orderId)) throw new ValidationError('Invalid order id');
    const result = await pushOrderToPetpooja(orderId, { manual: true });
    if (result.skipped) throw new ValidationError(result.error || 'This restaurant does not send orders to Petpooja');
    if (!result.ok) throw new ValidationError(`Petpooja did not accept the order: ${result.error}`);
    sendResponse(res, 200, 'Order sent to Petpooja', result);
});

// ----- Activity -----

export const listLogs = wrap(async (req, res) => {
    const where = {};
    if (req.query.ok === 'false') where.ok = false;
    if (isId(String(req.query.restaurantId || ''))) where.restaurantId = String(req.query.restaurantId);
    if (req.query.type) where.type = String(req.query.type).slice(0, 40);
    const take = Math.min(Number.parseInt(req.query.limit, 10) || 50, 200);
    const logs = await prisma.posEventLog.findMany({ where, orderBy: { createdAt: 'desc' }, take });
    sendResponse(res, 200, 'Petpooja activity', { logs });
});
