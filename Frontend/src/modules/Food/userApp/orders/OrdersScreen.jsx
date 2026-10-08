import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { orderAPI } from "@food/api"
import { useCart } from "@food/context/CartContext"
import { buildCartLineId } from "@food/utils/foodVariants"
import { resolveMediaUrl } from "../../../../shared/utils/mediaUrl.js"
import AppShell from "../shell/AppShell"
import { CONTENT, DesktopPage } from "../shell/DesktopChrome"
import BottomSheet from "../ui/BottomSheet"
import Icon from "../ui/Icon"
import { useIsDesktop } from "../ui/hooks"
import { BackButton } from "../cart/CartScreen"

const rupees = (n) => `₹${Math.round(Number(n) || 0)}`
const FILTERS = ["All Orders", "Ongoing", "Delivered", "Cancelled"]
const LABELS = {
  pending_payment: "Awaiting payment",
  created: "Order placed",
  confirmed: "Confirmed",
  preparing: "Preparing your food",
  ready_for_pickup: "Ready for pickup",
  reached_pickup: "Rider at restaurant",
  picked_up: "On the way",
  reached_drop: "Rider has arrived",
  delivered: "Delivered",
  cancelled_by_user: "Cancelled by you",
  cancelled_by_restaurant: "Cancelled by restaurant",
  cancelled_by_admin: "Cancelled",
}

/** The fields the list draws, from GET /food/orders. */
function toOrder(o) {
  const status = String(o.orderStatus || o.status || "").toLowerCase()
  const rest = o.restaurantId && typeof o.restaurantId === "object" ? o.restaurantId : o.restaurant || {}
  const img = rest.profileImage?.url || rest.profileImage || ""
  const items = Array.isArray(o.items) ? o.items : []
  const pricing = o.pricing || {}
  return {
    id: String(o._id || o.id),
    number: o.orderId || o.order_id || "",
    status,
    label: LABELS[status] || status.replace(/_/g, " "),
    delivered: status === "delivered",
    cancelled: status.startsWith("cancelled"),
    active: !["delivered", "pending_payment"].includes(status) && !status.startsWith("cancelled"),
    restaurantId: String(rest._id || rest.id || o.restaurantId || ""),
    restaurantSlug: rest.slug || "",
    restaurantName: rest.restaurantName || rest.name || o.restaurantName || "Restaurant",
    image: img ? resolveMediaUrl(img) : "",
    items,
    itemNames: items.map((i) => i.name || i.foodName).filter(Boolean).join(", ") || "Food Items",
    itemCount: items.reduce((s, i) => s + (Number(i.quantity) || 1), 0),
    total: Number(pricing.total ?? o.total) || 0,
    saved: (Number(pricing.discount ?? o.discount) || 0) + (Number(pricing.rewardDiscount) || 0),
    createdAt: o.createdAt ? new Date(o.createdAt) : null,
    deliveredAt: o.deliveredAt ? new Date(o.deliveredAt) : null,
    rating: Number(o.ratings?.restaurant?.rating) || 0,
    hasRider: Boolean(o.deliveryPartnerId || o.deliveryPartnerName || o.dispatch?.deliveryPartnerId),
    raw: o,
  }
}

const time = (d) => (d ? d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }) : "")
function groupLabel(d) {
  if (!d) return "Earlier"
  const day = new Date(d)
  day.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today - day) / 86400000)
  if (diff === 0) return "Today"
  if (diff === 1) return "Yesterday"
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function StatusChip({ order }) {
  const s = order.delivered
    ? { bg: "#DCFCE7", fg: "#15803D", icon: "check_circle" }
    : order.cancelled
      ? { bg: "#FEE2E2", fg: "#B91C1C", icon: "cancel" }
      : { bg: "var(--ca-primary-tint)", fg: "var(--ca-primary)", icon: "two_wheeler" }
  return (
    <span className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-black capitalize" style={{ background: s.bg, color: s.fg }}>
      <Icon name={s.icon} size={12} />
      {order.label}
    </span>
  )
}

function Stars({ value, onChange, size = 30 }) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => onChange(n)}>
          <Icon name="star" outlined={n > value} size={size} color={n <= value ? "#F59E0B" : "#CBD5E1"} />
        </button>
      ))}
    </div>
  )
}

function RateSheet({ order, onClose, onDone }) {
  const [food, setFood] = useState(0)
  const [rider, setRider] = useState(0)
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setFood(0)
    setRider(0)
    setComment("")
  }, [order])
  const submit = async () => {
    if (!food) return toast.error("Rate the food first")
    if (order.hasRider && !rider) return toast.error("Rate the delivery too")
    setBusy(true)
    try {
      await orderAPI.submitOrderRatings(order.id, {
        restaurantRating: food,
        ...(comment.trim() ? { restaurantComment: comment.trim() } : {}),
        ...(order.hasRider ? { deliveryPartnerRating: rider } : {}),
      })
      toast.success("Thanks for rating!")
      onDone()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Couldn't submit your rating.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <BottomSheet open={Boolean(order)} onClose={onClose}>
      {order && (
        <div className="px-5 pb-5 pt-2">
          <h2 className="text-lg font-extrabold text-[#0F172A]">Rate your order</h2>
          <p className="text-[13px] text-[#64748B]">{order.restaurantName}</p>
          <p className="mt-4 text-sm font-bold text-[#0F172A]">How was the food?</p>
          <div className="mt-2"><Stars value={food} onChange={setFood} /></div>
          {order.hasRider && (
            <>
              <p className="mt-4 text-sm font-bold text-[#0F172A]">How was the delivery?</p>
              <div className="mt-2"><Stars value={rider} onChange={setRider} /></div>
            </>
          )}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 300))}
            rows={2}
            placeholder="Tell us more (optional)"
            className="mt-4 w-full resize-none rounded-2xl border border-[#E2E8F0] px-4 py-3 text-sm outline-none focus:border-[var(--ca-primary)]"
          />
          <button type="button" onClick={submit} disabled={busy} className="mt-4 h-12 w-full rounded-[14px] text-[15px] font-bold text-white disabled:opacity-60" style={{ background: "var(--ca-primary)" }}>
            {busy ? "Submitting…" : "Submit Rating"}
          </button>
        </div>
      )}
    </BottomSheet>
  )
}

function OrderCard({ order, onOpen, onRate, onReorder, reordering }) {
  return (
    <div role="button" tabIndex={0} onClick={() => onOpen(order)} className="cursor-pointer rounded-2xl border border-[#E2E8F0] bg-white p-3" style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
      <div className="flex gap-3">
        <span className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[14px] bg-[#F1F5F9]">
          {order.image ? <img src={order.image} alt="" loading="lazy" className="h-full w-full object-cover" /> : (
            <span className="flex h-full w-full items-center justify-center"><Icon name="restaurant" size={28} color="#CBD5E1" /></span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-black text-[#0F172A]">{order.restaurantName}</p>
          <p className="truncate text-[10.5px] font-medium text-[#64748B]">{order.itemNames}</p>
          {order.number && <p className="mt-0.5 text-[11px] font-extrabold text-[#334155]">{order.number}</p>}
          <p className="mt-0.5 text-[9.5px] font-medium text-[#94A3B8]">
            {time(order.createdAt)} • {order.itemCount} {order.itemCount === 1 ? "Item" : "Items"} • {rupees(order.total)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <StatusChip order={order} />
          <span className="mt-2 flex items-center text-right text-[9.5px] leading-[1.1] text-[#64748B]">
            <span>
              {order.delivered ? <>Delivered on<br />{time(order.deliveredAt || order.createdAt)}</> : order.cancelled ? <>Cancelled on<br />{time(order.createdAt)}</> : time(order.createdAt)}
            </span>
            <Icon name="chevron_right" size={16} color="#94A3B8" />
          </span>
        </div>
      </div>
      <div className="my-2 h-px bg-[#F1F5F9]" />
      {order.delivered && !order.rating && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRate(order)
          }}
          className="mb-2 flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[12.5px] font-extrabold text-[#15803D]"
          style={{ background: "#EFFCF6", borderColor: "rgba(22,163,74,0.25)" }}
        >
          <Icon name="star" size={18} color="#16A34A" />
          <span className="flex-1">Rate your food &amp; delivery experience</span>
          <Icon name="chevron_right" size={18} />
        </button>
      )}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-[10.5px] text-[#64748B]">
          {order.rating > 0 && (
            <>
              You rated
              <Icon name="star" size={12} color="var(--ca-primary)" />
              <b className="text-[11px] font-black" style={{ color: "var(--ca-primary)" }}>{order.rating}</b>
            </>
          )}
        </span>
        {(order.delivered || order.cancelled) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onReorder(order)
            }}
            disabled={reordering}
            className="flex items-center gap-1 rounded-[10px] bg-white px-3 py-[5px] text-[11px] font-black disabled:opacity-60"
            style={{ border: "1.2px solid var(--ca-primary)", color: "var(--ca-primary)" }}
          >
            <Icon name="autorenew" size={13} />
            Reorder
          </button>
        )}
      </div>
    </div>
  )
}

/** Orders tab (orders_screen.dart). */
export default function OrdersScreen() {
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()
  const { cart, replaceCart } = useCart()
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState("")
  const [filter, setFilter] = useState("All Orders")
  const [rating, setRating] = useState(null)
  const [reorderingId, setReorderingId] = useState("")

  const load = useCallback(async () => {
    try {
      const res = await orderAPI.getOrders({ page: 1, limit: 50 })
      const list = res?.data?.data?.orders || res?.data?.orders || []
      setOrders((Array.isArray(list) ? list : []).map(toOrder))
      setError("")
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't load your orders")
    }
  }, [])

  useEffect(() => {
    load()
    // Live orders move through statuses; keep the list current.
    const t = setInterval(() => !document.hidden && load(), 20000)
    return () => clearInterval(t)
  }, [load])

  const shown = useMemo(() => {
    const list = orders || []
    if (filter === "Ongoing") return list.filter((o) => o.active)
    if (filter === "Delivered") return list.filter((o) => o.delivered)
    if (filter === "Cancelled") return list.filter((o) => o.cancelled)
    return list
  }, [orders, filter])

  const groups = useMemo(() => {
    const m = new Map()
    for (const o of shown) {
      const k = groupLabel(o.createdAt)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(o)
    }
    return [...m.entries()]
  }, [shown])
  const saved = (orders || []).reduce((s, o) => s + o.saved, 0)

  const open = (o) => navigate(o.active ? `/food/user/orders/${o.id}` : `/food/user/orders/${o.id}/details`)

  const reorder = (o) => {
    if (!o.items.length) return toast.error("This order has no items to reorder.")
    const other = (cart || []).length && String(cart[0]?.restaurantId) !== o.restaurantId
    if (other && !window.confirm("Your cart has items from another restaurant. Replace them with this order?")) return
    setReorderingId(o.id)
    const lines = o.items.map((i) => {
      const itemId = String(i.itemId || i.foodId || i._id || i.id || "")
      const variantId = String(i.variantId || "")
      const id = buildCartLineId(itemId, variantId)
      return {
        id,
        lineItemId: id,
        itemId,
        name: i.name || i.foodName,
        price: Number(i.price ?? i.unitPrice) || 0,
        variantId,
        variantName: i.variantName || "",
        variantPrice: Number(i.price ?? i.unitPrice) || 0,
        image: i.image ? resolveMediaUrl(i.image) : "",
        restaurant: o.restaurantName,
        restaurantId: o.restaurantId,
        isVeg: i.isVeg !== false,
        quantity: Number(i.quantity) || 1,
      }
    })
    replaceCart(lines)
    setReorderingId("")
    toast.success("Items added to cart")
    navigate("/food/user/cart")
  }

  const empty = (title, message, button, onClick) => (
    <div className="flex flex-col items-center px-8 py-16 text-center">
      <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full" style={{ background: "rgba(245,74,0,0.1)" }}>
        <Icon name="receipt_long" size={28} color="var(--ca-primary)" />
      </span>
      <p className="mt-3.5 text-base font-extrabold text-[#0F172A]">{title}</p>
      <p className="mt-1.5 text-[12.5px] text-[#64748B]">{message}</p>
      {button && (
        <button type="button" onClick={onClick} className="mt-4 rounded-xl px-6 py-3 text-[13px] font-extrabold text-white" style={{ background: "var(--ca-primary)" }}>
          {button}
        </button>
      )}
    </div>
  )

  const pills = (
    <div className="ca-noscroll flex gap-2 overflow-x-auto">
      {FILTERS.map((f) => {
        const on = f === filter
        return (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className="shrink-0 rounded-2xl border px-3.5 py-2 text-xs"
            style={{ background: on ? "var(--ca-primary)" : "#fff", borderColor: on ? "var(--ca-primary)" : "#E2E8F0", color: on ? "#fff" : "#64748B", fontWeight: on ? 800 : 600 }}
          >
            {f}
          </button>
        )
      })}
    </div>
  )

  const body =
    orders == null && !error ? (
      <div className="flex justify-center py-16">
        <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#E2E8F0] border-t-[var(--ca-primary)]" />
      </div>
    ) : error && !orders ? (
      empty("Couldn't load your orders", error, "Retry", load)
    ) : !shown.length ? (
      filter === "All Orders"
        ? empty("No orders yet", "Your order history will show up here once you place an order.", "Browse Restaurants", () => navigate("/home"))
        : empty("No orders in this status", "Try selecting a different order status filter.")
    ) : (
      <>
        {saved > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl p-3" style={{ background: "var(--ca-primary-tint)", border: "1px solid rgba(245,74,0,0.2)" }}>
            <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px]" style={{ background: "rgba(245,74,0,0.15)" }}>
              <Icon name="shopping_bag" outlined size={20} color="var(--ca-primary)" />
            </span>
            <span>
              <span className="block text-[13px] font-black text-[#0F172A]">You&apos;ve saved {rupees(saved)} so far!</span>
              <span className="block text-[10.5px] font-medium text-[#64748B]">Thanks for choosing Craviox ❤️</span>
            </span>
          </div>
        )}
        {groups.map(([label, list]) => (
          <div key={label} className="mb-1.5">
            <h2 className="mb-2.5 text-sm font-black text-[#0F172A]">{label}</h2>
            <div className={isDesktop ? "grid grid-cols-2 gap-3" : "space-y-3"}>
              {list.map((o) => (
                <OrderCard key={o.id} order={o} onOpen={open} onRate={setRating} onReorder={reorder} reordering={reorderingId === o.id} />
              ))}
            </div>
          </div>
        ))}
        <div className="mt-4 flex items-center rounded-[18px] p-3.5" style={{ background: "var(--ca-primary-tint)", border: "1px solid rgba(245,74,0,0.2)" }}>
          <span className="flex-1 text-center">
            <span className="block text-[12.5px] font-black text-[#0F172A]">That&apos;s all your orders!</span>
            <span className="block text-[10.5px] text-[#64748B]">You&apos;ve reached the end of your order history.</span>
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "rgba(245,74,0,0.15)" }}>
            <Icon name="shopping_bag" outlined size={18} color="var(--ca-primary)" />
          </span>
        </div>
      </>
    )

  const sheet = (
    <RateSheet
      order={rating}
      onClose={() => setRating(null)}
      onDone={() => {
        setRating(null)
        load()
      }}
    />
  )

  if (isDesktop) {
    return (
      <DesktopPage>
        <div className={`${CONTENT} pb-20 pt-8`}>
          <div className="mb-5 flex items-center justify-between">
            <h1 className="text-[28px] font-black tracking-[-0.5px] text-[var(--ca-ink)]">Order History</h1>
          </div>
          <div className="mb-5">{pills}</div>
          {body}
        </div>
        {sheet}
      </DesktopPage>
    )
  }

  return (
    <AppShell>
      <div className="min-h-[100dvh]" style={{ background: "var(--ca-bg)" }}>
        <header className="flex items-center px-4 py-2.5 pt-[calc(10px+env(safe-area-inset-top,0px))]">
          <BackButton />
          <h1 className="flex-1 text-center text-lg font-black tracking-[-0.3px] text-[#0F172A]">Order History</h1>
          <button type="button" aria-label="Search" onClick={() => navigate("/food/user/search")} className="flex h-[38px] w-[38px] items-center justify-center">
            <Icon name="search" size={22} color="var(--ca-primary)" />
          </button>
        </header>
        <div className="mt-2 px-4">{pills}</div>
        <div className="px-4 pb-8 pt-3">{body}</div>
      </div>
      {sheet}
    </AppShell>
  )
}
