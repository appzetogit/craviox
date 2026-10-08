import { useSyncExternalStore } from "react"

/**
 * Choices made on Cart that Checkout needs (checkout_viewmodel.dart state):
 * the coupon, payment method and delivery instructions. Kept for the browser
 * tab's session so a refresh between the two screens loses nothing.
 */
const KEY = "craviox_checkout_v1"
const DEFAULT = {
  couponCode: "",
  couponAuto: false,
  paymentMethod: "razorpay",
  instruction: "",
  note: "",
  sendCutlery: true,
}

function read() {
  try {
    return { ...DEFAULT, ...(JSON.parse(sessionStorage.getItem(KEY) || "null") || {}) }
  } catch {
    return { ...DEFAULT }
  }
}

let state = read()
const listeners = new Set()

function write(next) {
  state = next
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage blocked: choices still hold for this page view.
  }
  listeners.forEach((l) => l())
}

export const checkoutStore = {
  get: () => state,
  set: (patch) => write({ ...state, ...patch }),
  /** After an order is placed. Payment method is kept as a preference. */
  reset: () => write({ ...DEFAULT, paymentMethod: state.paymentMethod }),
}

export function useCheckoutState() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
    () => state,
  )
}

export const DELIVERY_INSTRUCTIONS = ["Leave at the door", "Avoid calling", "Avoid ringing bell"]
