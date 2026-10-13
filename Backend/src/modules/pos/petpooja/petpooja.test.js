import test from 'node:test';
import assert from 'node:assert/strict';

import { prisma } from '../../../config/prisma.js';
import { uniquePhone, uniqueTag } from '../../../utils/testIds.js';
import { normalizeMenu, applyMenu, setStock } from './petpooja.menu.js';
import { statusForCode, buildSaveOrderBody } from './petpooja.orders.js';
import { tokenMatches } from './petpooja.config.js';

/** A trimmed Petpooja menu payload: two categories, a dish with sizes and an add-on group. */
const sampleMenu = (over = {}) => ({
    success: '1',
    attributes: [
        { attributeid: '1', attribute: 'veg', active: '1' },
        { attributeid: '2', attribute: 'non-veg', active: '1' },
    ],
    categories: [
        { categoryid: 'c1', categoryname: 'Pizzas', active: '1', categoryrank: '1' },
        { categoryid: 'c2', categoryname: 'Drinks', active: '1', categoryrank: '2' },
    ],
    items: [
        {
            itemid: 'i1', itemname: 'Margherita', item_categoryid: 'c1', price: '0', active: '1', in_stock: '2',
            item_attributeid: '1', itemdescription: 'Classic', minimumpreparationtime: '15',
            variation: [
                { id: 'v1', name: 'Regular', price: '199', active: '1', addon: [] },
                { id: 'v2', name: 'Large', price: '299', active: '1', addon: [] },
            ],
            addon: [{ addon_group_id: 'g1', addon_item_selection_min: '0', addon_item_selection_max: '2' }],
        },
        { itemid: 'i2', itemname: 'Chicken Wings', item_categoryid: 'c1', price: '249', active: '1', item_attributeid: '2', variation: [], addon: [] },
        { itemid: 'i3', itemname: 'Cola', item_categoryid: 'c2', price: '60', active: '1', in_stock: '0', item_attributeid: '1', variation: [], addon: [] },
    ],
    addongroups: [
        {
            addongroupid: 'g1', addongroup_name: 'Extra toppings', active: '1', addongroup_rank: '1',
            addongroupitems: [
                { addonitemid: 'a1', addonitem_name: 'Olives', addonitem_price: '30', active: '1', attributes: '1' },
                { addonitemid: 'a2', addonitem_name: 'Jalapeno', addonitem_price: '25', active: '1', attributes: '1' },
            ],
        },
        { addongroupid: 'g9', addongroup_name: 'Unused', active: '1', addongroupitems: [{ addonitemid: 'a9', addonitem_name: 'Nobody', addonitem_price: '5', active: '1', attributes: '1' }] },
    ],
    ...over,
});

let restaurantId;

test.before(async () => {
    const r = await prisma.foodRestaurant.create({
        data: { restaurantName: `Petpooja ${uniqueTag('R')}`, ownerName: 'Owner', ownerPhone: uniquePhone('9'), status: 'approved' },
    });
    restaurantId = r.id;
});

test.after(async () => {
    await prisma.posEntityMap.deleteMany({ where: { restaurantId } });
    await prisma.foodAddon.deleteMany({ where: { restaurantId } });
    await prisma.foodItem.deleteMany({ where: { restaurantId } });
    await prisma.foodCategory.deleteMany({ where: { restaurantId } });
    await prisma.foodRestaurant.delete({ where: { id: restaurantId } });
    await prisma.$disconnect();
});

test('the Petpooja payload is read into a plain menu', () => {
    const m = normalizeMenu(sampleMenu());
    assert.equal(m.categories.length, 2);
    const pizza = m.items.find((i) => i.externalId === 'i1');
    assert.equal(pizza.isVeg, true);
    assert.equal(pizza.variants.length, 2);
    assert.equal(m.items.find((i) => i.externalId === 'i2').isVeg, false);
    assert.equal(m.items.find((i) => i.externalId === 'i3').available, false, 'in_stock 0 is out of stock');
});

test('a sync creates the menu, and a re-sync updates the same rows', async () => {
    const first = await applyMenu(restaurantId, normalizeMenu(sampleMenu()));
    assert.equal(first.items, 3);

    const pizza = await prisma.foodItem.findFirst({ where: { restaurantId, name: 'Margherita' }, include: { variants: true } });
    assert.equal(Number(pizza.price), 199, 'price is the cheapest size');
    assert.equal(pizza.approvalStatus, 'approved');
    assert.equal(pizza.variants.length, 2);

    const toppings = await prisma.foodAddon.findMany({ where: { restaurantId, groupName: 'Extra toppings' } });
    assert.equal(toppings.length, 2);
    assert.deepEqual(toppings[0].foodIds, [pizza.id]);
    const unused = await prisma.foodAddon.findFirst({ where: { restaurantId, groupName: 'Unused' } });
    assert.equal(unused.isAvailable, false, 'a group no dish uses must not become restaurant-wide');

    // Price change and a dish removed in Petpooja.
    const menu = sampleMenu();
    menu.items[0].variation[0].price = '219';
    menu.items = menu.items.filter((i) => i.itemid !== 'i2');
    await applyMenu(restaurantId, normalizeMenu(menu));

    const again = await prisma.foodItem.findFirst({ where: { id: pizza.id }, include: { variants: true } });
    assert.equal(Number(again.price), 219);
    assert.deepEqual(again.variants.map((v) => v.id).sort(), pizza.variants.map((v) => v.id).sort(), 'size ids survive a re-sync');
    assert.equal(await prisma.foodItem.count({ where: { restaurantId } }), 3, 'nothing is duplicated');
    const wings = await prisma.foodItem.findFirst({ where: { restaurantId, name: 'Chicken Wings' } });
    assert.equal(wings.isAvailable, false, 'a dish Petpooja stopped sending is switched off, not deleted');
});

test('stock updates switch dishes off and on', async () => {
    await setStock(restaurantId, { kind: 'item', externalIds: ['i1'], inStock: false });
    assert.equal((await prisma.foodItem.findFirst({ where: { restaurantId, name: 'Margherita' } })).isAvailable, false);
    const back = await setStock(restaurantId, { kind: 'item', externalIds: ['i1', 'nope'], inStock: true });
    assert.deepEqual(back, { updated: 1, unknown: 1 });
});

test('an order is translated with Petpooja ids, sizes and add-ons', async () => {
    const pizza = await prisma.foodItem.findFirst({ where: { restaurantId, name: 'Margherita' }, include: { variants: true } });
    const large = pizza.variants.find((v) => v.name === 'Large');
    const olives = await prisma.foodAddon.findFirst({ where: { restaurantId, groupName: 'Extra toppings', isAvailable: true } });
    const order = {
        id: 'x'.repeat(24), order_id: 'FOD-TEST1', restaurantId, createdAt: new Date('2026-10-13T08:30:00Z'),
        customerName: 'Asha', customerPhone: '9876543210', addrStreet: '12 MG Road', addrCity: 'Jabalpur', addrState: 'MP',
        paymentMethod: 'cash', total: 659, tax: 20, deliveryFee: 30, deliveryFeeGst: 0, packagingFee: 10, discount: 0,
        items: [{ itemId: pizza.id, name: 'Margherita', variantId: large.id, variantName: 'Large', price: 329, quantity: 2, addons: [{ addonId: olives.id, name: 'Olives', price: 30 }] }],
    };
    const body = await buildSaveOrderBody(order, { externalRestId: 'R123' }, { restaurantName: 'Test' }, { appKey: 'k', appSecret: 's', accessToken: 't', webhookToken: 'w' });
    const line = body.orderinfo.OrderInfo.OrderItem.details[0];
    assert.equal(line.id, 'i1');
    assert.equal(line.variation_id, 'v2');
    assert.equal(line.price, '299', 'unit price without add-ons');
    assert.equal(line.final_price, '598');
    assert.equal(line.AddonItem.details[0].group_id, 'g1');
    assert.equal(body.orderinfo.OrderInfo.Order.details.payment_type, 'COD');
    assert.equal(body.orderinfo.OrderInfo.Order.details.preorder_time, '14:00:00', 'India time');

    await assert.rejects(
        buildSaveOrderBody({ ...order, items: [{ itemId: 'y'.repeat(24), name: 'Ghost', price: 10, quantity: 1 }] }, { externalRestId: 'R123' }, {}, { webhookToken: 'w' }),
        /not linked to Petpooja/,
    );
});

test('status codes and the webhook token', () => {
    assert.equal(statusForCode('-1'), 'cancelled_by_restaurant');
    assert.equal(statusForCode('1'), 'confirmed');
    assert.equal(statusForCode('5'), 'ready_for_pickup');
    assert.equal(statusForCode('10'), null, 'our riders deliver, so delivered from the POS is only recorded');
    assert.equal(tokenMatches({ webhookToken: 'abc' }, 'abc'), true);
    assert.equal(tokenMatches({ webhookToken: 'abc' }, 'abd'), false);
    assert.equal(tokenMatches({ webhookToken: '' }, ''), false, 'an empty token never matches');
});
