/**
 * Seeds a browsable Craviox demo: an Indore delivery zone, home categories,
 * hero banners, and approved restaurants with full menus -- all with images.
 *
 * Photos come from TheMealDB (free food image API) and are downloaded into
 * UPLOAD_STORAGE_ROOT/seed, so they are served by nginx like any upload rather
 * than hotlinked. Restaurants are built through the same mapper helpers as
 * seed-demo-restaurant.mjs, so name search and PostGIS radius queries see them.
 *
 * Idempotent: zone, categories and banners match on name/publicId, restaurants
 * on (normalized name, owner phone), items on (restaurant, name).
 *
 *   node scripts/seed-craviox-demo.mjs
 */
import 'dotenv/config';
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../src/config/prisma.js';
import { deriveRestaurantFields, fromRestaurantLocation } from '../src/modules/food/restaurant/restaurant.mapper.js';

const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_STORAGE_ROOT || 'uploads');
const SEED_DIR = path.join(UPLOAD_ROOT, 'seed');
const MEALDB = 'https://www.themealdb.com/api/json/v1/1';

// ── Images ─────────────────────────────────────────────────────────────────
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const categoryPools = new Map();
let poolCursor = 0;

const getJson = async (url) => {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
};

/** A thumbnail URL for a dish: exact search first, then a pick from a MealDB category. */
const findPhoto = async (term, fallbackCategory) => {
    const hit = await getJson(`${MEALDB}/search.php?s=${encodeURIComponent(term)}`);
    if (hit?.meals?.[0]?.strMealThumb) return hit.meals[0].strMealThumb;

    if (!categoryPools.has(fallbackCategory)) {
        const list = await getJson(`${MEALDB}/filter.php?c=${encodeURIComponent(fallbackCategory)}`);
        categoryPools.set(fallbackCategory, (list?.meals || []).map((m) => m.strMealThumb));
    }
    const pool = categoryPools.get(fallbackCategory);
    return pool.length ? pool[poolCursor++ % pool.length] : null;
};

/** Downloads once into uploads/seed and returns the public /uploads path ('' on failure). */
const image = async (key, term, fallbackCategory = 'Miscellaneous') => {
    const file = `${slug(key)}.jpg`;
    const target = path.join(SEED_DIR, file);
    const publicPath = `/uploads/seed/${file}`;
    try {
        await access(target);
        return publicPath;
    } catch { /* not downloaded yet */ }

    const url = await findPhoto(term, fallbackCategory);
    if (!url) return '';
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) return '';
        await writeFile(target, Buffer.from(await res.arrayBuffer()));
        return publicPath;
    } catch {
        return '';
    }
};

await mkdir(SEED_DIR, { recursive: true });

// ── Zone ───────────────────────────────────────────────────────────────────
// Covers greater Indore; restaurants and customers outside every zone see nothing.
const ZONE_NAME = 'Indore';
const ring = [
    { latitude: 22.60, longitude: 75.74 },
    { latitude: 22.60, longitude: 76.00 },
    { latitude: 22.86, longitude: 76.00 },
    { latitude: 22.86, longitude: 75.74 },
];
const zoneData = { name: ZONE_NAME, zoneName: ZONE_NAME, serviceLocation: 'Indore, Madhya Pradesh', coordinates: ring, isActive: true };
// An earlier run of this script seeded Hyderabad; that row becomes the Indore zone.
const existingZone = await prisma.foodZone.findFirst({ where: { name: { in: [ZONE_NAME, 'Hyderabad'] } } });
const zone = existingZone
    ? await prisma.foodZone.update({ where: { id: existingZone.id }, data: zoneData })
    : await prisma.foodZone.create({ data: zoneData });
console.log(`zone: ${zone.name} (${zone.id})`);

// ── Home categories (global) ───────────────────────────────────────────────
const HOME_CATEGORIES = [
    ['Biryani', 'Lamb Biryani', 'Lamb'],
    ['North Indian', 'Butter Chicken', 'Chicken'],
    ['South Indian', 'Dosa', 'Vegetarian'],
    ['Pizza', 'Pizza Express Margherita', 'Vegetarian'],
    ['Burgers', 'Burger', 'Beef'],
    ['Chinese', 'Kung Pao Chicken', 'Chicken'],
    ['Desserts', 'Chocolate Gateau', 'Dessert'],
    ['Seafood', 'Fish pie', 'Seafood'],
    ['Pasta', 'Spaghetti Bolognese', 'Pasta'],
    ['Healthy', 'Vegan Chocolate Cake', 'Vegan'],
];
for (const [i, [name, term, fallback]] of HOME_CATEGORIES.entries()) {
    const img = await image(`category-${name}`, term, fallback);
    const existing = await prisma.foodCategory.findFirst({ where: { name, restaurantId: null } });
    const data = { name, image: img, isApproved: true, approvalStatus: 'approved', isActive: true, sortOrder: i };
    if (existing) await prisma.foodCategory.update({ where: { id: existing.id }, data });
    else await prisma.foodCategory.create({ data });
}
console.log(`home categories: ${HOME_CATEGORIES.length}`);

// ── Restaurants ────────────────────────────────────────────────────────────
// [dish, price, Veg|NonVeg, description, mealdb search term, mealdb fallback category]
const RESTAURANTS = [
    {
        name: 'Paradise Biryani House', phone: '9000000101', area: 'Rajwada', lat: 22.7186, lng: 75.8553, pincode: '452002',
        cuisines: ['Biryani', 'Mughlai'], veg: false, rating: 4.5, ratings: 2140, eta: '30-35 mins',
        cover: ['Lamb Biryani', 'Lamb'],
        menu: {
            Biryani: [
                ['Chicken Dum Biryani', 320, 'NonVeg', 'Slow-cooked basmati and chicken sealed with dough, served with raita and salan.', 'Chicken Biryani', 'Chicken'],
                ['Mutton Dum Biryani', 420, 'NonVeg', 'Tender mutton layered with saffron rice and fried onions.', 'Lamb Biryani', 'Lamb'],
                ['Veg Dum Biryani', 260, 'Veg', 'Seasonal vegetables and paneer in fragrant dum rice.', 'Vegetable Biryani', 'Vegetarian'],
            ],
            Starters: [
                ['Chicken 65', 280, 'NonVeg', 'Spicy, crisp fried chicken tossed with curry leaves.', 'Chicken 65', 'Chicken'],
                ['Tandoori Chicken (Half)', 300, 'NonVeg', 'Charred in the tandoor with yoghurt and spices.', 'Tandoori chicken', 'Chicken'],
            ],
            Desserts: [
                ['Double Ka Meetha', 120, 'Veg', 'Bread pudding with dry fruits.', 'Bread and Butter Pudding', 'Dessert'],
            ],
        },
    },
    {
        name: 'Punjab Da Dhaba', phone: '9000000102', area: 'Palasia', lat: 22.7244, lng: 75.8839, pincode: '452001',
        cuisines: ['North Indian', 'Punjabi'], veg: false, rating: 4.3, ratings: 860, eta: '25-30 mins',
        cover: ['Butter Chicken', 'Chicken'],
        menu: {
            'Main Course': [
                ['Butter Chicken', 360, 'NonVeg', 'Tandoori chicken in a silky tomato-butter gravy.', 'Butter Chicken', 'Chicken'],
                ['Paneer Butter Masala', 290, 'Veg', 'Cottage cheese cubes in rich makhani gravy.', 'Matar Paneer', 'Vegetarian'],
                ['Dal Makhani', 240, 'Veg', 'Black lentils simmered overnight with cream.', 'Dal fry', 'Vegetarian'],
                ['Chicken Tikka Masala', 350, 'NonVeg', 'Smoky tikka in a spiced onion-tomato masala.', 'Chicken Tikka Masala', 'Chicken'],
            ],
            Breads: [
                ['Butter Naan', 60, 'Veg', 'Soft tandoor bread brushed with butter.', 'Naan', 'Side'],
                ['Garlic Naan', 75, 'Veg', 'Naan topped with garlic and coriander.', 'Garlic Naan', 'Side'],
            ],
        },
    },
    {
        name: 'Udupi Tiffin Centre', phone: '9000000103', area: 'Sapna Sangeeta', lat: 22.6990, lng: 75.8680, pincode: '452001',
        cuisines: ['South Indian', 'Breakfast'], veg: true, rating: 4.4, ratings: 1320, eta: '20-25 mins',
        cover: ['Dosa', 'Vegetarian'],
        menu: {
            Tiffins: [
                ['Masala Dosa', 110, 'Veg', 'Crisp rice crepe with spiced potato, sambar and chutneys.', 'Dosa', 'Vegetarian'],
                ['Idli Sambar (2 pcs)', 70, 'Veg', 'Steamed rice cakes with sambar and coconut chutney.', 'Idli', 'Vegetarian'],
                ['Medu Vada', 80, 'Veg', 'Crisp lentil fritters.', 'Vada', 'Vegetarian'],
                ['Upma', 75, 'Veg', 'Semolina cooked with vegetables and tempering.', 'Upma', 'Breakfast'],
            ],
            Meals: [
                ['South Indian Thali', 220, 'Veg', 'Rice, sambar, rasam, two curries, curd and sweet.', 'Vegetable Curry', 'Vegetarian'],
            ],
            Beverages: [
                ['Filter Coffee', 50, 'Veg', 'Strong decoction coffee with frothed milk.', 'Coffee', 'Dessert'],
            ],
        },
    },
    {
        name: 'Napoli Wood Fired Pizza', phone: '9000000104', area: 'Vijay Nagar', lat: 22.7533, lng: 75.8937, pincode: '452010',
        cuisines: ['Pizza', 'Italian'], veg: false, rating: 4.6, ratings: 540, eta: '30-40 mins',
        cover: ['Pizza Express Margherita', 'Vegetarian'],
        menu: {
            Pizzas: [
                ['Margherita', 349, 'Veg', 'San Marzano tomato, fior di latte and basil.', 'Pizza Express Margherita', 'Vegetarian'],
                ['Pepperoni', 449, 'NonVeg', 'Loaded chicken pepperoni with mozzarella.', 'Pepperoni Pizza', 'Pork'],
                ['Farmhouse Veggie', 399, 'Veg', 'Peppers, onion, olives, mushroom and corn.', 'Vegetarian pizza', 'Vegetarian'],
            ],
            Pasta: [
                ['Penne Arrabbiata', 329, 'Veg', 'Spicy tomato sauce with garlic and chilli.', 'Penne Arrabiata', 'Pasta'],
                ['Spaghetti Bolognese', 379, 'NonVeg', 'Slow-cooked meat ragu.', 'Spaghetti Bolognese', 'Pasta'],
            ],
            Desserts: [
                ['Tiramisu', 249, 'Veg', 'Espresso-soaked sponge with mascarpone.', 'Tiramisu', 'Dessert'],
            ],
        },
    },
    {
        name: 'Burger Barn', phone: '9000000105', area: 'MG Road', lat: 22.7206, lng: 75.8710, pincode: '452001',
        cuisines: ['Burgers', 'American', 'Fast Food'], veg: false, rating: 4.2, ratings: 710, eta: '25-30 mins',
        cover: ['Burger', 'Beef'],
        menu: {
            Burgers: [
                ['Classic Chicken Burger', 219, 'NonVeg', 'Crispy chicken, lettuce, pickles and house mayo.', 'Chicken Burger', 'Chicken'],
                ['Smash Burger', 279, 'NonVeg', 'Double smashed patty with cheese and onions.', 'Burger', 'Beef'],
                ['Crispy Veg Burger', 169, 'Veg', 'Potato-pea patty with tangy sauce.', 'Vegan burger', 'Vegetarian'],
            ],
            Sides: [
                ['Peri Peri Fries', 129, 'Veg', 'Fries tossed in peri peri seasoning.', 'Chips', 'Side'],
                ['Chicken Wings (6 pcs)', 249, 'NonVeg', 'Buffalo-style wings with dip.', 'Chicken Wings', 'Chicken'],
            ],
        },
    },
    {
        name: 'Dragon Wok', phone: '9000000106', area: 'Sudama Nagar', lat: 22.6960, lng: 75.8350, pincode: '452009',
        cuisines: ['Chinese', 'Asian'], veg: false, rating: 4.1, ratings: 430, eta: '30-35 mins',
        cover: ['Kung Pao Chicken', 'Chicken'],
        menu: {
            Mains: [
                ['Kung Pao Chicken', 299, 'NonVeg', 'Wok-tossed chicken with peanuts and dried chillies.', 'Kung Pao Chicken', 'Chicken'],
                ['Chilli Paneer', 259, 'Veg', 'Paneer tossed with peppers in chilli-soy sauce.', 'General Tsos Chicken', 'Vegetarian'],
                ['Sweet and Sour Pork', 339, 'NonVeg', 'Crisp pork in a tangy glaze.', 'Sweet and Sour Pork', 'Pork'],
            ],
            'Rice & Noodles': [
                ['Veg Hakka Noodles', 199, 'Veg', 'Stir-fried noodles with vegetables.', 'Chow mein', 'Vegetarian'],
                ['Chicken Fried Rice', 229, 'NonVeg', 'Wok-fried rice with egg and chicken.', 'Egg Fried Rice', 'Chicken'],
            ],
        },
    },
    {
        name: 'Sweet Tooth Patisserie', phone: '9000000107', area: 'Sarafa Bazaar', lat: 22.7179, lng: 75.8571, pincode: '452002',
        cuisines: ['Desserts', 'Bakery'], veg: true, rating: 4.7, ratings: 380, eta: '20-25 mins',
        cover: ['Chocolate Gateau', 'Dessert'],
        menu: {
            Cakes: [
                ['Chocolate Truffle Cake (500g)', 549, 'Veg', 'Dark chocolate sponge with ganache.', 'Chocolate Gateau', 'Dessert'],
                ['New York Cheesecake', 229, 'Veg', 'Baked vanilla cheesecake slice.', 'Cheesecake', 'Dessert'],
                ['Red Velvet Pastry', 149, 'Veg', 'Cream cheese frosted red velvet.', 'Red Velvet', 'Dessert'],
            ],
            Treats: [
                ['Chocolate Brownie', 129, 'Veg', 'Fudgy brownie with walnuts.', 'Brownies', 'Dessert'],
                ['Apple Pie', 179, 'Veg', 'Buttery crust with cinnamon apples.', 'Apple Frangipan Tart', 'Dessert'],
            ],
        },
    },
    {
        name: 'Coastal Catch', phone: '9000000108', area: 'Nipania', lat: 22.7610, lng: 75.9230, pincode: '452010',
        cuisines: ['Seafood', 'Coastal'], veg: false, rating: 4.3, ratings: 290, eta: '35-40 mins',
        cover: ['Fish pie', 'Seafood'],
        menu: {
            Seafood: [
                ['Andhra Fish Curry', 369, 'NonVeg', 'Tangy tamarind fish curry.', 'Fish Stew', 'Seafood'],
                ['Prawn Fry', 429, 'NonVeg', 'Masala-coated prawns, pan fried.', 'Garlic prawns', 'Seafood'],
                ['Grilled Salmon', 649, 'NonVeg', 'Herb-grilled salmon with vegetables.', 'Salmon', 'Seafood'],
            ],
            Rice: [
                ['Prawn Pulao', 389, 'NonVeg', 'Coastal-spiced rice with prawns.', 'Kedgeree', 'Seafood'],
                ['Steamed Rice', 90, 'Veg', 'Plain steamed rice.', 'Rice', 'Side'],
            ],
        },
    },
];

let itemTotal = 0;
const seededRestaurantIds = [];
for (const r of RESTAURANTS) {
    const [coverTerm, coverFallback] = r.cover;
    const coverImage = await image(`restaurant-${r.name}-cover`, coverTerm, coverFallback);
    const profileImage = await image(`restaurant-${r.name}-logo`, r.cuisines[0], coverFallback);

    const derived = deriveRestaurantFields({ restaurantName: r.name, ownerPhone: r.phone, estimatedDeliveryTime: r.eta });
    const location = fromRestaurantLocation({
        latitude: r.lat,
        longitude: r.lng,
        formattedAddress: `${r.area}, Indore, Madhya Pradesh ${r.pincode}`,
        addressLine1: r.area,
        area: r.area,
        city: 'Indore',
        state: 'Madhya Pradesh',
        pincode: r.pincode,
    });

    const firstDish = Object.values(r.menu)[0][0];
    const data = {
        restaurantName: r.name,
        ownerName: `${r.name} Owner`,
        ownerEmail: `${slug(r.name)}@craviox.com`,
        ownerPhone: r.phone,
        primaryContactNumber: r.phone,
        ...derived,
        ...location,
        zoneId: zone.id,
        cuisines: r.cuisines,
        openingTime: '08:00',
        closingTime: '23:59',
        openDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        pureVegRestaurant: r.veg,
        isAcceptingOrders: true,
        estimatedDeliveryTime: r.eta,
        featuredDish: firstDish[0],
        featuredPrice: firstDish[1],
        rating: r.rating,
        totalRatings: r.ratings,
        profileImage,
        coverImage,
        coverImages: coverImage ? [coverImage] : [],
        status: 'approved',
        approvedAt: new Date(),
    };

    const restaurant = await prisma.foodRestaurant.upsert({
        where: {
            restaurantNameNormalized_ownerPhoneLast10: {
                restaurantNameNormalized: derived.restaurantNameNormalized,
                ownerPhoneLast10: derived.ownerPhoneLast10,
            },
        },
        create: data,
        update: data,
    });
    seededRestaurantIds.push(restaurant.id);

    let count = 0;
    for (const [categoryName, items] of Object.entries(r.menu)) {
        // Global categories: the public home list only shows global ones that
        // have an approved dish, so menus link to those rather than to
        // restaurant-private copies.
        const categoryImage = await image(`category-${categoryName}`, items[0][4], items[0][5]);
        const category = (await prisma.foodCategory.findFirst({ where: { name: categoryName, restaurantId: null } }))
            ?? await prisma.foodCategory.create({
                data: { name: categoryName, image: categoryImage, isApproved: true, approvalStatus: 'approved', isActive: true, sortOrder: 100 },
            });

        for (const [i, [itemName, price, foodType, description, term, fallback]] of items.entries()) {
            const img = await image(`item-${r.name}-${itemName}`, term, fallback);
            const payload = {
                restaurantId: restaurant.id,
                name: itemName,
                description,
                price,
                categoryId: category.id,
                categoryName,
                foodType,
                image: img,
                images: img ? [img] : [],
                isAvailable: true,
                isRecommended: i === 0,
                preparationTime: '15-20 mins',
                approvalStatus: 'approved',
                rating: Math.min(5, Math.round((r.rating - 0.3 + ((i * 7) % 6) / 10) * 10) / 10),
                totalRatings: 40 + ((i * 37) % 200),
            };
            const found = await prisma.foodItem.findFirst({ where: { restaurantId: restaurant.id, name: itemName } });
            if (found) await prisma.foodItem.update({ where: { id: found.id }, data: payload });
            else await prisma.foodItem.create({ data: payload });
            count += 1;
        }
    }
    itemTotal += count;
    console.log(`restaurant: ${r.name} (${restaurant.id}) — ${count} items, cover=${coverImage ? 'yes' : 'NO'}`);
}

// Restaurant-private categories left by earlier runs of this script, now empty.
const { count: removedCategories } = await prisma.foodCategory.deleteMany({
    where: { restaurantId: { in: seededRestaurantIds }, foodItems: { none: {} } },
});
if (removedCategories) console.log(`removed ${removedCategories} empty restaurant-private categories`);

// ── Hero banners ───────────────────────────────────────────────────────────
const BANNERS = [
    ['Biryani Week', 'Order now', 'Lamb Biryani', 'Lamb', [0]],
    ['Pizza Night', 'Explore', 'Pizza Express Margherita', 'Vegetarian', [3]],
    ['Sweet Deals', 'Treat yourself', 'Chocolate Gateau', 'Dessert', [6]],
];
for (const [i, [title, ctaText, term, fallback, idx]] of BANNERS.entries()) {
    const publicId = `seed/banner-${slug(title)}`;
    const imageUrl = await image(`banner-${title}`, term, fallback);
    const data = {
        imageUrl, publicId, title, ctaText, ctaLink: '',
        linkedRestaurantIds: idx.map((n) => seededRestaurantIds[n]).filter(Boolean),
        sortOrder: i, isActive: true,
    };
    const existing = await prisma.foodHeroBanner.findFirst({ where: { publicId } });
    if (existing) await prisma.foodHeroBanner.update({ where: { id: existing.id }, data });
    else await prisma.foodHeroBanner.create({ data });
}

console.log(`done: ${RESTAURANTS.length} restaurants, ${itemTotal} items, ${BANNERS.length} banners, images in ${SEED_DIR}`);
await prisma.$disconnect();
