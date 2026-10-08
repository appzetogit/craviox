import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { orderAPI, restaurantAPI, userAPI } from "@food/api"
import { useCart } from "@food/context/CartContext"
import { useProfile } from "@food/context/ProfileContext"
import { useDeliveryLocation } from "@food/context/DeliveryLocationContext"
import { useZone } from "@food/hooks/useZone"
import { isModuleAuthenticated } from "@food/utils/auth"
import { normalizeLocationForPricing } from "@food/utils/geo"
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability"
import { getCompanyNameAsync } from "@food/utils/businessSettings"
import { initRazorpayPayment } from "@food/utils/razorpay"
import {
  AUTO_COUPON_STATE_EVENT,
  buildCartItemsForPricing,
  getCartSignature,
  isManualCouponOptOut,
  markManualCouponOptOut,
  markUserSelectedCoupon,
} from "@food/utils/autoCoupon"
import { getDeliveryAddressMode } from "@food/utils/deliveryLocationUtils"
import { checkoutStore, useCheckoutState } from "./checkoutStore"
import { toRestaurant } from "./restaurant"

const SCHEDULE_KEY = "craviox_scheduled_at"
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const looksLikeLatLng = (s) => /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(String(s || "").trim())

/** One line for an address (Cart.jsx formatFullAddress). */
export function formatFullAddress(a) {
  if (!a) return ""
  if (a.formattedAddress && a.formattedAddress !== "Select location" && !looksLikeLatLng(a.formattedAddress)) return a.formattedAddress
  const parts = [a.street, a.additionalDetails, a.city, a.state, a.zipCode].filter(Boolean)
  if (parts.length) return parts.join(", ")
  return a.address && a.address !== "Select location" ? a.address : ""
}

function storedLocation() {
  try {
    return JSON.parse(localStorage.getItem("userLocation") || "null")
  } catch {
    return null
  }
}

function readSchedule() {
  try {
    const iso = sessionStorage.getItem(SCHEDULE_KEY)
    const d = iso ? new Date(iso) : null
    return d && !Number.isNaN(d.getTime()) && d.getTime() > Date.now() ? d : null
  } catch {
    return null
  }
}

/**
 * Pricing, coupons, address and order placement for Cart and Checkout.
 * Ported from the old cart page so the order the server receives is the same.
 */
export function useCheckout() {
  const navigate = useNavigate()
  const { cart, replaceCart, clearCart } = useCart()
  const { userProfile, getDefaultAddress, addresses } = useProfile()
  const { liveLocation } = useDeliveryLocation() || {}
  const choices = useCheckoutState()
  const items = useMemo(() => (Array.isArray(cart) ? cart : []), [cart])
  const authed = isModuleAuthenticated("user")

  // ---- restaurant ---------------------------------------------------------
  const cartRestaurantId = items[0]?.restaurantId ? String(items[0].restaurantId) : ""
  const [restaurantRaw, setRestaurantRaw] = useState(null)
  useEffect(() => {
    if (!cartRestaurantId) {
      setRestaurantRaw(null)
      return undefined
    }
    let live = true
    const load = () =>
      restaurantAPI
        .getRestaurantById(cartRestaurantId)
        .then((res) => live && setRestaurantRaw(res?.data?.data?.restaurant || res?.data?.restaurant || null))
        .catch(() => {})
    load()
    // Open/closed changes during the day; re-check like the old page did.
    const t = setInterval(load, 60000)
    window.addEventListener("focus", load)
    return () => {
      live = false
      clearInterval(t)
      window.removeEventListener("focus", load)
    }
  }, [cartRestaurantId])
  const restaurant = useMemo(() => (restaurantRaw ? toRestaurant(restaurantRaw) : null), [restaurantRaw])
  const restaurantId = restaurantRaw ? String(restaurantRaw.restaurantId || restaurantRaw._id || restaurantRaw.id) : cartRestaurantId
  const restaurantName = restaurantRaw ? String(restaurantRaw.restaurantName || restaurantRaw.name || "").trim() : items[0]?.restaurant || ""

  // ---- schedule (from Home's Schedule chip) -------------------------------
  const [scheduledAt, setScheduledAt] = useState(readSchedule)
  const clearSchedule = () => {
    try {
      sessionStorage.removeItem(SCHEDULE_KEY)
    } catch {
      // ignore
    }
    setScheduledAt(null)
  }
  const canPlaceOrder = Boolean(restaurantRaw) && getRestaurantAvailabilityStatus(restaurantRaw, scheduledAt || new Date()).isOpen === true

  // ---- address ------------------------------------------------------------
  const mode = getDeliveryAddressMode()
  const savedAddress = getDefaultAddress?.() || null
  const currentLocationAddress = useMemo(() => {
    const loc = liveLocation?.latitude && liveLocation?.longitude ? liveLocation : storedLocation()
    if (!loc?.latitude || !loc?.longitude) return null
    const formattedAddress = loc.formattedAddress || loc.address || ""
    if (!formattedAddress || formattedAddress === "Select location") return null
    return {
      // The order schema accepts Home / Office / Other.
      label: "Home",
      formattedAddress,
      address: formattedAddress,
      street: loc.street || loc.address || loc.area || "Current Location",
      additionalDetails: loc.area || "",
      city: loc.city || loc.area || "Current City",
      state: loc.state || loc.city || "Current State",
      zipCode: loc.postalCode || loc.zipCode || loc.pincode || "",
      phone: userProfile?.phone || "",
      location: { type: "Point", coordinates: [loc.longitude, loc.latitude] },
      isCurrentLocation: true,
    }
  }, [liveLocation, userProfile?.phone])
  const address = mode === "current" ? currentLocationAddress || savedAddress : savedAddress || currentLocationAddress
  const pricingAddress = useMemo(() => normalizeLocationForPricing(address), [address])
  const hasAddress = Boolean(address && formatFullAddress(address))
  const coords = pricingAddress?.location?.coordinates
  const { zoneId } = useZone(coords?.length === 2 ? { latitude: coords[1], longitude: coords[0] } : liveLocation) || {}

  // ---- contact ------------------------------------------------------------
  const customerName = String(userProfile?.name || "").trim() || "Customer"
  const customerPhone = String(userProfile?.phone || address?.phone || "").replace(/\D/g, "").slice(-10)

  // ---- pricing ------------------------------------------------------------
  const [pricing, setPricing] = useState(null)
  const [calculating, setCalculating] = useState(false)
  const [pricingError, setPricingError] = useState("")
  const seq = useRef(0)

  const buildPayload = useCallback(
    (couponCode) => ({
      items: buildCartItemsForPricing(items),
      restaurantId,
      deliveryAddress: pricingAddress,
      couponCode: couponCode || undefined,
      deliveryMode: "basic",
      zoneId: zoneId || undefined,
      scheduledAt: scheduledAt ? scheduledAt.toISOString() : undefined,
    }),
    [items, restaurantId, pricingAddress, zoneId, scheduledAt],
  )

  const calculate = useCallback(
    async (couponCode = checkoutStore.get().couponCode) => {
      if (!items.length || !hasAddress || !authed || !restaurantId) {
        setPricing(null)
        setPricingError("")
        return null
      }
      const mine = ++seq.current
      setCalculating(true)
      try {
        const res = await orderAPI.calculateOrder(buildPayload(couponCode))
        if (mine !== seq.current) return null
        const data = res?.data?.data || {}
        const next = data.pricing || null
        setPricing(next)
        setPricingError("")
        // Keep the cart's prices in line with the menu, as before.
        const serverItems = Array.isArray(data.items) ? data.items : []
        if (serverItems.length) {
          let changed = false
          const updated = items.map((line) => {
            const s = serverItems.find((x) => String(x.itemId) === String(line.itemId || line.id) && String(x.variantId || "") === String(line.variantId || ""))
            if (s && Number(s.price) > 0 && Number(s.price) !== Number(line.price)) {
              changed = true
              return { ...line, price: Number(s.price), variantPrice: Number(s.price) }
            }
            return line
          })
          if (changed) {
            replaceCart?.(updated)
            if (Array.isArray(data.priceChanges) && data.priceChanges.length) toast("Cart prices were updated to match the latest menu")
          }
        }
        // The cart syncs this snapshot to the server (CartContext).
        try {
          sessionStorage.setItem("food_cart_pricing_snapshot", JSON.stringify({ restaurantId, pricing: next, at: Date.now() }))
          window.dispatchEvent(new Event("food_cart_pricing_updated"))
        } catch {
          // ignore
        }
        return next
      } catch (err) {
        if (mine !== seq.current) return null
        setPricing(null)
        setPricingError(err?.response?.data?.message || "Could not calculate your bill.")
        return null
      } finally {
        if (mine === seq.current) setCalculating(false)
      }
    },
    [items, hasAddress, authed, restaurantId, buildPayload, replaceCart],
  )

  useEffect(() => {
    calculate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculate, choices.couponCode])

  // The global auto-coupon engine picks the best code for this cart.
  useEffect(() => {
    const onState = (e) => {
      const d = e?.detail || {}
      const sig = getCartSignature(items)
      if (isManualCouponOptOut(restaurantId, sig)) return
      const current = checkoutStore.get()
      if (d.action === "clear") {
        if (current.couponAuto) checkoutStore.set({ couponCode: "", couponAuto: false })
      } else if (d.action === "apply" && d.code && (!current.couponCode || current.couponAuto)) {
        checkoutStore.set({ couponCode: String(d.code).toUpperCase(), couponAuto: true })
      }
    }
    window.addEventListener(AUTO_COUPON_STATE_EVENT, onState)
    return () => window.removeEventListener(AUTO_COUPON_STATE_EVENT, onState)
  }, [items, restaurantId])

  const subtotal = useMemo(() => items.reduce((s, l) => s + num(l.price) * (num(l.quantity) || 1), 0), [items])

  // ---- coupons ------------------------------------------------------------
  const [offers, setOffers] = useState([])
  useEffect(() => {
    if (!restaurantId) return undefined
    let live = true
    restaurantAPI
      .getPublicOffers({ restaurantId, subtotal }, { suppressErrorToast: true })
      .then((res) => {
        if (!live) return
        const list = res?.data?.data?.allOffers || []
        setOffers(
          list
            .filter((o) => o?.couponCode || o?.code)
            .filter((o) => {
              if (String(o.restaurantScope) !== "selected") return true
              const ids = Array.isArray(o.restaurantIds) && o.restaurantIds.length ? o.restaurantIds : [o.restaurantId].filter(Boolean)
              return ids.some((id) => String(id) === restaurantId)
            })
            .map((o) => ({
              code: String(o.couponCode || o.code).toUpperCase(),
              headline: String(o.headline || o.title || "").trim(),
              conditions: (Array.isArray(o.conditions) ? o.conditions : []).map((c) => String(c).trim()).filter(Boolean),
              isFirstOrderOnly: o.isFirstOrderOnly === true || o.customerScope === "first-time" || o.customerScope === "new",
            })),
        )
      })
      .catch(() => live && setOffers([]))
    return () => {
      live = false
    }
    // Offers depend on the subtotal only coarsely; refetch per restaurant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId])

  const appliedCode = pricing?.appliedCoupon?.code ? String(pricing.appliedCoupon.code).toUpperCase() : ""
  const couponError = pricing?.couponError?.message || ""

  const applyCoupon = useCallback(
    async (rawCode) => {
      const code = String(rawCode || "").trim().toUpperCase()
      if (!code) return { ok: false, message: "Enter a promocode" }
      if (!hasAddress) return { ok: false, message: "Add a delivery address first" }
      checkoutStore.set({ couponCode: code, couponAuto: false })
      markUserSelectedCoupon(restaurantId, getCartSignature(items), code)
      const next = await calculate(code)
      if (next?.appliedCoupon?.code) {
        return { ok: true, message: `Coupon "${code}" applied — saved ₹${Math.round(num(next.discount))}!` }
      }
      return { ok: false, message: next?.couponError?.message || `Coupon "${code}" is not valid for this order` }
    },
    [calculate, hasAddress, items, restaurantId],
  )

  const removeCoupon = useCallback(() => {
    markManualCouponOptOut(restaurantId, getCartSignature(items))
    checkoutStore.set({ couponCode: "", couponAuto: false })
  }, [items, restaurantId])

  // ---- wallet ---------------------------------------------------------------
  const [walletBalance, setWalletBalance] = useState(null)
  const loadWallet = useCallback(() => {
    if (!authed) return
    userAPI
      .getWallet()
      .then((res) => {
        const d = res?.data?.data || {}
        const w = d.wallet || d
        setWalletBalance(num(w.balance ?? w.availableBalance ?? w.walletBalance))
      })
      .catch(() => setWalletBalance(null))
  }, [authed])
  useEffect(loadWallet, [loadWallet])

  // ---- place order (Cart.jsx handlePlaceOrder) ------------------------------
  const [placing, setPlacing] = useState(false)

  const onPlaced = useCallback(
    (order, message) => {
      const id = order?._id || order?.id || order?.orderId || order?.orderMongoId
      window.dispatchEvent(new CustomEvent("order-placed", { detail: { order } }))
      clearCart()
      clearSchedule()
      checkoutStore.reset()
      toast.success(message)
      navigate(id ? `/food/user/orders/${id}?confirmed=true` : "/food/user/orders", { replace: true })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearCart, navigate],
  )

  const placeOrder = useCallback(async () => {
    if (placing) return
    if (!items.length) return toast.error("Your cart is empty.")
    if (!hasAddress) {
      toast.error("Add a delivery address to continue.")
      navigate("/food/user/cart/address-selector", { state: { backTo: "/food/user/checkout" } })
      return
    }
    if (scheduledAt && scheduledAt.getTime() <= Date.now()) return toast.error("Scheduled time must be in the future.")
    if (!canPlaceOrder) return toast.error("Restaurant is currently offline. Please try again later.")
    if (!restaurantId) return toast.error("Restaurant details are missing. Please refresh the page.")
    if (!customerPhone || customerPhone.length !== 10) return toast.error("Add your mobile number in your profile to place an order.")

    const method = choices.paymentMethod
    setPlacing(true)
    try {
      // Fresh prices right before ordering.
      const fresh = await calculate()
      if (!fresh || !(num(fresh.total) > 0)) throw new Error("Unable to calculate order total. Please try again.")
      if (method === "wallet" && walletBalance != null && walletBalance < num(fresh.total)) {
        throw new Error(`Insufficient wallet balance. Required: ₹${num(fresh.total).toFixed(2)}, Available: ₹${walletBalance.toFixed(2)}`)
      }

      const orderItems = buildCartItemsForPricing(items).map((it, i) => ({ ...it, preparationTime: items[i]?.preparationTime }))
      const res = await orderAPI.createOrder({
        items: orderItems,
        address: { ...pricingAddress, phone: customerPhone, name: customerName, fullName: customerName },
        customerName,
        customerPhone,
        restaurantId,
        restaurantName,
        pricing: {
          subtotal: fresh.subtotal,
          deliveryFee: fresh.deliveryFee,
          tax: fresh.tax,
          platformFee: fresh.platformFee,
          discount: fresh.discount,
          total: fresh.total,
          couponCode: fresh.appliedCoupon?.code || undefined,
        },
        note: choices.note.trim(),
        deliveryInstructions: choices.instruction.trim(),
        deliveryMode: "basic",
        sendCutlery: choices.sendCutlery !== false,
        paymentMethod: method,
        zoneId: zoneId || undefined,
        scheduledAt: scheduledAt ? scheduledAt.toISOString() : undefined,
      })
      const { order, razorpay } = res?.data?.data || {}
      const orderId = order?._id || order?.id || order?.orderMongoId

      if (method === "wallet") {
        onPlaced(order, "Order paid with your Craviox Wallet 🎉")
        loadWallet()
        return
      }
      if (method === "cash") {
        onPlaced(order, "Order placed. Pay the rider on delivery 🎉")
        return
      }
      if (!razorpay?.orderId || !razorpay?.key) {
        if (orderId) orderAPI.abandonOnlinePayment(orderId).catch(() => {})
        throw new Error("Online payment isn't available right now. Your order was not charged.")
      }

      await new Promise((resolve) => {
        let settled = false
        const done = () => {
          if (!settled) {
            settled = true
            resolve()
          }
        }
        const abandon = () => orderId && orderAPI.abandonOnlinePayment(orderId).catch(() => {})
        getCompanyNameAsync()
          .catch(() => "Craviox")
          .then((name) =>
            initRazorpayPayment({
              key: razorpay.key,
              amount: razorpay.amount,
              currency: razorpay.currency || "INR",
              order_id: razorpay.orderId,
              name: name || "Craviox",
              description: `Order ${order?.orderId || orderId} - ₹${(num(razorpay.amount) / 100).toFixed(2)}`,
              image: "/icon-192.png",
              theme: { color: "#F54A00" },
              prefill: { name: customerName, email: userProfile?.email || "", contact: customerPhone },
              notes: { orderId: String(order?.orderId || orderId || ""), restaurantId },
              handler: async (r) => {
                try {
                  const v = await orderAPI.verifyPayment({
                    orderId,
                    razorpayOrderId: r.razorpay_order_id,
                    razorpayPaymentId: r.razorpay_payment_id,
                    razorpaySignature: r.razorpay_signature,
                  })
                  if (v?.data?.success === false) throw new Error(v?.data?.message)
                  onPlaced(order, "Payment successful. Order placed 🎉")
                } catch (err) {
                  // The webhook may still confirm it; show the order rather than an error.
                  toast("We're confirming your payment. This can take a moment.")
                  clearCart()
                  navigate(orderId ? `/food/user/orders/${orderId}` : "/food/user/orders", { replace: true })
                } finally {
                  done()
                }
              },
              onError: (err) => {
                if (err?.code === "PAYMENT_CANCELLED") {
                  abandon()
                  toast("Payment cancelled.")
                } else {
                  toast.error(err?.description || err?.message || "Payment failed.")
                }
                done()
              },
              onClose: () => {
                abandon()
                toast("Payment cancelled.")
                done()
              },
            }),
          )
          .catch((err) => {
            abandon()
            toast.error(err?.message || "Couldn't open the payment window.")
            done()
          })
      })
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Could not place your order. Please try again.")
      calculate()
    } finally {
      setPlacing(false)
    }
  }, [
    placing, items, hasAddress, navigate, scheduledAt, canPlaceOrder, restaurantId, customerPhone, choices, calculate,
    walletBalance, pricingAddress, customerName, restaurantName, zoneId, onPlaced, loadWallet, userProfile?.email, clearCart,
  ])

  return {
    items,
    authed,
    restaurant,
    restaurantRaw,
    restaurantId,
    restaurantName,
    canPlaceOrder,
    scheduledAt,
    clearSchedule,
    address,
    hasAddress,
    addresses: addresses || [],
    customerName,
    customerPhone,
    subtotal,
    pricing,
    calculating,
    pricingError,
    recalculate: calculate,
    offers,
    couponCode: choices.couponCode,
    appliedCode,
    couponError,
    applyCoupon,
    removeCoupon,
    choices,
    walletBalance,
    placing,
    placeOrder,
  }
}
