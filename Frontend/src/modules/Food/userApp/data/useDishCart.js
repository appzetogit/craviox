import { useCallback, useMemo } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { useCart } from "@food/context/CartContext"
import { useDeliveryLocation } from "@food/context/DeliveryLocationContext"
import { isModuleAuthenticated } from "@food/utils/auth"
import { buildCartLineId } from "@food/utils/foodVariants"
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability"

/**
 * Adding a restaurant's dishes to the cart, with the same rules and the same
 * cart-line shape as before (the cart, coupons and checkout read these lines):
 * one line per dish + size, `itemId` = the dish, add-ons as lines of their own.
 */
export function useDishCart(raw) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { cart, addToCart, updateQuantity, removeFromCart } = useCart()
  const { isOutOfService } = useDeliveryLocation() || {}

  const restaurantId = raw ? String(raw.restaurantId || raw._id || raw.id || "") : ""
  const restaurantName = raw ? String(raw.restaurantName || raw.name || "").trim() : ""

  /** Total in the cart per dish id (all its sizes). */
  const qtyByDish = useMemo(() => {
    const m = new Map()
    for (const line of Array.isArray(cart) ? cart : []) {
      const key = String(line.itemId || String(line.id || "").split("::")[0])
      m.set(key, (m.get(key) || 0) + (Number(line.quantity) || 0))
    }
    return m
  }, [cart])

  const canOrder = useCallback(() => {
    if (!isModuleAuthenticated("user")) {
      toast.error("Please sign in to add items to your cart")
      navigate("/food/user/auth/login", { state: { from: pathname } })
      return false
    }
    if (isOutOfService) {
      toast.error("You're outside our delivery area. Choose a location we deliver to.")
      return false
    }
    if (!getRestaurantAvailabilityStatus(raw).isOpen) {
      toast.error("This restaurant isn't taking orders right now.")
      return false
    }
    if (!restaurantId || !restaurantName) {
      toast.error("Restaurant details are missing. Please refresh the page.")
      return false
    }
    return true
  }, [isOutOfService, navigate, pathname, raw, restaurantId, restaurantName])

  const report = (result) => {
    if (result?.ok === false && !result.needsConfirmation) toast.error(result.error || "Couldn't add that to your cart.")
    return result?.ok !== false
  }

  /** Add `quantity` of a dish (optionally a size) to the cart. */
  const addDish = useCallback(
    (dish, { variant = dish.variants[0] || null, quantity = 1 } = {}) => {
      if (!canOrder()) return false
      const lineItemId = buildCartLineId(dish.id, variant?.id || "")
      const price = variant ? Number(variant.price) : dish.price
      const otherPrice = variant && Number(variant.otherPrice) > price ? Number(variant.otherPrice) : variant ? 0 : dish.otherPrice
      return report(
        addToCart(
          {
            id: lineItemId,
            lineItemId,
            itemId: dish.id,
            name: dish.name,
            price,
            otherPrice,
            variantId: variant?.id || "",
            variantName: variant?.name || "",
            variantPrice: price,
            image: dish.imageUrl,
            restaurant: restaurantName,
            restaurantId,
            description: dish.description,
            foodType: dish.foodType,
            isVeg: dish.isVeg,
            preparationTime: dish.preparationTime,
          },
          null,
          { quantity },
        ),
      )
    },
    [addToCart, canOrder, restaurantId, restaurantName],
  )

  /** Add-ons go in as their own lines, as the cart's "complete your meal" does. */
  const addAddon = useCallback(
    (addon, quantity = 1) =>
      report(
        addToCart(
          {
            id: addon.id,
            name: addon.name,
            price: addon.price,
            image: addon.imageUrl,
            description: addon.description,
            isVeg: addon.isVeg,
            foodType: addon.foodType,
            restaurant: restaurantName,
            restaurantId,
          },
          null,
          { quantity },
        ),
      ),
    [addToCart, restaurantId, restaurantName],
  )

  /** One fewer of a dish: from its most recently added size. */
  const removeOne = useCallback(
    (dish) => {
      const lines = (Array.isArray(cart) ? cart : []).filter(
        (l) => String(l.itemId || String(l.id || "").split("::")[0]) === dish.id,
      )
      const line = lines[lines.length - 1]
      if (!line) return
      const q = Number(line.quantity) || 0
      if (q <= 1) removeFromCart(line.id)
      else updateQuantity(line.id, q - 1)
    },
    [cart, removeFromCart, updateQuantity],
  )

  return { qtyByDish, addDish, addAddon, removeOne, canOrder }
}
