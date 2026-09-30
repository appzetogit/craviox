import { useSyncExternalStore } from "react"

/**
 * Home filters (home_filter_provider.dart), shared by Home, the category
 * listing and the Filters sheet. Kept for the browser tab's session.
 * Veg mode lives in ProfileContext (it is also used by other pages).
 */
const KEY = "craviox_home_filter"
export const SCHEDULE_KEY = "craviox_scheduled_at"

export const SORTS = [
  { key: "relevance", label: "Relevance" },
  { key: "rating", label: "Rating: High to Low" },
  { key: "deliveryTime", label: "Delivery Time" },
  { key: "priceLowToHigh", label: "Cost: Low to High" },
  { key: "priceHighToLow", label: "Cost: High to Low" },
]

const DEFAULT = { maxPrice: null, minRating: null, sortBy: "relevance", scheduledAt: null }

function read() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) || "null")
    const scheduledAt = sessionStorage.getItem(SCHEDULE_KEY)
    const next = { ...DEFAULT, ...(raw || {}), scheduledAt: scheduledAt || null }
    // A slot in the past is no longer a schedule.
    if (next.scheduledAt && new Date(next.scheduledAt).getTime() < Date.now()) next.scheduledAt = null
    return next
  } catch {
    return { ...DEFAULT }
  }
}

let state = read()
const listeners = new Set()

function write(next) {
  state = next
  try {
    const { scheduledAt, ...rest } = next
    sessionStorage.setItem(KEY, JSON.stringify(rest))
    if (scheduledAt) sessionStorage.setItem(SCHEDULE_KEY, scheduledAt)
    else sessionStorage.removeItem(SCHEDULE_KEY)
  } catch {
    // Storage blocked: the filters still work for this page view.
  }
  listeners.forEach((l) => l())
}

export const homeFilter = {
  get: () => state,
  set: (patch) => write({ ...state, ...patch }),
  reset: () => write({ ...DEFAULT }),
  // Re-read storage (the cart clears the slot once an order is placed).
  sync: () => {
    const next = read()
    if (next.scheduledAt !== state.scheduledAt) {
      state = next
      listeners.forEach((l) => l())
    }
  },
  toggleUnder150: () => write({ ...state, maxPrice: state.maxPrice === 150 ? null : 150 }),
  toggleRating4: () => write({ ...state, minRating: state.minRating === 4 ? null : 4 }),
}

export function useHomeFilter() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
    () => state,
  )
}

export function activeFilterCount(f, isPureVeg) {
  let n = 0
  if (isPureVeg) n++
  if (f.maxPrice != null) n++
  if (f.minRating != null) n++
  if (f.sortBy && f.sortBy !== "relevance") n++
  if (f.scheduledAt) n++
  return n
}

const mins = (t) => {
  const m = String(t || "").match(/\d+/)
  return m ? Number(m[0]) : 999
}

/** filterAndSort: promoted restaurants stay first under every sort. */
export function filterAndSort(list, f, isPureVeg, cuisine = null) {
  const q = cuisine ? cuisine.toLowerCase() : null
  const out = list.filter((r) => {
    if (isPureVeg && !r.isPureVeg) return false
    if (f.maxPrice != null && r.priceForOne > f.maxPrice) return false
    if (f.minRating != null && r.rating < f.minRating) return false
    if (q) {
      const hit =
        r.name.toLowerCase().includes(q) ||
        r.tags.some((t) => String(t).toLowerCase().includes(q)) ||
        r.area.toLowerCase().includes(q)
      if (!hit) return false
    }
    return true
  })
  const promoted = (a, b) => (b.isPromoted ? 1 : 0) - (a.isPromoted ? 1 : 0)
  const by = {
    rating: (a, b) => b.rating - a.rating,
    deliveryTime: (a, b) => mins(a.deliveryTime) - mins(b.deliveryTime),
    priceLowToHigh: (a, b) => a.priceForOne - b.priceForOne,
    priceHighToLow: (a, b) => b.priceForOne - a.priceForOne,
  }[f.sortBy]
  if (by) out.sort((a, b) => promoted(a, b) || by(a, b))
  return out
}

/** `Today 7:30 PM` / `Tomorrow 9:00 AM` / `Sat 1:15 PM` (formatScheduleSlot). */
export function formatScheduleSlot(iso) {
  const dt = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const day = new Date(dt)
  day.setHours(0, 0, 0, 0)
  const diff = Math.round((day - today) / 86400000)
  const label = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : dt.toLocaleDateString("en-IN", { weekday: "short" })
  const time = dt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase()
  return `${label} ${time}`
}
