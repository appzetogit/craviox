import { prisma } from '../../../config/prisma.js';
import { invalidateCache } from '../../../middleware/cache.js';
import { syncFoodVariants } from '../../food/admin/services/foodVariant.service.js';

/**
 * Petpooja menu → Craviox menu.
 *
 * normalizeMenu() is the only place that knows Petpooja's field names (from
 * its Online Ordering "push menu" / "fetch menu" payload). If Petpooja's docs
 * for this account name a field differently, change it here and nothing else.
 *
 * applyMenu() then upserts categories, dishes, sizes (variants) and add-ons,
 * remembering which Petpooja id is which Craviox record in pos_entity_maps,
 * so a re-sync updates rows instead of duplicating them and keeps ids stable
 * for carts and past orders. Anything Petpooja no longer sends is switched
 * off, never deleted.
 */

const s = (v) => (v === undefined || v === null ? '' : String(v).trim());
const num = (v) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};
const isOn = (v) => v === undefined || v === null || v === '' || ['1', 1, true, 'true', 'yes'].includes(v);
const list = (v) => (Array.isArray(v) ? v : []);

/** Petpooja attribute ids → veg / non-veg / egg. */
function attributeMap(payload) {
    const map = {};
    for (const a of list(payload.attributes)) map[s(a.attributeid)] = s(a.attribute).toLowerCase();
    return map;
}

const linkedGroups = (arr) =>
    list(arr)
        .map((g) => ({ groupExternalId: s(g.addon_group_id), min: Math.max(0, Math.trunc(num(g.addon_item_selection_min))), max: Math.trunc(num(g.addon_item_selection_max)) }))
        .filter((g) => g.groupExternalId);

export function normalizeMenu(payload = {}) {
    const attrs = attributeMap(payload);
    const vegOf = (attributeId) => {
        const a = attrs[s(attributeId)] || '';
        return a === 'veg' || a === 'vegetarian';
    };

    const categories = list(payload.categories)
        .map((c) => ({
            externalId: s(c.categoryid),
            name: s(c.categoryname),
            rank: Math.trunc(num(c.categoryrank)),
            active: isOn(c.active),
        }))
        .filter((c) => c.externalId && c.name);

    const items = list(payload.items)
        .map((it) => {
            const variants = list(it.variation)
                .map((v) => ({
                    externalId: s(v.id || v.variationid),
                    name: s(v.name),
                    price: num(v.price),
                    active: isOn(v.active),
                    addonGroups: linkedGroups(v.addon),
                }))
                .filter((v) => v.externalId && v.name);
            return {
                externalId: s(it.itemid),
                name: s(it.itemname),
                description: s(it.itemdescription),
                categoryExternalId: s(it.item_categoryid),
                price: num(it.price),
                isVeg: vegOf(it.item_attributeid),
                image: s(it.item_image_url),
                // in_stock "0" (or false) means switched off at the outlet.
                available: isOn(it.active) && !['0', 0, false, 'false'].includes(it.in_stock),
                prepMinutes: Math.trunc(num(it.minimumpreparationtime)),
                rank: Math.trunc(num(it.itemrank)),
                variants,
                addonGroups: linkedGroups(it.addon),
            };
        })
        .filter((it) => it.externalId && it.name);

    const addonGroups = list(payload.addongroups)
        .map((g) => ({
            externalId: s(g.addongroupid),
            name: s(g.addongroup_name),
            rank: Math.trunc(num(g.addongroup_rank)),
            active: isOn(g.active),
            options: list(g.addongroupitems)
                .map((o) => ({
                    externalId: s(o.addonitemid),
                    name: s(o.addonitem_name),
                    price: num(o.addonitem_price),
                    isVeg: vegOf(o.attributes),
                    active: isOn(o.active),
                }))
                .filter((o) => o.externalId && o.name),
        }))
        .filter((g) => g.externalId);

    return { categories, items, addonGroups };
}

async function loadMap(restaurantId, kind) {
    const rows = await prisma.posEntityMap.findMany({ where: { restaurantId, kind } });
    return new Map(rows.map((r) => [r.externalId, r.localId]));
}

async function remember(restaurantId, kind, externalId, localId) {
    await prisma.posEntityMap.upsert({
        where: { restaurantId_kind_externalId: { restaurantId, kind, externalId } },
        create: { restaurantId, kind, externalId, localId },
        update: { localId },
    });
}

export async function applyMenu(restaurantId, menu) {
    const restaurant = await prisma.foodRestaurant.findUnique({
        where: { id: restaurantId },
        select: { id: true, pureVegRestaurant: true },
    });
    if (!restaurant) throw new Error('Restaurant not found');

    const now = new Date();
    const result = { categories: 0, items: 0, variants: 0, addons: 0, switchedOff: 0, skipped: [] };

    // ── Categories (private to this restaurant, pre-approved: the POS is the source) ──
    const catMap = await loadMap(restaurantId, 'category');
    const catLocal = new Map();
    for (const c of menu.categories) {
        const data = { name: c.name.slice(0, 120), sortOrder: c.rank, isActive: c.active };
        let localId = catMap.get(c.externalId);
        const exists = localId && (await prisma.foodCategory.findUnique({ where: { id: localId }, select: { id: true } }));
        if (exists) {
            await prisma.foodCategory.update({ where: { id: localId }, data });
        } else {
            const created = await prisma.foodCategory.create({
                data: {
                    ...data,
                    restaurantId,
                    createdByRestaurantId: restaurantId,
                    foodTypeScope: restaurant.pureVegRestaurant ? 'Veg' : 'Both',
                    approvalStatus: 'approved',
                    isApproved: true,
                    approvedAt: now,
                },
            });
            localId = created.id;
            await remember(restaurantId, 'category', c.externalId, localId);
        }
        catLocal.set(c.externalId, { id: localId, name: data.name });
        result.categories += 1;
    }
    const sentCats = new Set(menu.categories.map((c) => c.externalId));
    const staleCats = [...catMap.entries()].filter(([ext]) => !sentCats.has(ext)).map(([, id]) => id);
    if (staleCats.length) await prisma.foodCategory.updateMany({ where: { id: { in: staleCats }, restaurantId }, data: { isActive: false } });

    // ── Items and their sizes ──
    const itemMap = await loadMap(restaurantId, 'item');
    const variantMap = await loadMap(restaurantId, 'variant');
    const itemLocal = new Map();
    const groupToItems = new Map();
    const groupLimits = new Map();
    const linkGroup = (g, localItemId) => {
        if (!groupToItems.has(g.groupExternalId)) groupToItems.set(g.groupExternalId, new Set());
        groupToItems.get(g.groupExternalId).add(localItemId);
        if (!groupLimits.has(g.groupExternalId)) groupLimits.set(g.groupExternalId, g);
    };

    for (const it of menu.items) {
        if (restaurant.pureVegRestaurant && !it.isVeg) {
            result.skipped.push(`${it.name}: not veg, but the restaurant is pure veg`);
            continue;
        }
        const cat = catLocal.get(it.categoryExternalId);
        // Duplicate size names would break the (item, name) unique key; prices
        // must be above zero (database check).
        const seen = new Set();
        const variants = it.variants.filter((v) => v.active && v.price > 0 && !seen.has(v.name.toLowerCase()) && seen.add(v.name.toLowerCase()));
        const price = variants.length ? Math.min(...variants.map((v) => v.price)) : it.price;
        if (!(price > 0)) {
            result.skipped.push(`${it.name}: no price above zero`);
            continue;
        }

        const data = {
            name: it.name.slice(0, 200),
            description: it.description.slice(0, 2000),
            price,
            foodType: it.isVeg ? 'Veg' : 'NonVeg',
            isAvailable: it.available,
            categoryId: cat?.id ?? null,
            categoryName: cat?.name ?? '',
            preparationTime: it.prepMinutes > 0 ? `${it.prepMinutes} mins` : '',
            approvalStatus: 'approved',
            rejectionReason: '',
            approvedAt: now,
            ...(it.image ? { image: it.image, images: [it.image] } : {}),
        };

        let localId = itemMap.get(it.externalId);
        const exists = localId && (await prisma.foodItem.findFirst({ where: { id: localId, restaurantId }, select: { id: true } }));

        await prisma.$transaction(async (tx) => {
            if (exists) {
                await tx.foodItem.update({ where: { id: localId }, data });
            } else {
                const created = await tx.foodItem.create({ data: { ...data, restaurantId, images: data.images || [] } });
                localId = created.id;
            }
            const withIds = variants.map((v) => {
                const known = variantMap.get(v.externalId);
                return { id: known || undefined, name: v.name.slice(0, 80), price: v.price, otherPrice: 0 };
            });
            // A remembered size that was deleted by hand would make the update fail; drop its id.
            if (withIds.some((v) => v.id)) {
                const present = new Set((await tx.foodItemVariant.findMany({ where: { foodItemId: localId }, select: { id: true } })).map((r) => r.id));
                for (const v of withIds) if (v.id && !present.has(v.id)) v.id = undefined;
            }
            await syncFoodVariants(tx, localId, withIds);
        });
        if (!exists) await remember(restaurantId, 'item', it.externalId, localId);

        if (variants.length) {
            const rows = await prisma.foodItemVariant.findMany({ where: { foodItemId: localId }, select: { id: true, name: true } });
            const byName = new Map(rows.map((r) => [r.name.toLowerCase(), r.id]));
            for (const v of variants) {
                const vid = byName.get(v.name.slice(0, 80).toLowerCase());
                if (vid) await remember(restaurantId, 'variant', v.externalId, vid);
            }
            result.variants += variants.length;
        }

        itemLocal.set(it.externalId, localId);
        for (const g of it.addonGroups) linkGroup(g, localId);
        for (const v of it.variants) for (const g of v.addonGroups) linkGroup(g, localId);
        result.items += 1;
    }

    const sentItems = new Set(itemLocal.keys());
    const staleItems = [...itemMap.entries()].filter(([ext]) => !sentItems.has(ext)).map(([, id]) => id);
    if (staleItems.length) {
        const { count } = await prisma.foodItem.updateMany({ where: { id: { in: staleItems }, restaurantId }, data: { isAvailable: false } });
        result.switchedOff += count;
    }

    // ── Add-ons: one Craviox add-on row per Petpooja add-on option ──
    const addonMap = await loadMap(restaurantId, 'addon');
    const sentAddons = new Set();
    for (const g of menu.addonGroups) {
        const foodIds = [...(groupToItems.get(g.externalId) || [])];
        const limits = groupLimits.get(g.externalId);
        const max = limits?.max > 0 ? limits.max : Math.max(1, g.options.length);
        for (const o of g.options) {
            sentAddons.add(o.externalId);
            const content = {
                name: o.name.slice(0, 120),
                description: '',
                foodType: o.isVeg ? 'veg' : 'non-veg',
                price: o.price,
                image: '',
                images: [],
            };
            const data = {
                foodIds,
                groupName: g.name.slice(0, 80),
                groupMinSelect: Math.min(limits?.min || 0, max),
                groupMaxSelect: max,
                groupSortOrder: g.rank,
                draft: content,
                published: content,
                approvalStatus: 'approved',
                approvedAt: now,
                rejectionReason: '',
                // An empty foodIds list means "every dish" in Craviox, so a
                // group no dish uses is hidden rather than shown everywhere.
                isAvailable: g.active && o.active && foodIds.length > 0,
                isDeleted: false,
            };
            let localId = addonMap.get(o.externalId);
            const exists = localId && (await prisma.foodAddon.findFirst({ where: { id: localId, restaurantId }, select: { id: true } }));
            if (exists) {
                await prisma.foodAddon.update({ where: { id: localId }, data });
            } else {
                const created = await prisma.foodAddon.create({ data: { ...data, restaurantId } });
                localId = created.id;
                await remember(restaurantId, 'addon', o.externalId, localId);
            }
            // Orders sent to Petpooja must name each add-on's group. Stored the
            // other way round from the rest: externalId is the option, localId
            // is the Petpooja group id.
            await remember(restaurantId, 'addon_group', o.externalId, g.externalId.slice(0, 24));
            result.addons += 1;
        }
    }
    const staleAddons = [...addonMap.entries()].filter(([ext]) => !sentAddons.has(ext)).map(([, id]) => id);
    if (staleAddons.length) {
        await prisma.foodAddon.updateMany({ where: { id: { in: staleAddons }, restaurantId }, data: { isAvailable: false } });
    }

    await invalidateMenuCaches();
    return result;
}

export async function invalidateMenuCaches() {
    await Promise.all(
        ['restaurant_menu:*', 'public_foods:*', 'restaurant_addons:*', 'categories:*'].map((p) => invalidateCache(p).catch(() => {})),
    );
}

/** Stock on/off from the outlet: Petpooja item or add-on ids → Craviox rows. */
export async function setStock(restaurantId, { kind, externalIds, inStock, resumeAt = null }) {
    const map = await loadMap(restaurantId, kind === 'addon' ? 'addon' : 'item');
    const ids = externalIds.map((x) => map.get(String(x))).filter(Boolean);
    if (!ids.length) return { updated: 0, unknown: externalIds.length };
    let updated = 0;
    if (kind === 'addon') {
        ({ count: updated } = await prisma.foodAddon.updateMany({ where: { id: { in: ids }, restaurantId }, data: { isAvailable: Boolean(inStock) } }));
    } else {
        ({ count: updated } = await prisma.foodItem.updateMany({
            where: { id: { in: ids }, restaurantId },
            data: inStock
                ? { isAvailable: true, stockResumeAt: null, stockOffMode: null }
                : { isAvailable: false, stockResumeAt: resumeAt, stockOffMode: resumeAt ? 'custom_date_time' : 'manual' },
        }));
    }
    await invalidateMenuCaches();
    return { updated, unknown: externalIds.length - ids.length };
}
