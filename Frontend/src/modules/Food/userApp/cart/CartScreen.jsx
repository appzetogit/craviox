import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { restaurantAPI } from "@food/api"
import { useCart } from "@food/context/CartContext"
import { useProfile } from "@food/context/ProfileContext"
import { getUserRestaurantDistance, normalizeRestaurantLocation } from "@food/utils/geo"
import AppShell from "../shell/AppShell"
import Icon from "../ui/Icon"
import CouponSheet from "./CouponSheet"
import { VegMark } from "../restaurant/DishParts"
import { formatFullAddress, useCheckout } from "../data/useCheckout"
import { toDish } from "../data/restaurantPage"
import { useDishCart } from "../data/useDishCart"

const rupees = (n) => `₹${Math.round(Number(n) || 0)}`
const money = (v, calculating) => (v == null ? (calculating ? "…" : "—") : rupees(v))

export function BackButton({ to = "/home", tinted = true }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(to))}
      className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full"
      style={{ background: tinted ? "rgba(245,74,0,0.12)" : "var(--ca-primary-tint)" }}
    >
      <Icon name="arrow_back" size={20} color="var(--ca-primary)" />
    </button>
  )
}

function FreeDeliveryCard({ threshold, subtotal }) {
  const needed = Math.min(Math.max(threshold - subtotal, 0), threshold)
  const progress = Math.min(Math.max(subtotal / threshold, 0), 1)
  const unlocked = needed <= 0
  return (
    <div className="mb-3.5 rounded-2xl p-3" style={{ background: "var(--ca-primary-tint)", border: "1px solid rgba(245,74,0,0.2)" }}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(245,74,0,0.15)" }}>
          <Icon name="two_wheeler" size={20} color="var(--ca-primary)" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11.5px] font-semibold text-[#0F172A]">{unlocked ? "You unlocked" : `Add items worth ${rupees(needed)} more to get`}</span>
          <span className="block text-[12.5px] font-black" style={{ color: "var(--ca-primary)" }}>FREE DELIVERY</span>
        </span>
        <span className="text-[11.5px] font-extrabold text-[#0F172A]">{unlocked ? "Unlocked 🎉" : `${rupees(needed)} to go`}</span>
      </div>
      <div className="mt-2.5 h-1 overflow-hidden rounded bg-[#CBD5E1]">
        <div className="h-full rounded" style={{ width: `${progress * 100}%`, background: "var(--ca-primary)" }} />
      </div>
    </div>
  )
}

function CartLine({ line, onOpen }) {
  const { updateQuantity, removeFromCart } = useCart()
  const q = Number(line.quantity) || 1
  const isAddon = !String(line.id || "").includes("::")
  const subtitle = line.variantName || line.description || (isAddon ? "(Add-on)" : "")
  return (
    <div
      role={isAddon ? undefined : "button"}
      tabIndex={isAddon ? undefined : 0}
      onClick={isAddon ? undefined : onOpen}
      className={`flex items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-white p-2.5 ${isAddon ? "" : "cursor-pointer"}`}
      style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}
    >
      <span className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-[#F1F5F9]">
        {line.image ? <img src={line.image} alt="" className="h-full w-full object-cover" /> : (
          <span className="flex h-full w-full items-center justify-center"><Icon name="restaurant" size={28} color="#CBD5E1" /></span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          <VegMark veg={line.isVeg !== false} />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-extrabold text-[#0F172A]">{line.name}</span>
        </span>
        {subtitle && <span className="mt-0.5 truncate text-[11px] font-medium text-[#64748B]">{subtitle}</span>}
        <span className="mt-2 flex items-center justify-between">
          <span className="text-[15px] font-black text-[#0F172A]">{rupees((Number(line.price) || 0) * q)}</span>
          <span
            className="flex h-[30px] items-center rounded-lg bg-white px-2"
            style={{ border: "1.2px solid var(--ca-primary)", color: "var(--ca-primary)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" aria-label="Remove one" onClick={() => (q <= 1 ? removeFromCart(line.id) : updateQuantity(line.id, q - 1))} className="flex">
              <Icon name="remove" size={14} />
            </button>
            <span className="px-2.5 text-[13px] font-black">{q}</span>
            <button type="button" aria-label="Add one" onClick={() => updateQuantity(line.id, q + 1)} className="flex">
              <Icon name="add" size={14} />
            </button>
          </span>
        </span>
      </span>
    </div>
  )
}

/** "You might also like": the restaurant's other dishes, not already in the cart. */
function Recommendations({ restaurantRaw, restaurantSlug, cartItemIds }) {
  const navigate = useNavigate()
  const { vegMode } = useProfile()
  const { addDish } = useDishCart(restaurantRaw)
  const [dishes, setDishes] = useState([])
  const id = restaurantRaw ? String(restaurantRaw._id || restaurantRaw.id) : ""

  useEffect(() => {
    if (!id) return undefined
    let live = true
    restaurantAPI
      .getMenuByRestaurantId(id)
      .then((res) => {
        if (!live) return
        const out = []
        for (const s of res?.data?.data?.menu?.sections || []) for (const it of s.items || []) out.push(toDish(it, s))
        setDishes(out)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [id])

  const list = useMemo(
    () => dishes.filter((d) => d.isAvailable && !cartItemIds.has(d.id) && (!vegMode || d.isVeg)).slice(0, 10),
    [dishes, cartItemIds, vegMode],
  )
  if (!list.length) return null
  const open = (d) => navigate(`/food/user/restaurants/${restaurantSlug}?dish=${d.id}`)

  return (
    <div className="mt-[18px]">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[14.5px] font-black text-[#0F172A]">
          <Icon name="auto_awesome" size={16} color="var(--ca-primary)" />
          You might also like
        </h2>
        <button type="button" onClick={() => navigate(`/food/user/restaurants/${restaurantSlug}`)} className="flex items-center text-xs font-extrabold" style={{ color: "var(--ca-primary)" }}>
          View All
          <Icon name="chevron_right" size={16} />
        </button>
      </div>
      <div className="ca-noscroll mt-2.5 flex gap-2.5 overflow-x-auto pb-1">
        {list.map((d) => (
          <div key={d.id} role="button" tabIndex={0} onClick={() => open(d)} className="w-[135px] shrink-0 cursor-pointer overflow-hidden rounded-xl border border-[#E2E8F0] bg-white" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.03)" }}>
            <span className="block h-[82px] bg-[#F1F5F9]">{d.imageUrl && <img src={d.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}</span>
            <span className="block px-[7px] py-1.5">
              <span className="block truncate text-[11px] font-extrabold text-[#0F172A]">{d.name}</span>
              <span className="mt-1 flex items-center justify-between">
                <span className="text-[11.5px] font-black text-[#0F172A]">{rupees(d.price)}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (d.variants.length > 1) open(d)
                    else addDish(d)
                  }}
                  className="flex items-center rounded-md bg-white px-[7px] py-[2.5px] text-[8.5px] font-black"
                  style={{ border: "1.1px solid var(--ca-primary)", color: "var(--ca-primary)" }}
                >
                  ADD
                  <Icon name="add" size={9} />
                </button>
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PromoBox({ checkout, onOpen }) {
  const { couponCode, appliedCode, couponError, pricing, removeCoupon } = checkout
  const attachedNotApplied = Boolean(couponCode) && !appliedCode
  const title = appliedCode ? `${appliedCode} applied` : couponCode ? `${couponCode} not applied` : "Have a promo code?"
  const subtitle = appliedCode
    ? `You saved ${rupees(pricing?.discount)}`
    : couponCode
      ? couponError || "This code is not valid for this order"
      : "Apply code & save more"
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      className="mt-[18px] flex cursor-pointer items-center gap-3 rounded-2xl border bg-white p-3"
      style={{ borderColor: attachedNotApplied ? "rgba(234,88,12,0.4)" : "#E2E8F0" }}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: "rgba(245,74,0,0.12)" }}>
        <Icon name="percent" size={18} color="var(--ca-primary)" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-extrabold text-[#0F172A]">{title}</span>
        <span className="line-clamp-2 text-[11px] font-medium" style={{ color: attachedNotApplied ? "#EA580C" : "#64748B" }}>{subtitle}</span>
      </span>
      {couponCode ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            removeCoupon()
          }}
          className="px-2 py-1.5 text-[10.5px] font-black text-[#EF4444]"
        >
          REMOVE
        </button>
      ) : (
        <span className="flex items-center rounded-xl border-[1.2px] px-2.5 py-1.5 text-[11px] font-extrabold" style={{ borderColor: "var(--ca-primary)", color: "var(--ca-primary)" }}>
          View Promocodes
          <Icon name="chevron_right" size={16} />
        </span>
      )}
    </div>
  )
}

function BillRow({ label, value, info, green }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="flex items-center gap-1 font-semibold text-[#475569]">
        {label}
        {info && <Icon name="info" outlined size={11} color="#94A3B8" />}
      </span>
      <span className="font-extrabold" style={{ color: green ? "#16A34A" : "#0F172A" }}>{value}</span>
    </div>
  )
}

/** Cart (cart_screen.dart). */
export default function CartScreen() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const checkout = useCheckout()
  const { items, restaurant, restaurantRaw, restaurantName, pricing, calculating, pricingError, subtotal, address, hasAddress, authed } = checkout
  const [couponOpen, setCouponOpen] = useState(false)
  const totalQty = items.reduce((s, l) => s + (Number(l.quantity) || 0), 0)
  const cartItemIds = useMemo(() => new Set(items.map((l) => String(l.itemId || String(l.id).split("::")[0]))), [items])
  const slug = restaurant?.slug || items[0]?.restaurantId || ""
  const distance = useMemo(() => {
    if (!restaurantRaw || !address) return null
    const c = address.location?.coordinates
    const d = c?.length === 2 ? getUserRestaurantDistance({ latitude: c[1], longitude: c[0] }, normalizeRestaurantLocation(restaurantRaw.location || restaurantRaw)) : null
    return d?.km ?? null
  }, [restaurantRaw, address])
  const threshold = Number(restaurant?.freeDeliveryAbove) || 0

  const openAddress = () => navigate("/food/user/cart/address-selector", { state: { backTo: pathname } })
  const proceed = () => (authed ? navigate("/food/user/checkout") : navigate("/food/user/auth/login", { state: { from: "/food/user/checkout" } }))
  const p = pricing

  return (
    <AppShell>
      <div className="flex min-h-[100dvh] flex-col" style={{ background: "var(--ca-bg)" }}>
        <header className="flex items-center gap-3 px-4 py-2.5 pt-[calc(10px+env(safe-area-inset-top,0px))]">
          <BackButton />
          <div className="min-w-0">
            <h1 className="text-[19px] font-black tracking-[-0.3px] text-[#0F172A]">Your Cart</h1>
            <p className="mt-px truncate text-[11.5px] font-medium text-[#64748B]">
              {totalQty} {totalQty === 1 ? "item" : "items"}
              {restaurantName && (
                <>
                  {" from "}
                  <span className="font-extrabold" style={{ color: "var(--ca-primary)" }}>{restaurantName}</span>
                </>
              )}
            </p>
          </div>
        </header>

        {!items.length ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 pb-24 text-center">
            <span className="flex h-[70px] w-[70px] items-center justify-center rounded-full" style={{ background: "rgba(245,74,0,0.1)" }}>
              <Icon name="shopping_bag" outlined size={32} color="var(--ca-primary)" />
            </span>
            <p className="mt-4 text-[17px] font-extrabold text-[#0F172A]">Your cart is empty</p>
            <p className="mt-1.5 text-[13px] text-[#64748B]">Add dishes from a restaurant to get started.</p>
            <button type="button" onClick={() => navigate("/home")} className="mt-5 rounded-xl px-7 py-3 font-extrabold text-white" style={{ background: "var(--ca-primary)" }}>
              Browse restaurants
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 px-4 pb-6 pt-2">
              {threshold > 0 && <FreeDeliveryCard threshold={threshold} subtotal={subtotal} />}
              <div className="space-y-2.5">
                {items.map((l) => (
                  <CartLine key={l.id} line={l} onOpen={() => navigate(`/food/user/restaurants/${slug}?dish=${l.itemId || String(l.id).split("::")[0]}`)} />
                ))}
              </div>
              <Recommendations restaurantRaw={restaurantRaw} restaurantSlug={slug} cartItemIds={cartItemIds} />
              <PromoBox checkout={checkout} onOpen={() => setCouponOpen(true)} />

              <div className="mt-[18px] flex rounded-[20px] border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
                <div className="min-w-0 flex-1">
                  <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-[10px]" style={{ background: "rgba(245,74,0,0.12)" }}>
                    <Icon name="shopping_bag" outlined size={18} color="var(--ca-primary)" />
                    <span className="absolute -right-[3px] -top-[3px] flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] border-white text-[8.5px] font-bold text-white" style={{ background: "var(--ca-primary)" }}>
                      {totalQty}
                    </span>
                  </span>
                  <div className="mt-2 space-y-[3px]">
                    <BillRow label="Item Total" value={rupees(p?.subtotal ?? subtotal)} />
                    <BillRow label="Delivery Fee" info value={p ? (Number(p.deliveryFee) > 0 ? rupees(Number(p.deliveryFee) + (Number(p.deliveryFeeGst) || 0)) : "FREE") : money(null, calculating)} green={p && !(Number(p.deliveryFee) > 0)} />
                    {Number(p?.packagingFee) > 0 && <BillRow label="Packaging Fee" value={rupees(p.packagingFee)} />}
                    {Number(p?.platformFee) > 0 && <BillRow label="Platform Fee" value={rupees(p.platformFee)} />}
                    {Number(p?.tax) > 0 && <BillRow label="GST & Charges" value={rupees(p.tax)} />}
                    {Number(p?.discount) > 0 && <BillRow label="Discount" value={`-${rupees(p.discount)}`} green />}
                  </div>
                  <div className="my-2 h-px bg-[#CBD5E1]" />
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-black" style={{ color: "var(--ca-primary)" }}>To Pay</span>
                    <span className="text-[17px] font-black" style={{ color: "var(--ca-primary)" }}>{money(p?.total, calculating)}</span>
                  </div>
                  {!p && !calculating && (pricingError || !hasAddress || !authed) && (
                    <p className="mt-2 flex items-start gap-1 text-[10.5px] font-semibold text-[#7C2D12]">
                      <Icon name="error" outlined size={14} color="#EA580C" />
                      <span className="flex-1">
                        {!authed ? "Sign in to see your bill." : !hasAddress ? "Add a delivery address to see your bill." : pricingError}
                      </span>
                      {authed && hasAddress && (
                        <button type="button" onClick={() => checkout.recalculate()} className="font-black" style={{ color: "var(--ca-primary)" }}>
                          RETRY
                        </button>
                      )}
                    </p>
                  )}
                </div>
                <div className="mx-2.5 w-px self-stretch bg-[#E2E8F0]" />
                <div className="w-[125px] shrink-0">
                  <button type="button" onClick={openAddress} className="w-full rounded-[10px] border border-[#E2E8F0] bg-white px-2 py-1.5 text-left">
                    <span className="flex items-start gap-1.5">
                      <Icon name="two_wheeler" size={16} color="var(--ca-primary)" />
                      <span className="min-w-0">
                        <span className="block text-[9px] font-semibold text-[#64748B]">Deliver to</span>
                        <span className="flex items-center text-[11px] font-extrabold text-[#0F172A]">
                          <span className="truncate">{address?.label || (hasAddress ? "Current location" : "Select address")}</span>
                          <Icon name="keyboard_arrow_down" size={14} />
                        </span>
                      </span>
                    </span>
                    {hasAddress && <span className="mt-0.5 line-clamp-3 text-[9.5px] leading-[1.25] text-[#64748B]">{formatFullAddress(address)}</span>}
                  </button>
                  <div className="mt-2.5 flex items-center justify-between text-[9.5px] font-bold text-[#475569]">
                    <span className="flex items-center gap-0.5"><Icon name="schedule" outlined size={13} />{restaurant?.deliveryTime || "—"}</span>
                    <span className="flex items-center gap-0.5"><Icon name="location_on" outlined size={13} />{distance != null ? `${distance.toFixed(1)} km` : "—"}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white px-4 py-2.5 pb-[calc(10px+env(safe-area-inset-bottom,0px))]" style={{ boxShadow: "0 -3px 10px rgba(0,0,0,0.06)" }}>
              <button type="button" onClick={proceed} className="flex h-12 w-full items-center justify-center rounded-[14px] text-white" style={{ background: "var(--ca-primary)" }}>
                <span className="text-[14.5px] font-black">Proceed to Checkout</span>
                <span className="mx-3 h-4 w-px bg-white/40" />
                <span className="text-[15.5px] font-black">{money(p?.total, calculating)}</span>
              </button>
            </div>
          </>
        )}
      </div>
      <CouponSheet open={couponOpen} onClose={() => setCouponOpen(false)} checkout={checkout} />
    </AppShell>
  )
}
