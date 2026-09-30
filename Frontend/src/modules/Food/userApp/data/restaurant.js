import { resolveMediaUrl } from "../../../../shared/utils/mediaUrl.js"

const num = (v) => {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const str = (v) => (typeof v === "string" ? v.trim() : "")

const urlOf = (v) => (v && typeof v === "object" ? str(v.url) : str(v))

const media = (v) => {
  const u = urlOf(v)
  return u ? resolveMediaUrl(u) : ""
}

/** The locality to show on a card (RestaurantModel._extractLocationFromApi). */
function areaOf(json) {
  const keys = ["area", "locality", "subLocality", "locationName", "areaName", "outletArea", "branchName", "neighborhood", "vicinity"]
  for (const k of keys) if (str(json[k])) return str(json[k])
  for (const m of [json.location, json.address]) {
    if (!m || typeof m !== "object") continue
    for (const k of ["area", "locality", "subLocality", "city"]) if (str(m[k])) return str(m[k])
  }
  return str(json.city)
}

/** Slug the restaurant page and favourites are keyed by (same rule as the old Home). */
export function restaurantSlug(json) {
  if (str(json.slug)) return str(json.slug)
  return str(json.restaurantName || json.name || "restaurant").toLowerCase().replace(/\s+/g, "-")
}

/**
 * A restaurant from `GET /food/restaurant/restaurants`, in the shape the
 * app's RestaurantModel.fromApi produces.
 */
export function toRestaurant(json = {}) {
  const covers = (Array.isArray(json.coverImages) ? json.coverImages : []).map(media).filter(Boolean)
  const menuImages = (Array.isArray(json.menuImages) ? json.menuImages : []).map(media).filter(Boolean)
  const logo = media(json.profileImage)
  const imageUrl = logo || covers[0] || ""

  const offers = []
  if (str(json.offer)) offers.push(str(json.offer))
  for (const o of [...(json.offers || []), ...(json.activeOffers || [])]) {
    const t = typeof o === "string" ? str(o) : str(o?.title || o?.name || o?.label)
    if (t && !offers.includes(t)) offers.push(t)
  }
  if (str(json.discountText)) offers.push(str(json.discountText))

  const isPureVeg =
    json.pureVegRestaurant === true ||
    json.isVeg === true ||
    json.isPureVeg === true ||
    json.pureVeg === true ||
    str(json.foodType).toLowerCase() === "veg"

  const rawTime = String(json.estimatedDeliveryTime ?? json.deliveryTime ?? json.estimatedDeliveryTimeMinutes ?? "").trim()
  const deliveryTime = /^\d+$/.test(rawTime) ? `${rawTime} mins` : rawTime

  const distanceKm =
    num(json.distanceInKm) ?? (num(json.distanceMeters) != null ? num(json.distanceMeters) / 1000 : null)

  const highlight = str(json.highlightBadge).toLowerCase()
  const cuisines = Array.isArray(json.cuisines) ? json.cuisines.filter((c) => typeof c === "string") : []

  return {
    id: String(json._id || json.id || json.restaurantId || ""),
    slug: restaurantSlug(json),
    name: str(json.restaurantName || json.name),
    imageUrl,
    logoUrl: logo,
    coverImages: covers.length ? covers : imageUrl ? [imageUrl] : [],
    menuImages,
    rating: num(json.rating) ?? 0,
    reviewCount: num(json.totalRatings) ?? num(json.reviewCount) ?? 0,
    deliveryTime,
    tags: cuisines.length ? cuisines : Array.isArray(json.tags) ? json.tags : [],
    isPromoted: json.isPromoted === true,
    distanceKm,
    priceForOne: num(json.featuredPrice) ?? num(json.priceForOne) ?? num(json.startingPrice) ?? num(json.minOrder) ?? 0,
    featuredDishName: str(json.featuredDish) || null,
    offerBadges: offers,
    isOpen: (json.isAcceptingOrders ?? json.isOpen ?? true) !== false,
    isPureVeg,
    area: areaOf(json),
    highlightBadge: highlight === "bestseller" || highlight === "popular" ? highlight : null,
    freeDeliveryAbove: num(json.freeDeliveryAbove),
  }
}

/** Menu dishes from `GET /restaurants/:id/menu`, flattened across sections. */
export function menuDishes(menu) {
  const out = []
  const walk = (items) => {
    for (const it of Array.isArray(items) ? items : []) {
      if (it?.isAvailable === false) continue
      out.push({
        id: String(it.id || it._id || ""),
        name: str(it.name),
        price: num(it.price) ?? 0,
        imageUrl: media(it.image || (Array.isArray(it.images) ? it.images[0] : "")),
        isPopular: it.isPopular === true || it.isBestseller === true || it.bestseller === true,
      })
    }
  }
  for (const s of Array.isArray(menu?.sections) ? menu.sections : []) {
    walk(s.items)
    for (const sub of Array.isArray(s.subsections) ? s.subsections : []) walk(sub.items)
  }
  return out
}
