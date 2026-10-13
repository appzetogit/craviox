import { prisma } from '../../../config/prisma.js';
import { logger } from '../../../utils/logger.js';
import { notifyAdminsSafely } from '../../../core/notifications/firebase.service.js';
import { loadConfig, callPetpooja, credentials } from './petpooja.config.js';
import { logPosEvent } from './petpooja.log.js';

/**
 * Orders between Craviox and Petpooja.
 *
 *   pushOrderToPetpooja     new order → Petpooja "Save Order"
 *   cancelOrderInPetpooja   we cancelled → Petpooja "Update Order Status" (-1)
 *   handleOrderCallback     Petpooja tells us accepted / food ready / rejected
 *
 * Craviox's own riders deliver, so Petpooja's "dispatched" and "delivered"
 * codes are recorded but do not move the order.
 */

const RETRY_DELAYS_MS = [0, 5000, 20000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const money = (v) => Number(Number(v || 0).toFixed(2));

/** "2026-10-13" and "14:05:00" in India time, as Petpooja expects. */
function istParts(date = new Date()) {
    const f = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}` };
}

async function activeLink(restaurantId) {
    const link = await prisma.posRestaurantLink.findUnique({ where: { restaurantId } });
    return link?.enabled ? link : null;
}

function callbackUrl(cfg) {
    const base = String(process.env.PUBLIC_API_URL || 'https://craviox.com/api/v1').replace(/\/$/, '');
    return `${base}/integrations/petpooja/order-status?token=${cfg.webhookToken}`;
}

/** Craviox order → Petpooja Save Order body. Throws if a dish is not linked yet. */
export async function buildSaveOrderBody(order, link, restaurant, cfg) {
    const maps = await prisma.posEntityMap.findMany({ where: { restaurantId: order.restaurantId } });
    const extOf = {};
    for (const m of maps) extOf[`${m.kind}:${m.localId}`] = m.externalId;
    const groupOfAddon = Object.fromEntries(maps.filter((m) => m.kind === 'addon_group').map((m) => [m.externalId, m.localId]));
    const addonNames = new Map(
        (await prisma.foodAddon.findMany({ where: { restaurantId: order.restaurantId }, select: { id: true, groupName: true } })).map((a) => [a.id, a.groupName]),
    );

    const addonLine = (a, qty = 1) => {
        const ext = extOf[`addon:${a.addonId || a.itemId}`];
        if (!ext) throw new Error(`Add-on "${a.name}" is not linked to Petpooja. Sync the menu first.`);
        return {
            id: ext,
            name: a.name,
            group_name: addonNames.get(a.addonId || a.itemId) || 'Add-ons',
            price: String(money(a.price)),
            group_id: groupOfAddon[ext] || '',
            quantity: String(qty),
        };
    };

    const lines = [];
    for (const it of order.items) {
        const qty = Number(it.quantity) || 1;
        // A standalone add-on line rides on the dish before it.
        if (extOf[`addon:${it.itemId}`] && !extOf[`item:${it.itemId}`]) {
            const host = lines[lines.length - 1];
            if (!host) throw new Error(`Add-on "${it.name}" has no dish to attach to`);
            host.AddonItem.details.push(addonLine({ itemId: it.itemId, name: it.name, price: it.price }, qty));
            continue;
        }
        const ext = extOf[`item:${it.itemId}`];
        if (!ext) throw new Error(`"${it.name}" is not linked to Petpooja. Sync the menu first.`);
        const addons = Array.isArray(it.addons) ? it.addons : [];
        const addonTotal = addons.reduce((sum, a) => sum + Number(a.price || 0), 0);
        const unit = money(Number(it.price) - addonTotal);
        const variationId = it.variantId ? extOf[`variant:${it.variantId}`] || '' : '';
        lines.push({
            id: ext,
            name: it.name,
            gst_liability: 'vendor',
            item_tax: [],
            item_discount: '0',
            price: String(unit),
            final_price: String(money(unit * qty)),
            quantity: String(qty),
            description: it.notes || '',
            variation_name: it.variantName || '',
            variation_id: variationId,
            AddonItem: { details: addons.map((a) => addonLine(a)) },
        });
    }

    const placed = istParts(order.scheduledAt || order.createdAt || new Date());
    const created = istParts(order.createdAt || new Date());
    const isCash = order.paymentMethod === 'cash' || order.paymentMethod === 'razorpay_qr';
    const discount = money(Number(order.discount || 0) + Number(order.membershipDiscount || 0));
    const address = [order.addrStreet, order.addrAdditionalDetails, order.addrCity, order.addrState, order.addrZipCode].filter(Boolean).join(', ');

    return {
        ...credentials(cfg),
        orderinfo: {
            OrderInfo: {
                Restaurant: {
                    details: {
                        res_name: restaurant.restaurantName,
                        address: restaurant.formattedAddress || [restaurant.addressLine1, restaurant.city].filter(Boolean).join(', '),
                        contact_information: restaurant.ownerPhone || '',
                        restID: link.externalRestId,
                    },
                },
                Customer: {
                    details: {
                        email: '',
                        name: order.customerName || order.addrFullName || 'Customer',
                        address,
                        phone: order.customerPhone || order.addrPhone || '',
                        latitude: order.addrLat != null ? String(order.addrLat) : '',
                        longitude: order.addrLng != null ? String(order.addrLng) : '',
                    },
                },
                Order: {
                    details: {
                        orderID: order.order_id || order.id,
                        preorder_date: placed.date,
                        preorder_time: placed.time,
                        service_charge: '0',
                        sc_tax_amount: '0',
                        delivery_charges: String(money(order.deliveryFee)),
                        dc_tax_amount: String(money(order.deliveryFeeGst)),
                        dc_gst_details: [],
                        packing_charges: String(money(order.packagingFee)),
                        pc_tax_amount: '0',
                        pc_gst_details: [],
                        order_type: 'H',
                        ondc_bap: '',
                        advanced_order: order.scheduledAt ? 'Y' : 'N',
                        urgent_order: false,
                        urgent_time: 20,
                        payment_type: isCash ? 'COD' : 'ONLINE',
                        table_no: '',
                        no_of_persons: '0',
                        discount_total: String(discount),
                        tax_total: String(money(order.tax)),
                        discount_type: 'F',
                        total: String(money(order.total)),
                        description: [order.note, order.deliveryInstructions, order.sendCutlery === false ? 'No cutlery' : ''].filter(Boolean).join(' · '),
                        created_on: `${created.date} ${created.time}`,
                        // 0 = the platform (Craviox) delivers, not the restaurant.
                        enable_delivery: 0,
                        min_prep_time: 20,
                        callback_url: callbackUrl(cfg),
                        collect_cash: isCash ? String(money(order.paymentAmountDue ?? order.total)) : '0',
                        otp: '',
                    },
                },
                OrderItem: { details: lines },
                Tax: { details: [] },
                Discount: {
                    details: discount > 0 ? [{ id: '1', title: order.couponCode || 'Discount', type: 'F', price: String(discount) }] : [],
                },
            },
        },
        udid: '',
        device_type: 'Web',
    };
}

/** Sends a new order to the restaurant's Petpooja. Safe to call more than once. */
export async function pushOrderToPetpooja(orderId, { manual = false } = {}) {
    const order = await prisma.foodOrder.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) return { ok: false, error: 'Order not found' };
    const link = await activeLink(order.restaurantId);
    if (!link || !link.pushOrders) return { ok: false, skipped: true };
    const cfg = await loadConfig();
    if (!cfg.enabled) return { ok: false, skipped: true, error: 'Petpooja is turned off in Admin → Petpooja' };

    const existing = await prisma.posOrderLink.findUnique({ where: { orderId } });
    if (existing?.pushStatus === 'sent') return { ok: true, already: true };
    await prisma.posOrderLink.upsert({
        where: { orderId },
        create: { orderId, restaurantId: order.restaurantId },
        update: { pushStatus: 'pending', lastError: '' },
    });

    const restaurant = await prisma.foodRestaurant.findUnique({ where: { id: order.restaurantId } });
    let body;
    try {
        body = await buildSaveOrderBody(order, link, restaurant, cfg);
    } catch (err) {
        return failPush(order, err.message, 0);
    }

    const delays = manual ? [0] : RETRY_DELAYS_MS;
    let last = null;
    for (let i = 0; i < delays.length; i += 1) {
        if (delays[i]) await sleep(delays[i]);
        last = await callPetpooja(cfg.saveOrderUrl, body);
        await prisma.posOrderLink.update({ where: { orderId }, data: { attempts: { increment: 1 } } });
        await logPosEvent({
            restaurantId: order.restaurantId, orderId, direction: 'out', type: 'save_order', ok: last.ok,
            message: last.ok ? `Order ${order.order_id} sent` : `Attempt ${i + 1}: ${last.error}`,
            payload: { request: body, response: last.data },
        });
        if (last.ok) {
            await prisma.posOrderLink.update({
                where: { orderId },
                data: {
                    pushStatus: 'sent',
                    sentAt: new Date(),
                    lastError: '',
                    externalOrderId: String(last.data?.orderID || last.data?.orderId || last.data?.order_id || '').slice(0, 64),
                },
            });
            return { ok: true };
        }
    }
    return failPush(order, last?.error || 'Unknown error', 0);
}

async function failPush(order, error, attemptsDelta) {
    await prisma.posOrderLink.update({
        where: { orderId: order.id },
        data: { pushStatus: 'failed', lastError: String(error).slice(0, 300), ...(attemptsDelta ? { attempts: { increment: attemptsDelta } } : {}) },
    });
    await logPosEvent({ restaurantId: order.restaurantId, orderId: order.id, direction: 'out', type: 'save_order', ok: false, message: error });
    logger.warn(`[Petpooja] order ${order.order_id} not sent: ${error}`);
    // The restaurant still sees the order in Craviox; admins should know the POS did not.
    notifyAdminsSafely({
        title: 'Order not sent to Petpooja',
        body: `Order ${order.order_id}: ${error}. The restaurant can still accept it in Craviox. Retry from Admin → Petpooja.`,
        data: { type: 'pos_push_failed', orderId: order.id },
    }).catch(() => {});
    return { ok: false, error };
}

/** We cancelled an order that Petpooja already has. */
export async function cancelOrderInPetpooja(orderId, reason = '') {
    const pushed = await prisma.posOrderLink.findUnique({ where: { orderId } });
    if (!pushed || pushed.pushStatus !== 'sent') return { ok: false, skipped: true };
    const link = await activeLink(pushed.restaurantId);
    const cfg = await loadConfig();
    if (!link || !cfg.enabled) return { ok: false, skipped: true };
    const order = await prisma.foodOrder.findUnique({ where: { id: orderId }, select: { order_id: true } });

    const body = {
        ...credentials(cfg),
        restID: link.externalRestId,
        orderID: pushed.externalOrderId || order?.order_id || orderId,
        clientorderID: order?.order_id || orderId,
        cancelReason: String(reason || 'Cancelled').slice(0, 200),
        status: '-1',
    };
    const res = await callPetpooja(cfg.updateOrderStatusUrl, body);
    await logPosEvent({
        restaurantId: pushed.restaurantId, orderId, direction: 'out', type: 'cancel_order', ok: res.ok,
        message: res.ok ? 'Cancellation sent' : res.error, payload: { request: body, response: res.data },
    });
    if (res.ok) await prisma.posOrderLink.update({ where: { orderId }, data: { pushStatus: 'cancelled', posStatus: '-1' } });
    return res;
}

/** Petpooja status code → Craviox order status (null = record only). */
export function statusForCode(code) {
    const c = String(code ?? '').trim();
    if (c === '-1') return 'cancelled_by_restaurant';
    if (['1', '2', '3'].includes(c)) return 'confirmed';
    if (c === '5') return 'ready_for_pickup';
    return null;
}

/** Petpooja → us: an order changed at the outlet. */
export async function handleOrderCallback(body = {}) {
    const restId = String(body.restID ?? body.restId ?? '').trim();
    const theirId = String(body.orderID ?? body.orderId ?? '').trim();
    const ourRef = String(body.clientorderID ?? body.clientOrderID ?? '').trim();
    const code = String(body.status ?? '').trim();

    const link = restId ? await prisma.posRestaurantLink.findUnique({ where: { externalRestId: restId } }) : null;
    if (!link) return { ok: false, message: `Unknown restID ${restId}` };

    // Find the order by the id we sent (display id), our internal id, or Petpooja's own id.
    const refs = [ourRef, theirId].filter(Boolean);
    let order = refs.length
        ? await prisma.foodOrder.findFirst({ where: { restaurantId: link.restaurantId, OR: [{ order_id: { in: refs } }, { id: { in: refs.filter((r) => /^[a-f0-9]{24}$/.test(r)) } }] } })
        : null;
    if (!order && theirId) {
        const pushed = await prisma.posOrderLink.findFirst({ where: { restaurantId: link.restaurantId, externalOrderId: theirId } });
        if (pushed) order = await prisma.foodOrder.findUnique({ where: { id: pushed.orderId } });
    }
    if (!order) return { ok: false, message: `Order ${ourRef || theirId} not found`, restaurantId: link.restaurantId };

    await prisma.posOrderLink.updateMany({ where: { orderId: order.id }, data: { posStatus: code } });

    const target = statusForCode(code);
    if (!target) return { ok: true, message: `Status ${code} recorded`, restaurantId: link.restaurantId, orderId: order.id };
    if (order.orderStatus === target) return { ok: true, message: 'Already in that status', restaurantId: link.restaurantId, orderId: order.id };

    const notes = [];
    if (body.cancel_reason) notes.push(String(body.cancel_reason).slice(0, 200));
    const prep = Number(body.minimum_prep_time);
    if (target === 'confirmed' && prep > 0) notes.push(`Ready in about ${prep} min (Petpooja)`);

    // Lazy import: the order service imports this module's caller chain.
    const { updateOrderStatusRestaurant } = await import('../../food/orders/services/order.service.js');
    try {
        await updateOrderStatusRestaurant(order.id, link.restaurantId, target, notes.join(' · ') || 'Updated from Petpooja');
        return { ok: true, message: `Order ${order.order_id} → ${target}`, restaurantId: link.restaurantId, orderId: order.id };
    } catch (err) {
        // e.g. the restaurant already accepted in Craviox, or the order was cancelled.
        return { ok: false, message: `Not applied: ${err?.message || err}`, restaurantId: link.restaurantId, orderId: order.id, soft: true };
    }
}
