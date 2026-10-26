/**
 * Seeds a browsable Craviox demo: home categories, hero banners, and approved
 * restaurants with full menus -- all with images -- inside an existing delivery
 * zone (SEED_ZONE_NAME, default the live Vijay Nagar, Jabalpur zone).
 *
 * Photos are the lead image of each dish's Wikipedia article, falling back to
 * TheMealDB, and are downloaded into UPLOAD_STORAGE_ROOT/seed so nginx serves
 * them like any upload rather than hotlinking. Restaurants are built through the
 * same mapper helpers as seed-demo-restaurant.mjs, so name search and PostGIS
 * radius queries see them.
 *
 * Idempotent: categories and banners match on name/publicId, restaurants on
 * (normalized name, owner phone), items on (restaurant, name). SEED_REFRESH=1
 * re-downloads images that are already on disk.
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
const WIKI = 'https://en.wikipedia.org/api/rest_v1/page/summary';
const REFRESH = process.env.SEED_REFRESH === '1';
// Wikimedia refuses requests without an identifying User-Agent
const HEADERS = { 'User-Agent': 'CravioxDemoSeed/1.0 (food delivery demo data)' };

// ── Images ─────────────────────────────────────────────────────────────────
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const categoryPools = new Map();
let poolCursor = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wikipedia answers 429 to bursts, so pace every lookup and back off when told to.
const getJson = async (url) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
        await sleep(attempt ? 2000 * attempt : 300);
        try {
            const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
            if (res.status === 429) continue;
            return res.ok ? await res.json() : null;
        } catch {
            return null;
        }
    }
    return null;
};

/** Wikipedia lead photo at ~800px wide, or candidates to try in order. */
const wikiPhotos = async (title) => {
    if (!title) return [];
    const page = await getJson(`${WIKI}/${encodeURIComponent(title.replace(/ /g, '_'))}`);
    const thumb = page?.thumbnail?.source;
    const original = page?.originalimage?.source;
    // Skip drawings and logos (svg/png): only photographs look like food
    if (!thumb || /\.(svg|png|gif)/i.test(original || thumb)) return [];
    return [thumb.replace(/\/\d+px-/, '/800px-'), original, thumb].filter(Boolean);
};

/** MealDB: exact search first, then a pick from a MealDB category. */
const mealDbPhoto = async (term, fallbackCategory) => {
    const hit = await getJson(`${MEALDB}/search.php?s=${encodeURIComponent(term)}`);
    if (hit?.meals?.[0]?.strMealThumb) return hit.meals[0].strMealThumb;

    if (!categoryPools.has(fallbackCategory)) {
        const list = await getJson(`${MEALDB}/filter.php?c=${encodeURIComponent(fallbackCategory)}`);
        categoryPools.set(fallbackCategory, (list?.meals || []).map((m) => m.strMealThumb));
    }
    const pool = categoryPools.get(fallbackCategory);
    return pool.length ? pool[poolCursor++ % pool.length] : null;
};

const download = async (url, target) => {
    try {
        const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
        const type = res.headers.get('content-type') || '';
        if (!res.ok || !type.startsWith('image/')) return false;
        await writeFile(target, Buffer.from(await res.arrayBuffer()));
        return true;
    } catch {
        return false;
    }
};

/** Downloads once into uploads/seed and returns the public /uploads path ('' on failure). */
const image = async (key, wikiTitle, term, fallbackCategory = 'Miscellaneous') => {
    const file = `${slug(key)}.jpg`;
    const target = path.join(SEED_DIR, file);
    const publicPath = `/uploads/seed/${file}`;
    if (!REFRESH) {
        try {
            await access(target);
            return publicPath;
        } catch { /* not downloaded yet */ }
    }

    for (const url of await wikiPhotos(wikiTitle)) {
        if (await download(url, target)) return publicPath;
    }
    const url = await mealDbPhoto(term, fallbackCategory);
    if (url && await download(url, target)) {
        console.warn(`  image for "${key}" fell back to TheMealDB`);
        return publicPath;
    }
    console.warn(`  NO image for "${key}"`);
    return '';
};

await mkdir(SEED_DIR, { recursive: true });

// ── Zone ───────────────────────────────────────────────────────────────────
// Restaurants must sit inside an active zone or no customer ever sees them.
const ZONE_NAME = process.env.SEED_ZONE_NAME || 'Vijay nagar jabalpur 1';
const zone = await prisma.foodZone.findFirst({ where: { name: ZONE_NAME } });
if (!zone) {
    console.error(`zone "${ZONE_NAME}" not found; create it in the admin panel or set SEED_ZONE_NAME`);
    process.exit(1);
}
console.log(`zone: ${zone.name} (${zone.id})`);

const insideZone = (lat, lng) => {
    const ring = zone.coordinates || [];
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [a, b] = [ring[i], ring[j]];
        if ((a.latitude > lat) !== (b.latitude > lat)
            && lng < ((b.longitude - a.longitude) * (lat - a.latitude)) / (b.latitude - a.latitude) + a.longitude) {
            inside = !inside;
        }
    }
    return inside;
};

// ── Home categories (global) ───────────────────────────────────────────────
// [name, wikipedia article, mealdb term, mealdb category]
const HOME_CATEGORIES = [
    ['Biryani', 'Hyderabadi biryani', 'Lamb Biryani', 'Lamb'],
    ['North Indian', 'Butter chicken', 'Butter Chicken', 'Chicken'],
    ['South Indian', 'Masala dosa', 'Dosa', 'Vegetarian'],
    ['Pizza', 'Pizza Margherita', 'Pizza Express Margherita', 'Vegetarian'],
    ['Burgers', 'Hamburger', 'Burger', 'Beef'],
    ['Chinese', 'Chow mein', 'Kung Pao Chicken', 'Chicken'],
    ['Desserts', 'Chocolate cake', 'Chocolate Gateau', 'Dessert'],
    ['Seafood', 'Fish curry', 'Fish pie', 'Seafood'],
    ['Pasta', 'Penne alla arrabbiata', 'Spaghetti Bolognese', 'Pasta'],
    ['Healthy', 'Salad', 'Vegan Chocolate Cake', 'Vegan'],
];
for (const [i, [name, wiki, term, fallback]] of HOME_CATEGORIES.entries()) {
    const img = await image(`category-${name}`, wiki, term, fallback);
    const existing = await prisma.foodCategory.findFirst({ where: { name, restaurantId: null } });
    const data = { name, image: img, isApproved: true, approvalStatus: 'approved', isActive: true, sortOrder: i };
    if (existing) await prisma.foodCategory.update({ where: { id: existing.id }, data });
    else await prisma.foodCategory.create({ data });
}
console.log(`home categories: ${HOME_CATEGORIES.length}`);

// Menu sections get their own picture, from the article named here.
const SECTION_PHOTOS = {
    Starters: 'Chicken 65', 'Main Course': 'Dal makhani', Breads: 'Naan', Tiffins: 'Idli',
    Meals: 'Thali', Beverages: 'Indian filter coffee', Pizzas: 'Pizza Margherita', Sides: 'French fries',
    Mains: 'Kung Pao chicken', 'Rice & Noodles': 'Fried rice', Cakes: 'Red velvet cake',
    Treats: 'Chocolate brownie', Rice: 'Pilaf', Biryani: 'Hyderabadi biryani', Desserts: 'Chocolate cake',
    Pasta: 'Penne alla arrabbiata', Burgers: 'Hamburger', Seafood: 'Fish curry',
};

// ── Restaurants ────────────────────────────────────────────────────────────
// All inside the Vijay Nagar, Jabalpur zone (checked below).
// menu rows: [dish, price, Veg|NonVeg, description, wikipedia article, mealdb term, mealdb category]
const RESTAURANTS = [
    {
        name: 'Dum Pukht Biryani House', phone: '9000000101', area: 'Vijay Nagar', lat: 23.1930, lng: 79.8960, pincode: '482002',
        cuisines: ['Biryani', 'Mughlai'], veg: false, rating: 4.5, ratings: 2140, eta: '30-35 mins',
        menu: {
            Biryani: [
                ['Chicken Dum Biryani', 320, 'NonVeg', 'Slow-cooked basmati and chicken sealed with dough, served with raita and salan.', 'Hyderabadi biryani', 'Chicken Biryani', 'Chicken'],
                ['Mutton Dum Biryani', 420, 'NonVeg', 'Tender mutton layered with saffron rice and fried onions.', 'Biryani', 'Lamb Biryani', 'Lamb'],
                ['Veg Dum Biryani', 260, 'Veg', 'Seasonal vegetables and paneer in fragrant dum rice.', 'Tehri (food)', 'Vegetable Biryani', 'Vegetarian'],
            ],
            Starters: [
                ['Chicken 65', 280, 'NonVeg', 'Spicy, crisp fried chicken tossed with curry leaves.', 'Chicken 65', 'Chicken 65', 'Chicken'],
                ['Tandoori Chicken (Half)', 300, 'NonVeg', 'Charred in the tandoor with yoghurt and spices.', 'Tandoori chicken', 'Tandoori chicken', 'Chicken'],
            ],
            Desserts: [
                ['Double Ka Meetha', 120, 'Veg', 'Bread pudding with dry fruits.', 'Double ka meetha', 'Bread and Butter Pudding', 'Dessert'],
            ],
        },
    },
    {
        name: 'Punjab Da Dhaba', phone: '9000000102', area: 'Vijay Nagar', lat: 23.1960, lng: 79.9050, pincode: '482002',
        cuisines: ['North Indian', 'Punjabi'], veg: false, rating: 4.3, ratings: 860, eta: '25-30 mins',
        menu: {
            'Main Course': [
                ['Butter Chicken', 360, 'NonVeg', 'Tandoori chicken in a silky tomato-butter gravy.', 'Butter chicken', 'Butter Chicken', 'Chicken'],
                ['Paneer Butter Masala', 290, 'Veg', 'Cottage cheese cubes in rich makhani gravy.', 'Paneer makhani', 'Matar Paneer', 'Vegetarian'],
                ['Dal Makhani', 240, 'Veg', 'Black lentils simmered overnight with cream.', 'Dal makhani', 'Dal fry', 'Vegetarian'],
                ['Chicken Tikka Masala', 350, 'NonVeg', 'Smoky tikka in a spiced onion-tomato masala.', 'Chicken tikka masala', 'Chicken Tikka Masala', 'Chicken'],
            ],
            Breads: [
                ['Butter Naan', 60, 'Veg', 'Soft tandoor bread brushed with butter.', 'Naan', 'Naan', 'Side'],
                ['Lachha Paratha', 70, 'Veg', 'Flaky layered whole-wheat flatbread.', 'Paratha', 'Paratha', 'Side'],
            ],
        },
    },
    {
        name: 'Udupi Tiffin Centre', phone: '9000000103', area: 'Vijay Nagar', lat: 23.1880, lng: 79.9000, pincode: '482002',
        cuisines: ['South Indian', 'Breakfast'], veg: true, rating: 4.4, ratings: 1320, eta: '20-25 mins',
        menu: {
            Tiffins: [
                ['Masala Dosa', 110, 'Veg', 'Crisp rice crepe with spiced potato, sambar and chutneys.', 'Masala dosa', 'Dosa', 'Vegetarian'],
                ['Idli Sambar (2 pcs)', 70, 'Veg', 'Steamed rice cakes with sambar and coconut chutney.', 'Idli', 'Idli', 'Vegetarian'],
                ['Medu Vada', 80, 'Veg', 'Crisp lentil fritters.', 'Medu vada', 'Vada', 'Vegetarian'],
                ['Upma', 75, 'Veg', 'Semolina cooked with vegetables and tempering.', 'Upma', 'Upma', 'Breakfast'],
            ],
            Meals: [
                ['South Indian Thali', 220, 'Veg', 'Rice, sambar, rasam, two curries, curd and sweet.', 'Thali', 'Vegetable Curry', 'Vegetarian'],
            ],
            Beverages: [
                ['Filter Coffee', 50, 'Veg', 'Strong decoction coffee with frothed milk.', 'Indian filter coffee', 'Coffee', 'Dessert'],
            ],
        },
    },
    {
        name: 'Napoli Wood Fired Pizza', phone: '9000000104', area: 'Vijay Nagar', lat: 23.2000, lng: 79.9100, pincode: '482002',
        cuisines: ['Pizza', 'Italian'], veg: false, rating: 4.6, ratings: 540, eta: '30-40 mins',
        menu: {
            Pizzas: [
                ['Margherita', 349, 'Veg', 'San Marzano tomato, fior di latte and basil.', 'Pizza Margherita', 'Pizza Express Margherita', 'Vegetarian'],
                ['Chicken Pepperoni', 449, 'NonVeg', 'Loaded chicken pepperoni with mozzarella.', 'Pepperoni', 'Pepperoni Pizza', 'Pork'],
                ['Farmhouse Veggie', 399, 'Veg', 'Peppers, onion, olives, mushroom and corn.', 'Pizza', 'Vegetarian pizza', 'Vegetarian'],
            ],
            Pasta: [
                ['Penne Arrabbiata', 329, 'Veg', 'Spicy tomato sauce with garlic and chilli.', 'Penne alla arrabbiata', 'Penne Arrabiata', 'Pasta'],
                ['Spaghetti Bolognese', 379, 'NonVeg', 'Slow-cooked chicken ragu.', 'Bolognese sauce', 'Spaghetti Bolognese', 'Pasta'],
            ],
            Desserts: [
                ['Tiramisu', 249, 'Veg', 'Espresso-soaked sponge with mascarpone.', 'Tiramisu', 'Tiramisu', 'Dessert'],
            ],
        },
    },
    {
        name: 'Burger Barn', phone: '9000000105', area: 'Vijay Nagar', lat: 23.1910, lng: 79.9150, pincode: '482002',
        cuisines: ['Burgers', 'American', 'Fast Food'], veg: false, rating: 4.2, ratings: 710, eta: '25-30 mins',
        menu: {
            Burgers: [
                ['Classic Chicken Burger', 219, 'NonVeg', 'Crispy chicken, lettuce, pickles and house mayo.', 'Chicken sandwich', 'Chicken Burger', 'Chicken'],
                ['Smash Burger', 279, 'NonVeg', 'Double smashed patty with cheese and onions.', 'Hamburger', 'Burger', 'Beef'],
                ['Crispy Veg Burger', 169, 'Veg', 'Potato-pea patty with tangy sauce.', 'Veggie burger', 'Vegan burger', 'Vegetarian'],
            ],
            Sides: [
                ['Peri Peri Fries', 129, 'Veg', 'Fries tossed in peri peri seasoning.', 'French fries', 'Chips', 'Side'],
                ['Chicken Wings (6 pcs)', 249, 'NonVeg', 'Buffalo-style wings with dip.', 'Buffalo wing', 'Chicken Wings', 'Chicken'],
            ],
        },
    },
    {
        name: 'Dragon Wok', phone: '9000000106', area: 'Vijay Nagar', lat: 23.1980, lng: 79.8900, pincode: '482002',
        cuisines: ['Chinese', 'Asian'], veg: false, rating: 4.1, ratings: 430, eta: '30-35 mins',
        menu: {
            Mains: [
                ['Kung Pao Chicken', 299, 'NonVeg', 'Wok-tossed chicken with peanuts and dried chillies.', 'Kung Pao chicken', 'Kung Pao Chicken', 'Chicken'],
                ['Chilli Paneer', 259, 'Veg', 'Paneer tossed with peppers in chilli-soy sauce.', 'Chilli chicken', 'General Tsos Chicken', 'Vegetarian'],
                ['Manchurian', 239, 'Veg', 'Vegetable dumplings in a spicy soy-garlic sauce.', 'Manchurian (dish)', 'Sweet and Sour Pork', 'Vegetarian'],
            ],
            'Rice & Noodles': [
                ['Veg Hakka Noodles', 199, 'Veg', 'Stir-fried noodles with vegetables.', 'Chow mein', 'Chow mein', 'Vegetarian'],
                ['Chicken Fried Rice', 229, 'NonVeg', 'Wok-fried rice with egg and chicken.', 'Fried rice', 'Egg Fried Rice', 'Chicken'],
            ],
        },
    },
    {
        name: 'Sweet Tooth Patisserie', phone: '9000000107', area: 'Vijay Nagar', lat: 23.1850, lng: 79.9200, pincode: '482002',
        cuisines: ['Desserts', 'Bakery'], veg: true, rating: 4.7, ratings: 380, eta: '20-25 mins',
        menu: {
            Cakes: [
                ['Chocolate Truffle Cake (500g)', 549, 'Veg', 'Dark chocolate sponge with ganache.', 'Chocolate cake', 'Chocolate Gateau', 'Dessert'],
                ['New York Cheesecake', 229, 'Veg', 'Baked vanilla cheesecake slice.', 'Cheesecake', 'Cheesecake', 'Dessert'],
                ['Red Velvet Pastry', 149, 'Veg', 'Cream cheese frosted red velvet.', 'Red velvet cake', 'Red Velvet', 'Dessert'],
            ],
            Treats: [
                ['Chocolate Brownie', 129, 'Veg', 'Fudgy brownie with walnuts.', 'Chocolate brownie', 'Brownies', 'Dessert'],
                ['Apple Pie', 179, 'Veg', 'Buttery crust with cinnamon apples.', 'Apple pie', 'Apple Frangipan Tart', 'Dessert'],
            ],
        },
    },
    {
        name: 'Coastal Catch', phone: '9000000108', area: 'Vijay Nagar', lat: 23.2030, lng: 79.9000, pincode: '482002',
        cuisines: ['Seafood', 'Coastal'], veg: false, rating: 4.3, ratings: 290, eta: '35-40 mins',
        menu: {
            Seafood: [
                ['Andhra Fish Curry', 369, 'NonVeg', 'Tangy tamarind fish curry.', 'Fish curry', 'Fish Stew', 'Seafood'],
                ['Prawn Fry', 429, 'NonVeg', 'Masala-coated prawns, pan fried.', 'Shrimp and prawn as food', 'Garlic prawns', 'Seafood'],
                ['Grilled Salmon', 649, 'NonVeg', 'Herb-grilled salmon with vegetables.', 'Salmon as food', 'Salmon', 'Seafood'],
            ],
            Rice: [
                ['Prawn Pulao', 389, 'NonVeg', 'Coastal-spiced rice with prawns.', 'Pilaf', 'Kedgeree', 'Seafood'],
                ['Jeera Rice', 140, 'Veg', 'Basmati tempered with cumin.', 'Jeera rice', 'Rice', 'Side'],
            ],
        },
    },
];

const outside = RESTAURANTS.filter((r) => !insideZone(r.lat, r.lng));
if (zone.coordinates?.length && outside.length) {
    console.error(`outside zone "${zone.name}": ${outside.map((r) => r.name).join(', ')}`);
    process.exit(1);
}

let itemTotal = 0;
const seededRestaurantIds = [];
for (const r of RESTAURANTS) {
    // Cover shows the signature dish, the round logo a second one.
    const dishes = Object.values(r.menu).flat();
    const [, , , , coverWiki, coverTerm, coverFallback] = dishes[0];
    const [, , , , logoWiki, logoTerm, logoFallback] = dishes[1];
    const coverImage = await image(`restaurant-${r.name}-cover`, coverWiki, coverTerm, coverFallback);
    const profileImage = await image(`restaurant-${r.name}-logo`, logoWiki, logoTerm, logoFallback);

    const derived = deriveRestaurantFields({ restaurantName: r.name, ownerPhone: r.phone, estimatedDeliveryTime: r.eta });
    const location = fromRestaurantLocation({
        latitude: r.lat,
        longitude: r.lng,
        formattedAddress: `${r.area}, Jabalpur, Madhya Pradesh ${r.pincode}`,
        addressLine1: r.area,
        area: r.area,
        city: 'Jabalpur',
        state: 'Madhya Pradesh',
        pincode: r.pincode,
    });

    const firstDish = dishes[0];
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
        const categoryImage = await image(`category-${categoryName}`, SECTION_PHOTOS[categoryName] || items[0][4], items[0][5], items[0][6]);
        const existingCategory = await prisma.foodCategory.findFirst({ where: { name: categoryName, restaurantId: null } });
        const category = existingCategory
            ? (existingCategory.image ? existingCategory
                : await prisma.foodCategory.update({ where: { id: existingCategory.id }, data: { image: categoryImage } }))
            : await prisma.foodCategory.create({
                data: { name: categoryName, image: categoryImage, isApproved: true, approvalStatus: 'approved', isActive: true, sortOrder: 100 },
            });

        for (const [i, [itemName, price, foodType, description, wiki, term, fallback]] of items.entries()) {
            const img = await image(`item-${r.name}-${itemName}`, wiki, term, fallback);
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
// [title, cta, wikipedia article, mealdb term, mealdb category, restaurant indexes]
const BANNERS = [
    ['Biryani Week', 'Order now', 'Biryani', 'Lamb Biryani', 'Lamb', [0]],
    ['Pizza Night', 'Explore', 'Pizza Margherita', 'Pizza Express Margherita', 'Vegetarian', [3]],
    ['Sweet Deals', 'Treat yourself', 'Chocolate cake', 'Chocolate Gateau', 'Dessert', [6]],
];
for (const [i, [title, ctaText, wiki, term, fallback, idx]] of BANNERS.entries()) {
    const publicId = `seed/banner-${slug(title)}`;
    const imageUrl = await image(`banner-${title}`, wiki, term, fallback);
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
