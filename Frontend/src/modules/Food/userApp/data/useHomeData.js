import { useCallback, useEffect, useRef, useState } from "react"
import { adminAPI, restaurantAPI, publicConfigGetOnce } from "@food/api"
import { useDeliveryLocation } from "@food/context/DeliveryLocationContext"
import { resolveMediaUrl } from "../../../../shared/utils/mediaUrl.js"
import { menuDishes, toRestaurant } from "./restaurant"

const round = (v) => (Number.isFinite(Number(v)) ? Number(Number(v).toFixed(3)) : null)

/**
 * Everything Home needs (home_viewmodel.dart + banners_viewmodel.dart):
 * zone-scoped restaurants, categories and the home promotion banners.
 */
export function useHomeData() {
  const { zoneId, effectiveLocation, zoneLoading } = useDeliveryLocation() || {}
  const lat = round(effectiveLocation?.latitude)
  const lng = round(effectiveLocation?.longitude)

  const [restaurants, setRestaurants] = useState({ list: [], loading: true, error: false })
  const [categories, setCategories] = useState({ list: [], loading: true })
  const [banners, setBanners] = useState([])
  const seq = useRef(0)

  const load = useCallback(async () => {
    const mine = ++seq.current
    if (!zoneId) {
      // No zone yet: wait for detection rather than list every restaurant.
      setRestaurants({ list: [], loading: Boolean(zoneLoading), error: false })
      setCategories({ list: [], loading: Boolean(zoneLoading) })
      setBanners([])
      return
    }
    setRestaurants((s) => ({ ...s, loading: true, error: false }))

    const params = { zoneId }
    if (lat != null && lng != null) Object.assign(params, { lat, lng })

    const [rRes, cRes, bRes] = await Promise.allSettled([
      restaurantAPI.getRestaurants(params),
      adminAPI.getPublicCategories({ zoneId }),
      publicConfigGetOnce("/food/hero-banners/home-promotion/public", { params: { zoneId } }),
    ])
    if (mine !== seq.current) return

    if (rRes.status === "fulfilled") {
      const raw = rRes.value?.data?.data?.restaurants
      setRestaurants({ list: Array.isArray(raw) ? raw.map(toRestaurant) : [], loading: false, error: false })
    } else {
      setRestaurants((s) => ({ list: s.list, loading: false, error: true }))
    }

    if (cRes.status === "fulfilled") {
      const raw = cRes.value?.data?.data?.categories || cRes.value?.data?.categories || []
      setCategories({
        loading: false,
        list: (Array.isArray(raw) ? raw : [])
          .filter((c) => c?.name)
          .map((c) => ({
            id: String(c.id || c._id || c.slug || c.name),
            name: c.name,
            slug: c.slug || String(c.name).toLowerCase().replace(/\s+/g, "-"),
            imageUrl: c.image || c.imageUrl ? resolveMediaUrl(c.image || c.imageUrl) : "",
          })),
      })
    } else {
      setCategories({ list: [], loading: false })
    }

    if (bRes.status === "fulfilled") {
      const raw = bRes.value?.data?.data?.banners
      setBanners(
        (Array.isArray(raw) ? raw : [])
          .filter((b) => b?.imageUrl)
          .map((b) => ({ id: String(b.id || b._id), imageUrl: resolveMediaUrl(b.imageUrl), link: b.ctaLink || "" })),
      )
    }
  }, [zoneId, zoneLoading, lat, lng])

  useEffect(() => {
    load()
  }, [load])

  return { restaurants, categories, banners, reload: load }
}

// Menus are fetched per card as it scrolls into view, and shared by every
// card and screen for the page's lifetime.
const menuCache = new Map()

export function loadMenu(id) {
  if (!id) return Promise.resolve([])
  if (!menuCache.has(id)) {
    menuCache.set(
      id,
      restaurantAPI
        .getMenuByRestaurantId(id)
        .then((res) => menuDishes(res?.data?.data?.menu))
        .catch(() => {
          menuCache.delete(id)
          return []
        }),
    )
  }
  return menuCache.get(id)
}

export function useRestaurantMenu(id, enabled) {
  const [menu, setMenu] = useState([])
  useEffect(() => {
    if (!enabled || !id) return undefined
    let live = true
    loadMenu(id).then((m) => live && setMenu(m))
    return () => {
      live = false
    }
  }, [id, enabled])
  return menu
}
