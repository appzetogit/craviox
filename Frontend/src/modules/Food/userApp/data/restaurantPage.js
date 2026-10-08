import { useCallback, useEffect, useState } from "react"
import { restaurantAPI } from "@food/api"
import { resolveMediaUrl } from "../../../../shared/utils/mediaUrl.js"
import {
  getFoodDiscountPercent,
  getFoodDisplayOtherPrice,
  getFoodDisplayPrice,
  getFoodVariants,
} from "@food/utils/foodVariants"
import { toRestaurant } from "./restaurant"

const media = (v) => {
  const u = v && typeof v === "object" ? v.url : v
  return typeof u === "string" && u.trim() ? resolveMediaUrl(u.trim()) : ""
}

/** A menu item in the shape the restaurant screen draws (FoodModel). */
export function toDish(it, section = {}) {
  const variants = getFoodVariants(it)
  const price = getFoodDisplayPrice(it)
  const otherPrice = getFoodDisplayOtherPrice(it)
  const foodType = String(it.foodType || "").trim()
  return {
    id: String(it.id || it._id || ""),
    name: String(it.name || "").trim(),
    description: String(it.description || "").trim(),
    price,
    otherPrice: otherPrice > price ? otherPrice : 0,
    discountPercent: getFoodDiscountPercent(it),
    variants,
    foodType,
    isVeg: /^veg$/i.test(foodType),
    imageUrl: media(it.image || (Array.isArray(it.images) ? it.images[0] : "")),
    category: String(section.name || it.categoryName || it.category || "Other").trim() || "Other",
    categoryImage: media(section.image),
    isBestseller: it.isRecommended === true || it.isPopular === true || it.bestseller === true || it.isBestseller === true,
    isAvailable: it.isAvailable !== false,
    preparationTime: it.preparationTime || "",
    raw: it,
  }
}

function dishesFromMenu(menu) {
  const out = []
  for (const s of Array.isArray(menu?.sections) ? menu.sections : []) {
    for (const it of Array.isArray(s.items) ? s.items : []) out.push(toDish(it, s))
    for (const sub of Array.isArray(s.subsections) ? s.subsections : []) {
      for (const it of Array.isArray(sub.items) ? sub.items : []) out.push(toDish(it, { ...sub, image: sub.image || s.image }))
    }
  }
  return out.filter((d) => d.id && d.name)
}

/**
 * Everything the restaurant screen shows, by id or slug: the restaurant, its
 * menu, its add-ons and its live offers.
 */
export function useRestaurantPage(slug) {
  const [state, setState] = useState({ loading: true, error: null, raw: null, restaurant: null, dishes: [], addons: [], offers: [] })

  const load = useCallback(async () => {
    if (!slug) return
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const res = await restaurantAPI.getRestaurantById(slug)
      const raw = res?.data?.data?.restaurant || res?.data?.restaurant
      if (!raw) throw new Error("Restaurant not found")
      const id = String(raw._id || raw.id || raw.restaurantId || slug)

      const [menuRes, addonRes, offerRes] = await Promise.allSettled([
        restaurantAPI.getMenuByRestaurantId(id),
        restaurantAPI.getAddonsByRestaurantId(id),
        restaurantAPI.getPublicOffers({ restaurantId: id }),
      ])
      if (menuRes.status === "rejected") throw menuRes.reason

      const addonsRaw = addonRes.status === "fulfilled" ? addonRes.value?.data?.data?.addons || [] : []
      const offersData = offerRes.status === "fulfilled" ? offerRes.value?.data?.data : null
      setState({
        loading: false,
        error: null,
        raw,
        restaurant: { ...toRestaurant(raw), coverImages: [media(raw.coverImage), ...(raw.coverImages || []).map(media)].filter(Boolean) },
        dishes: dishesFromMenu(menuRes.value?.data?.data?.menu),
        addons: (Array.isArray(addonsRaw) ? addonsRaw : [])
          .filter((a) => a && a.isAvailable !== false)
          .map((a) => ({
            id: String(a.id || a._id),
            name: String(a.name || "").trim(),
            description: String(a.description || "").trim(),
            price: Number(a.price) || 0,
            imageUrl: media(a.image || (Array.isArray(a.images) ? a.images[0] : "")),
            foodType: a.foodType || "",
            isVeg: a.isVeg ?? /^veg$/i.test(String(a.foodType || "")),
            foodIds: Array.isArray(a.foodIds) ? a.foodIds.map(String) : [],
          }))
          .filter((a) => a.id && a.name),
        offers: Array.isArray(offersData?.allOffers) ? offersData.allOffers : [],
      })
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error }))
    }
  }, [slug])

  useEffect(() => {
    load()
  }, [load])

  return { ...state, reload: load }
}

/** Add-ons a dish can take: the restaurant-wide ones plus those linked to it. */
export const addonsForDish = (addons, dish) =>
  addons.filter((a) => !a.foodIds.length || a.foodIds.includes(dish.id))
