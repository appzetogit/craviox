import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { restaurantAPI } from "@food/api"
import { useCart } from "@food/context/CartContext"
import { registerWebPushForCurrentModule } from "@food/utils/firebaseMessaging"
import AppShell from "../shell/AppShell"
import { CONTENT, DesktopPage } from "../shell/DesktopChrome"
import Icon from "../ui/Icon"
import { useIsDesktop } from "../ui/hooks"
import { BackButton } from "../cart/CartScreen"
import { checkoutStore } from "../data/checkoutStore"

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "")
const THEMES = [
  { main: "#16A34A", tag: "#DCFCE7", panel: "#F0FDF4" },
  { main: "#EA580C", tag: "#FFEDD5", panel: "#FFF7ED" },
  { main: "#7C3AED", tag: "#EDE9FE", panel: "#F5F3FF" },
]
const CATEGORIES = [
  ["all", "All Offers", "local_offer"],
  ["first", "New User", "person"],
  ["flat", "Flat Off", "sell"],
  ["percent", "% Off", "percent"],
  ["bank", "Bank Offers", "credit_card"],
]

function toOffer(o) {
  const pct = o.discountType === "percentage"
  const value = Number(o.discountValue) || 0
  return {
    code: String(o.couponCode || o.code || "").toUpperCase(),
    headline: String(o.headline || o.title || "").trim() || (pct ? `${value}% OFF` : `Flat ₹${value} OFF`),
    conditions: (Array.isArray(o.conditions) ? o.conditions : []).map((c) => String(c).trim()).filter(Boolean),
    pct,
    value,
    firstOrder: o.isFirstOrderOnly === true || o.customerScope === "first-time" || o.customerScope === "first_time",
    endDate: o.endDate || null,
    restaurant: o.restaurantScope === "selected" ? o.restaurantName || "Selected restaurants" : "All restaurants",
  }
}

async function copy(code) {
  try {
    await navigator.clipboard.writeText(code)
    toast.success(`Code ${code} copied!`)
  } catch {
    toast(`Code: ${code}`)
  }
}

function DashedCode({ code, color }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        copy(code)
      }}
      className="flex w-full items-center justify-between gap-2 rounded-md border border-dashed bg-white px-2 py-1.5"
      style={{ borderColor: `${color}66` }}
    >
      <span className="truncate text-[11px] font-black" style={{ color }}>{code}</span>
      <span className="text-[9.5px] font-black" style={{ color }}>COPY</span>
    </button>
  )
}

/** Offers tab (all_offers_screen.dart). */
export default function OffersScreen() {
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()
  const { cart } = useCart()
  const [offers, setOffers] = useState(null)
  const [cat, setCat] = useState("all")
  const [notif, setNotif] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported")

  useEffect(() => {
    restaurantAPI
      .getPublicOffers({}, { suppressErrorToast: true })
      .then((res) => setOffers((res?.data?.data?.allOffers || []).map(toOffer).filter((o) => o.code)))
      .catch(() => setOffers([]))
  }, [])

  const filtered = useMemo(() => {
    const list = offers || []
    if (cat === "first") return list.filter((o) => o.firstOrder)
    if (cat === "flat") return list.filter((o) => !o.pct)
    if (cat === "percent") return list.filter((o) => o.pct)
    if (cat === "bank") return list.filter((o) => o.code.includes("BANK"))
    return list
  }, [offers, cat])

  const apply = (o) => {
    if (!(cart || []).length) {
      toast(`Add items to your cart before applying ${o.code}`)
      return
    }
    checkoutStore.set({ couponCode: o.code, couponAuto: false })
    toast.success(`Applying ${o.code} to your cart…`)
    navigate("/food/user/cart")
  }

  const enableNotifications = async () => {
    if (typeof Notification === "undefined") return toast.error("This browser doesn't support notifications.")
    const p = await Notification.requestPermission().catch(() => "denied")
    setNotif(p)
    if (p === "granted") {
      await registerWebPushForCurrentModule("/food/user", { force: true }).catch(() => {})
      toast.success("You'll hear about new offers first!")
    } else {
      toast.error("Notifications are blocked. Allow them from the lock icon in the address bar.")
    }
  }

  const best = (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-black text-[#0F172A]">Best Offers for You 🎉</h2>
      </div>
      {offers == null ? (
        <div className="flex justify-center py-8">
          <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-[#E2E8F0] border-t-[var(--ca-primary)]" />
        </div>
      ) : !offers.length ? (
        <p className="text-[12.5px] font-semibold text-[#64748B]">No offers available right now</p>
      ) : (
        <div className={isDesktop ? "grid grid-cols-5 gap-3" : "ca-noscroll flex gap-2.5 overflow-x-auto pb-1"}>
          {offers.slice(0, isDesktop ? 5 : 10).map((o) => {
            const bank = o.code.includes("BANK")
            const t = bank ? { main: "#EA580C", tag: "#FFEDD5", card: "#FFF7ED", label: "BANK OFFER" } : { main: "#16A34A", tag: "#DCFCE7", card: "#F0FDF4", label: "SPECIAL" }
            return (
              <div
                key={o.code}
                role="button"
                tabIndex={0}
                onClick={() => apply(o)}
                className={`flex h-[195px] cursor-pointer flex-col rounded-[18px] border p-3 ${isDesktop ? "" : "w-[138px] shrink-0"}`}
                style={{ background: t.card, borderColor: `${t.main}40` }}
              >
                <span className="w-fit rounded px-1.5 py-0.5 text-[8.5px] font-black" style={{ background: t.tag, color: t.main }}>{t.label}</span>
                <span className="mt-2 line-clamp-2 text-[17px] font-black leading-[1.1]" style={{ color: t.main }}>{o.headline}</span>
                <span className="mt-1.5 line-clamp-2 text-[10px] font-medium text-[#64748B]">{o.conditions.join(" · ") || o.restaurant}</span>
                <span className="flex-1" />
                <DashedCode code={o.code} color={t.main} />
                <span className="mt-1.5 text-[9.5px] text-[#64748B]">{o.endDate ? `Valid till ${fmtDate(o.endDate)}` : "No expiry"}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const categories = (
    <div>
      <h2 className="mb-3 text-base font-black text-[#0F172A]">Top Coupon Categories</h2>
      <div className={`grid gap-2 ${isDesktop ? "grid-cols-5 max-w-[640px]" : "grid-cols-5"}`}>
        {CATEGORIES.map(([key, label, icon]) => {
          const on = cat === key
          return (
            <button key={key} type="button" onClick={() => setCat(key)} className="flex flex-col items-center">
              <span
                className="flex h-[52px] w-[52px] items-center justify-center rounded-[14px]"
                style={{ background: on ? "var(--ca-primary-tint)" : "#fff", border: on ? "1.5px solid var(--ca-primary)" : "1px solid #E2E8F0" }}
              >
                <Icon name={icon} outlined size={22} color={on ? "var(--ca-primary)" : "#475569"} />
              </span>
              <span className="mt-1 text-center text-[10px] leading-tight" style={{ fontWeight: on ? 900 : 600, color: on ? "var(--ca-primary)" : "#475569" }}>{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )

  const more = (
    <div>
      <h2 className="mb-3 text-base font-black text-[#0F172A]">More Savings for You</h2>
      {offers != null && !filtered.length ? (
        <p className="text-[12.5px] font-semibold text-[#64748B]">No offers in this category right now</p>
      ) : (
        <div className={isDesktop ? "grid grid-cols-2 gap-3" : "space-y-3"}>
          {filtered.map((o, i) => {
            const t = THEMES[i % 3]
            return (
              <div key={o.code} role="button" tabIndex={0} onClick={() => apply(o)} className="relative flex min-h-[92px] cursor-pointer overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
                <span className="flex w-[75px] shrink-0 items-center justify-center text-center text-base font-black leading-[1.1]" style={{ background: t.panel, color: t.main }}>
                  {o.pct ? `${o.value}%` : `₹${o.value}`}
                  <br />
                  OFF
                </span>
                <span className="pointer-events-none absolute left-[69px] top-[-6px] h-3 w-3 rounded-full border border-[#E2E8F0] bg-white" />
                <span className="pointer-events-none absolute bottom-[-6px] left-[69px] h-3 w-3 rounded-full border border-[#E2E8F0] bg-white" />
                <span className="border-l-[1.2px] border-dashed" style={{ borderColor: `${t.main}66` }} />
                <span className="min-w-0 flex-1 px-3 py-2">
                  <span className="inline-block rounded px-1 py-[1.5px] text-[8.5px] font-black" style={{ background: t.tag, color: t.main }}>
                    {o.firstOrder ? "FIRST ORDER" : "ALL USERS"}
                  </span>
                  <span className="mt-0.5 block truncate text-[13.5px] font-black text-[#0F172A]">{o.headline}</span>
                  <span className="block truncate text-[10.5px] text-[#64748B]">{o.conditions.join(" · ") || o.restaurant}</span>
                </span>
                <span className="flex w-[108px] shrink-0 flex-col justify-center gap-1 py-2 pr-3">
                  <DashedCode code={o.code} color={t.main} />
                  <span className="text-[9px] text-[#64748B]">{o.endDate ? `Valid till ${fmtDate(o.endDate)}` : "No expiry"}</span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const notifBanner =
    notif === "granted" || notif === "unsupported" ? null : (
      <div className="flex items-center gap-3 rounded-2xl border border-[#DCFCE7] bg-[#F0FDF4] p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(245,74,0,0.12)" }}>
          <Icon name="percent" size={18} color="var(--ca-primary)" />
        </span>
        <span className="flex-1">
          <span className="block text-[12.5px] font-black text-[#0F172A]">Want more exclusive offers?</span>
          <span className="block text-[10.5px] text-[#64748B]">Enable notifications and never miss a deal!</span>
        </span>
        <button type="button" onClick={enableNotifications} className="rounded-[10px] bg-white px-3 py-1.5 text-[11px] font-black" style={{ border: "1.2px solid var(--ca-primary)", color: "var(--ca-primary)" }}>
          Enable Now
        </button>
      </div>
    )

  const trust = (
    <div className="grid grid-cols-3 gap-2">
      {[
        ["percent", "Extra Savings", "Best deals & offers"],
        ["verified_user", "Secure Payments", "100% safe & secure"],
        ["savings", "Save More", "On every order"],
      ].map(([icon, title, sub]) => (
        <div key={title} className="rounded-xl border border-[#E2E8F0] bg-white px-2 py-1.5 text-center">
          <Icon name={icon} outlined size={18} color="var(--ca-primary)" />
          <p className="text-[10px] font-black text-[#0F172A]">{title}</p>
          <p className="text-[8.5px] text-[#64748B]">{sub}</p>
        </div>
      ))}
    </div>
  )

  const myCoupons = (
    <button
      type="button"
      onClick={() => navigate("/food/user/profile/coupons")}
      className="flex items-center gap-1 rounded-xl border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-extrabold text-[#0F172A]"
      style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.03)" }}
    >
      <Icon name="confirmation_number" outlined size={14} color="var(--ca-primary)" />
      My Coupons
    </button>
  )

  if (isDesktop) {
    return (
      <DesktopPage>
        <div className={`${CONTENT} space-y-8 pb-20 pt-8`}>
          <div className="flex items-center justify-between">
            <h1 className="text-[28px] font-black tracking-[-0.5px] text-[var(--ca-ink)]">Offers &amp; Coupons</h1>
            {myCoupons}
          </div>
          {best}
          {categories}
          {more}
          {notifBanner}
          <div className="max-w-[520px]">{trust}</div>
        </div>
      </DesktopPage>
    )
  }

  return (
    <AppShell>
      <div className="min-h-[100dvh]" style={{ background: "var(--ca-bg)" }}>
        <header className="flex items-center gap-3.5 px-4 py-3 pt-[calc(12px+env(safe-area-inset-top,0px))]">
          <BackButton tinted={false} />
          <h1 className="flex-1 text-xl font-black tracking-[-0.4px] text-[#0F172A]">Offers &amp; Coupons</h1>
          {myCoupons}
        </header>
        <div className="space-y-6 px-4 pb-8 pt-3">
          {best}
          {categories}
          {more}
          {notifBanner}
          {trust}
        </div>
      </div>
    </AppShell>
  )
}
