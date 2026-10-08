import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import AppShell from "../shell/AppShell"
import { CONTENT, DesktopPage } from "../shell/DesktopChrome"
import { useIsDesktop } from "../ui/hooks"
import BottomSheet from "../ui/BottomSheet"
import Icon from "../ui/Icon"
import CouponSheet from "./CouponSheet"
import { BackButton } from "./CartScreen"
import { formatFullAddress, useCheckout } from "../data/useCheckout"
import { checkoutStore, DELIVERY_INSTRUCTIONS } from "../data/checkoutStore"
import { formatScheduleSlot } from "../data/homeFilter"

const rupees = (n) => `₹${Math.round(Number(n) || 0)}`
const n = (v) => Number(v) || 0

function Card({ icon, title, aside, children }) {
  return (
    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: "var(--ca-primary-tint)" }}>
          <Icon name={icon} outlined={icon !== "location_on"} size={20} color="var(--ca-primary)" />
        </span>
        <h2 className="flex-1 text-base font-black text-[#0F172A]">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Row({ label, value, info, green, strike }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1 text-[13px] font-medium text-[#64748B]">
        {label}
        {info && <Icon name="info" outlined size={13} color="#94A3B8" />}
      </span>
      <span className="flex items-center gap-1.5">
        {strike && <span className="text-xs text-[#94A3B8] line-through">{strike}</span>}
        <span className="text-[13.5px] font-extrabold" style={{ color: green ? "#16A34A" : "#0F172A" }}>{value}</span>
      </span>
    </div>
  )
}

function InstructionsSheet({ open, onClose, choices }) {
  const [text, setText] = useState(choices.instruction)
  const [note, setNote] = useState(choices.note)
  useEffect(() => {
    if (open) {
      setText(choices.instruction)
      setNote(choices.note)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="px-5 pb-5 pt-2">
        <h2 className="text-lg font-extrabold text-[#0F172A]">Delivery instructions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {DELIVERY_INSTRUCTIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setText(text === p ? "" : p)}
              className="rounded-[20px] border px-3 py-[7px] text-[12.5px] font-semibold"
              style={{ background: text === p ? "var(--ca-primary)" : "#fff", color: text === p ? "#fff" : "#0F172A", borderColor: text === p ? "var(--ca-primary)" : "#E2E8F0" }}
            >
              {p}
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 200))}
          rows={2}
          placeholder="Anything the delivery partner should know?"
          className="mt-3 w-full resize-none rounded-2xl border border-[#E9ECEF] px-4 py-3 text-sm text-[#0F172A] outline-none focus:border-[var(--ca-primary)]"
        />
        <h3 className="mt-3 text-sm font-bold text-[#0F172A]">Note for the restaurant</h3>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 200))}
          rows={2}
          placeholder="e.g. less spicy, no onions"
          className="mt-2 w-full resize-none rounded-2xl border border-[#E9ECEF] px-4 py-3 text-sm text-[#0F172A] outline-none focus:border-[var(--ca-primary)]"
        />
        <label className="mt-3 flex items-center gap-2.5 text-[13.5px] font-semibold text-[#0F172A]">
          <input
            type="checkbox"
            checked={choices.sendCutlery !== false}
            onChange={(e) => checkoutStore.set({ sendCutlery: e.target.checked })}
            className="h-4 w-4 accent-[var(--ca-primary)]"
          />
          Send cutlery
        </label>
        <button
          type="button"
          onClick={() => {
            checkoutStore.set({ instruction: text.trim(), note: note.trim() })
            onClose()
          }}
          className="mt-4 h-12 w-full rounded-[14px] text-[15px] font-bold text-white"
          style={{ background: "var(--ca-primary)" }}
        >
          Save
        </button>
      </div>
    </BottomSheet>
  )
}

const PAYMENT_OPTIONS = [
  { key: "razorpay", title: "UPI, Cards & Net Banking", subtitle: "Pay easily using any UPI app or card", icon: "account_balance", badge: "Recommended" },
  { key: "wallet", title: "Craviox Wallet", icon: "account_balance_wallet" },
  { key: "cash", title: "Cash on Delivery", subtitle: "Pay in cash when your order arrives", icon: "payments" },
]

/** Checkout (checkout_screen.dart). */
export default function CheckoutScreen() {
  const navigate = useNavigate()
  const checkout = useCheckout()
  const { items, restaurant, address, hasAddress, pricing: p, calculating, pricingError, choices, walletBalance, placing, placeOrder, canPlaceOrder, scheduledAt, clearSchedule, customerName, customerPhone } = checkout
  const isDesktop = useIsDesktop()
  const [expanded, setExpanded] = useState(false)
  const [showAllPay, setShowAllPay] = useState(false)
  const [couponOpen, setCouponOpen] = useState(false)
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const totalQty = items.reduce((s, l) => s + (Number(l.quantity) || 0), 0)

  useEffect(() => {
    if (!items.length && !placing) navigate("/food/user/cart", { replace: true })
  }, [items.length, placing, navigate])

  const total = n(p?.total)
  const walletShort = walletBalance != null && p && walletBalance < total
  const pickAddress = () => navigate("/food/user/cart/address-selector", { state: { backTo: "/food/user/checkout" } })
  const membership = p?.membership
  const upsell = p?.membershipUpsell
  const label = address?.label ? String(address.label).replace(/^\w/, (c) => c.toUpperCase()) : "Home"
  const options = showAllPay ? PAYMENT_OPTIONS : PAYMENT_OPTIONS.filter((o) => o.key === choices.paymentMethod)

  const headerEl = (
        <header className="flex items-center gap-3.5 px-4 py-3 pt-[calc(12px+env(safe-area-inset-top,0px))]">
          <BackButton to="/food/user/cart" tinted={false} />
          <div>
            <h1 className="text-xl font-black tracking-[-0.4px] text-[#0F172A]">Checkout</h1>
            <p className="mt-0.5 text-xs font-medium text-[#64748B]">Review your order and place it</p>
          </div>
        </header>
  )
  const addressCard = (
    <>
          <Card
            icon="location_on"
            title="Delivery Address"
            aside={
              <button type="button" onClick={pickAddress} className="flex items-center text-[13px] font-extrabold" style={{ color: "var(--ca-primary)" }}>
                {hasAddress ? "Change" : "Add"}
                <Icon name="chevron_right" size={18} />
              </button>
            }
          >
            <div className="mt-3 pl-[46px]">
              {hasAddress ? (
                <>
                  <p className="flex items-center gap-2">
                    <span className="text-[14.5px] font-black text-[#0F172A]">{label}</span>
                    {!address?.isCurrentLocation && <span className="rounded bg-[#E0F2FE] px-1.5 py-0.5 text-[8.5px] font-black text-[#0284C7]">DEFAULT</span>}
                  </p>
                  <p className="mt-1 text-xs font-medium leading-[1.35] text-[#64748B]">{formatFullAddress(address)}</p>
                  <p className="mt-1 text-xs font-medium text-[#64748B]">{customerName}{customerPhone ? ` · ${customerPhone}` : ""}</p>
                </>
              ) : (
                <p className="text-[13px] font-semibold text-[#B91C1C]">Add a delivery address to place your order.</p>
              )}
              <button type="button" onClick={() => setInstructionsOpen(true)} className="mt-2 flex items-center gap-1 text-xs font-extrabold" style={{ color: "var(--ca-primary)" }}>
                <Icon name="edit_note" size={16} />
                {choices.instruction ? `Instructions: ${choices.instruction}` : "Add Delivery Instructions"}
              </button>
            </div>
            {hasAddress && (
              <div className="mt-3.5 flex items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ background: "var(--ca-primary-tint)", border: "1px solid rgba(245,74,0,0.15)" }}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(245,74,0,0.12)" }}>
                  <Icon name="directions_bike" size={18} color="var(--ca-primary)" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-[#0F172A]">
                    Delivering to {label}
                    {n(p?.roadDistanceKm || p?.distanceKm) > 0 ? ` • ${n(p.roadDistanceKm || p.distanceKm).toFixed(1)} km away` : ""}
                  </span>
                  <span className="block text-xs font-extrabold" style={{ color: "var(--ca-primary)" }}>
                    {scheduledAt ? `Scheduled for ${formatScheduleSlot(scheduledAt.toISOString())}` : `Estimated delivery in ${restaurant?.deliveryTime || "25–35 mins"}`}
                  </span>
                </span>
                {scheduledAt && (
                  <button type="button" onClick={clearSchedule} className="ml-auto text-[10.5px] font-black text-[#EF4444]">
                    DELIVER NOW
                  </button>
                )}
              </div>
            )}
          </Card>

    </>
  )
  const closedNotice = (
    <>
          {!canPlaceOrder && checkout.restaurantRaw && (
            <div className="flex gap-2 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2.5 text-[12.5px] font-semibold text-[#92400E]">
              <Icon name="schedule" size={16} />
              This restaurant isn&apos;t taking orders right now. You can place the order when it reopens.
            </div>
          )}

    </>
  )
  const summaryCard = (
    <>
          <Card
            icon="shopping_bag"
            title="Order Summary"
            aside={
              <button type="button" onClick={() => setExpanded((v) => !v)} className="flex items-center text-[13px] font-extrabold" style={{ color: "var(--ca-primary)" }}>
                {totalQty} {totalQty === 1 ? "Item" : "Items"}
                <Icon name={expanded ? "keyboard_arrow_up" : "keyboard_arrow_down"} size={18} />
              </button>
            }
          >
            <div className="mt-3.5">
              {!p ? (
                calculating ? (
                  <p className="flex items-center gap-2 text-[12.5px] font-semibold text-[#64748B]">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#CBD5E1] border-t-[#64748B]" />
                    Calculating your bill...
                  </p>
                ) : (
                  <div>
                    <p className="text-[12.5px] font-semibold text-[#B91C1C]">{!hasAddress ? "Add a delivery address to see your bill." : pricingError || "Bill unavailable right now."}</p>
                    {hasAddress && (
                      <button type="button" onClick={() => checkout.recalculate()} className="mt-1.5 flex items-center gap-1 text-[12.5px] font-extrabold" style={{ color: "var(--ca-primary)" }}>
                        <Icon name="refresh" size={15} />
                        Retry
                      </button>
                    )}
                  </div>
                )
              ) : (
                <>
                  {n(p.membershipDiscount) > 0 && membership ? (
                    <div className="mb-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-[#854D0E]" style={{ background: "rgba(202,138,4,0.1)", border: "1px solid rgba(202,138,4,0.4)" }}>
                      <Icon name="workspace_premium" size={18} color="#CA8A04" />
                      {membership.planName || "Gold"} benefits applied. You save {rupees(p.membershipDiscount)} on this order
                    </div>
                  ) : upsell ? (
                    <button
                      type="button"
                      onClick={() => navigate("/food/user/membership")}
                      className="mb-3 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-[#854D0E]"
                      style={{ background: "rgba(202,138,4,0.1)", border: "1px solid rgba(202,138,4,0.4)" }}
                    >
                      <Icon name="workspace_premium" outlined size={18} color="#CA8A04" />
                      <span className="flex-1">
                        {upsell.savings ? `Save ${rupees(upsell.savings)} on this order with ${upsell.planName || "Gold"}` : `Join ${upsell.planName || "Gold"}`}
                        {upsell.price ? ` · Join for ${rupees(upsell.price)}` : ""}
                      </span>
                      <Icon name="chevron_right" size={18} />
                    </button>
                  ) : null}

                  {expanded && (
                    <div className="space-y-1.5">
                      <Row label="Item Total" value={rupees(p.subtotal)} />
                      <Row
                        label="Delivery Fee"
                        info
                        value={n(membership?.deliveryFeeWaived) > 0 ? `FREE with ${membership.planName || "Gold"}` : n(p.deliveryFee) > 0 ? rupees(p.deliveryFee) : "FREE"}
                        green={n(p.deliveryFee) <= 0 || n(membership?.deliveryFeeWaived) > 0}
                        strike={n(membership?.deliveryFeeWaived) > 0 ? rupees(membership.deliveryFeeWaived) : ""}
                      />
                      {n(p.packagingFee) > 0 && <Row label="Packaging Fee" info value={rupees(p.packagingFee)} />}
                      {n(p.deliveryFeeGst) > 0 && <Row label="Delivery GST" info value={rupees(p.deliveryFeeGst)} />}
                      {n(p.platformFee) > 0 && <Row label="Platform Fee" info value={rupees(p.platformFee)} />}
                      {n(p.tax) > 0 && <Row label={n(p.gstRate) > 0 ? `GST (${p.gstRate}%)` : "GST"} info value={rupees(p.tax)} />}
                      {n(p.discount) > 0 && <Row label="Discount" value={`-${rupees(p.discount)}`} green />}
                      {n(p.membershipDiscount) > 0 && <Row label={`${membership?.planName || "Member"} Discount`} value={`-${rupees(p.membershipDiscount)}`} green />}
                      <div className="!my-2.5 border-t border-dashed border-[#E2E8F0]" />
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black" style={{ color: "var(--ca-primary)" }}>To Pay</span>
                    <span className="text-[19px] font-black" style={{ color: "var(--ca-primary)" }}>{rupees(p.total)}</span>
                  </div>
                  {checkout.couponCode && !checkout.appliedCode && (
                    <p className="mt-2.5 flex items-center gap-1.5 rounded-[10px] border px-2.5 py-2 text-[11.5px] font-bold text-[#7C2D12]" style={{ background: "#FFF7ED", borderColor: "rgba(234,88,12,0.25)" }}>
                      <Icon name="local_offer" outlined size={14} color="#EA580C" />
                      {checkout.couponError || `${checkout.couponCode} is not valid for this order`}
                    </p>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => setCouponOpen(true)}
                className="mt-3.5 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left"
                style={{ background: "var(--ca-primary-tint)", border: "1px solid rgba(245,74,0,0.2)" }}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: "rgba(245,74,0,0.15)" }}>
                  <Icon name="percent" size={16} color="var(--ca-primary)" />
                </span>
                <span className="flex-1">
                  <span className="block text-[13px] font-black" style={{ color: "var(--ca-primary)" }}>
                    {checkout.appliedCode ? `${checkout.appliedCode} applied` : "View Promocodes"}
                  </span>
                  <span className="block text-[10.5px] text-[#64748B]">
                    {checkout.appliedCode ? `You saved ${rupees(p?.discount)}` : "Apply code & save more"}
                  </span>
                </span>
                <Icon name="chevron_right" size={20} color="var(--ca-primary)" />
              </button>
            </div>
          </Card>

    </>
  )
  const paymentCard = (
    <>
          <Card
            icon="account_balance_wallet"
            title="Payment Methods"
            aside={
              <button type="button" onClick={() => setShowAllPay((v) => !v)} className="flex items-center text-[13px] font-extrabold" style={{ color: "var(--ca-primary)" }}>
                {showAllPay ? "Show Less" : "See All"}
                <Icon name={showAllPay ? "keyboard_arrow_up" : "chevron_right"} size={18} />
              </button>
            }
          >
            <div className="mt-3 space-y-2">
              {options.map((o) => {
                const on = choices.paymentMethod === o.key
                const subtitle =
                  o.key === "wallet"
                    ? walletBalance == null
                      ? "Balance unavailable"
                      : `Balance ${rupees(walletBalance)}${walletShort ? " · not enough for this order" : ""}`
                    : o.subtitle
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => {
                      checkoutStore.set({ paymentMethod: o.key })
                      setShowAllPay(false)
                    }}
                    className="flex w-full items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-left"
                    style={{ background: on ? "var(--ca-primary-tint)" : "#fff", border: on ? "1.5px solid var(--ca-primary)" : "1px solid #E2E8F0" }}
                  >
                    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.8px]" style={{ borderColor: on ? "var(--ca-primary)" : "#CBD5E1" }}>
                      {on && <span className="h-[9px] w-[9px] rounded-full" style={{ background: "var(--ca-primary)" }} />}
                    </span>
                    <Icon name={o.icon} size={20} color={on ? "var(--ca-primary)" : "#64748B"} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[13.5px] font-extrabold text-[#0F172A]">{o.title}</span>
                        {o.badge && <span className="rounded bg-[#E0F2FE] px-1.5 py-0.5 text-[8.5px] font-extrabold text-[#0284C7]">{o.badge}</span>}
                      </span>
                      <span className="block truncate text-[10.5px]" style={{ color: o.key === "wallet" && walletShort ? "#B91C1C" : "#64748B" }}>{subtitle}</span>
                    </span>
                    <Icon name={on ? "keyboard_arrow_down" : "chevron_right"} size={18} color={on ? "var(--ca-primary)" : "#94A3B8"} />
                  </button>
                )
              })}
            </div>
          </Card>

    </>
  )
  const secureCard = (
          <div className="flex items-center gap-2.5 rounded-[14px] border border-[#E2E8F0] bg-[#F8FAFC] p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(245,74,0,0.12)" }}>
              <Icon name="verified_user" size={18} color="var(--ca-primary)" />
            </span>
            <span className="flex-1">
              <span className="block text-[12.5px] font-black" style={{ color: "var(--ca-primary)" }}>100% Secure Payments</span>
              <span className="block text-[10.5px] text-[#64748B]">Your payment details are safe with us</span>
            </span>
            <span className="text-right">
              <span className="block text-[8.5px] font-extrabold text-[#475569]">Powered by Razorpay</span>
              <span className="mt-0.5 inline-block rounded-[3px] bg-[#E0F2FE] px-1 py-px text-[7.5px] font-black text-[#0284C7]">PCI DSS COMPLIANT</span>
            </span>
          </div>
  )
  const placeBar = (
    <>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold text-[#64748B]">To Pay</p>
              <p className="text-lg font-black text-[#0F172A]">{p ? rupees(p.total) : "--"}</p>
              <button type="button" onClick={() => setExpanded(true)} className="flex items-center text-[10.5px] font-extrabold" style={{ color: "var(--ca-primary)" }}>
                View Details
                <Icon name="keyboard_arrow_down" size={14} />
              </button>
            </div>
            <button
              type="button"
              onClick={placeOrder}
              disabled={placing || !p || !canPlaceOrder || walletShort && choices.paymentMethod === "wallet"}
              className="flex h-12 min-w-[150px] items-center justify-center rounded-xl px-9 text-[15px] font-black text-white disabled:opacity-60"
              style={{ background: "var(--ca-primary)" }}
            >
              {placing ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/50 border-t-white" /> : "Place Order"}
            </button>
          </div>
          {n(p?.discount) > 0 && <p className="mt-1.5 text-[10.5px] font-semibold text-[#64748B]">You will save {rupees(p.discount)} on this order</p>}
    </>
  )
  const sheets = (
    <>
      <CouponSheet open={couponOpen} onClose={() => setCouponOpen(false)} checkout={checkout} />
      <InstructionsSheet open={instructionsOpen} onClose={() => setInstructionsOpen(false)} choices={choices} />
    </>
  )

  if (isDesktop) {
    return (
      <DesktopPage>
        <div className={`${CONTENT} pb-20 pt-8`}>
          <div className="mb-5 [&_header]:p-0">{headerEl}</div>
          <div className="grid grid-cols-[1fr_420px] items-start gap-8">
            <div className="min-w-0 space-y-4">
              {addressCard}
              {closedNotice}
              {paymentCard}
              {secureCard}
            </div>
            <aside className="sticky top-24 space-y-4">
              {summaryCard}
              <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>{placeBar}</div>
            </aside>
          </div>
        </div>
        {sheets}
      </DesktopPage>
    )
  }

  return (
    <AppShell>
      <div className="flex min-h-[100dvh] flex-col" style={{ background: "var(--ca-bg)" }}>
        {headerEl}
        <div className="flex-1 space-y-4 px-4 pb-6 pt-3">
          {addressCard}
          {closedNotice}
          {summaryCard}
          {paymentCard}
          {secureCard}
        </div>
        <div className="sticky bottom-0 bg-white px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))]" style={{ boxShadow: "0 -4px 12px rgba(0,0,0,0.06)" }}>
          {placeBar}
        </div>
      </div>
      {sheets}
    </AppShell>
  )
}
