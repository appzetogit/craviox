import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, BadgeCheck, Check, Crown, Gift, IndianRupee, Loader2, Percent, Truck, Wallet, Zap } from "lucide-react"
import { toast } from "sonner"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { userAPI } from "@food/api"
import { initRazorpayPayment } from "@food/utils/razorpay"
import { useCompanyName } from "@food/hooks/useCompanyName"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"

const RUPEE = "₹"
const inr = (n) => `${RUPEE}${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
const fmtDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
const errMsg = (e, fallback) => e?.response?.data?.message || e?.description || fallback

function durationLabel(days) {
  if (days % 365 === 0) return days === 365 ? "1 year" : `${days / 365} years`
  if (days % 30 === 0) return days === 30 ? "1 month" : `${days / 30} months`
  return `${days} days`
}

function perkLines(p) {
  const lines = []
  if (p.freeDelivery) {
    let s = "Unlimited free delivery"
    if (Number(p.freeDeliveryMinOrder) > 0) s += ` on orders above ${inr(p.freeDeliveryMinOrder)}`
    if (Number(p.freeDeliveryMaxKm) > 0) s += ` (within ${p.freeDeliveryMaxKm} km)`
    lines.push({ icon: Truck, text: s })
  }
  if (Number(p.extraDiscountPercent) > 0) {
    let s = `Extra ${p.extraDiscountPercent}% off`
    if (Number(p.maxDiscountPerOrder) > 0) s += ` up to ${inr(p.maxDiscountPerOrder)}`
    s += p.stackWithCoupons ? ", even with coupons" : ""
    if (p.restaurantScope === "selected") s += " at partner restaurants"
    lines.push({ icon: Percent, text: s })
  }
  if (p.waiveSurge) lines.push({ icon: Zap, text: "No surge fee, even at peak hours" })
  if (p.waivePlatformFee) lines.push({ icon: BadgeCheck, text: "Zero platform fee" })
  if (Number(p.cashbackPercent) > 0) {
    let s = `${p.cashbackPercent}% cashback to your wallet`
    if (Number(p.maxCashbackPerOrder) > 0) s += ` (up to ${inr(p.maxCashbackPerOrder)} per order)`
    lines.push({ icon: IndianRupee, text: s })
  }
  for (const x of p.extraPerks || []) lines.push({ icon: Gift, text: x })
  return lines
}

export default function Membership() {
  const companyName = useCompanyName()
  const goBack = useAppBackNavigation()
  const [plans, setPlans] = useState([])
  const [me, setMe] = useState(null)
  const [wallet, setWallet] = useState(0)
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState(null) // `${planId}:${method}`

  const load = useCallback(async () => {
    try {
      const [p, m, w] = await Promise.all([
        userAPI.getMembershipPlans(),
        userAPI.getMyMembership(),
        userAPI.getWallet().catch(() => null),
      ])
      setPlans(p?.data?.data?.plans || [])
      setMe(m?.data?.data || null)
      const bal = Number((w?.data?.data?.wallet || w?.data?.wallet)?.balance)
      setWallet(Number.isFinite(bal) ? bal : 0)
    } catch (err) {
      toast.error(errMsg(err, "Could not load memberships"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const onActivated = (plan) => {
    toast.success(`Welcome to ${plan.name}! Your benefits are live.`)
    setBuying(null)
    load()
  }

  const buyWithWallet = async (plan) => {
    setBuying(`${plan.id}:wallet`)
    try {
      await userAPI.buyMembershipWithWallet(plan.id, `${Date.now()}`)
      onActivated(plan)
    } catch (err) {
      toast.error(errMsg(err, "Purchase failed"))
      setBuying(null)
    }
  }

  const buyWithRazorpay = async (plan) => {
    setBuying(`${plan.id}:online`)
    try {
      const res = await userAPI.createMembershipOrder(plan.id)
      const rz = res?.data?.data?.razorpay
      if (!rz?.orderId || !rz?.key) throw new Error("Payment gateway unavailable")
      await initRazorpayPayment({
        key: rz.key,
        amount: rz.amount,
        currency: rz.currency || "INR",
        order_id: rz.orderId,
        name: companyName,
        description: `${plan.name} membership - ${durationLabel(plan.durationDays)}`,
        notes: { type: "membership", planId: plan.id },
        handler: async (response) => {
          try {
            await userAPI.verifyMembershipPayment({
              planId: plan.id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            })
            onActivated(plan)
          } catch (err) {
            toast.error(errMsg(err, "Payment verification failed. Please contact support."))
            setBuying(null)
          }
        },
        onError: (err) => {
          toast.error(errMsg(err, "Payment failed. Please try again."))
          setBuying(null)
        },
        onClose: () => setBuying(null),
      })
    } catch (err) {
      toast.error(errMsg(err, "Could not start payment"))
      setBuying(null)
    }
  }

  const current = me?.current
  const accent = current?.badgeColor || plans.find((p) => p.isFeatured)?.badgeColor || "#D4A017"

  return (
    <AnimatedPage className="min-h-screen bg-[#f5f5f5] pb-10 dark:bg-[#0a0a0a]">
      <div className="px-4 pb-10 pt-4 text-white" style={{ background: `linear-gradient(160deg, ${accent}, #111827 75%)` }}>
        <button onClick={goBack} className="mb-4 rounded-full bg-white/15 p-2" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest opacity-90">
            <Crown className="h-4 w-4" /> {companyName} Membership
          </div>
          {current ? (
            <>
              <h1 className="mt-2 text-3xl font-extrabold">You're a {current.planName} member</h1>
              <p className="mt-1 text-sm opacity-90">Valid till {fmtDate(current.expiresAt)}</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/10 p-4">
                  <p className="text-xs uppercase tracking-wide opacity-80">Total saved</p>
                  <p className="text-2xl font-bold">{inr(me.totalSavings)}</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-4">
                  <p className="text-xs uppercase tracking-wide opacity-80">Member orders</p>
                  <p className="text-2xl font-bold">{me.ordersCount}</p>
                </div>
              </div>
            </>
          ) : (
            <>
              <h1 className="mt-2 text-3xl font-extrabold">Save on every order</h1>
              <p className="mt-1 text-sm opacity-90">Free delivery, extra discounts and no surge fees. Pays for itself in a couple of orders.</p>
            </>
          )}
        </div>
      </div>

      <div className="mx-auto -mt-6 max-w-2xl space-y-4 px-4">
        {current && (
          <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-[#1a1a1a]">
            <p className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Your benefits</p>
            <ul className="space-y-2">
              {perkLines(current.perks || {}).map((l, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <l.icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{l.text}
                </li>
              ))}
            </ul>
            {me.upcoming?.length > 0 && (
              <p className="mt-3 text-xs text-gray-500">
                Renewal queued: {me.upcoming.map((u) => `${u.planName} from ${fmtDate(u.startsAt)}`).join(", ")}
              </p>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : plans.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm dark:bg-[#1a1a1a]">
            Memberships are coming soon.
          </div>
        ) : (
          <>
            <p className="pt-2 text-sm font-semibold text-gray-900 dark:text-white">{current ? "Extend or upgrade" : "Choose a plan"}</p>
            {plans.map((plan) => {
              const busy = buying?.startsWith(`${plan.id}:`)
              const canWallet = wallet >= plan.price
              return (
                <div key={plan.id} className={`overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-[#1a1a1a] ${plan.isFeatured ? "ring-2" : ""}`} style={plan.isFeatured ? { "--tw-ring-color": plan.badgeColor } : undefined}>
                  <div className="flex items-start justify-between gap-3 p-4" style={{ background: `linear-gradient(135deg, ${plan.badgeColor}1f, transparent)` }}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white" style={{ background: plan.badgeColor }}>{plan.name}</span>
                        {plan.isFeatured && <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Most popular</span>}
                      </div>
                      {plan.tagline && <p className="mt-1.5 text-sm text-gray-700 dark:text-gray-300">{plan.tagline}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-2xl font-extrabold text-gray-900 dark:text-white">{inr(plan.price)}</div>
                      {plan.originalPrice > plan.price && <div className="text-xs text-gray-400 line-through">{inr(plan.originalPrice)}</div>}
                      <div className="text-xs text-gray-500">for {durationLabel(plan.durationDays)}</div>
                    </div>
                  </div>
                  <ul className="space-y-2 px-4 pb-2 pt-3">
                    {perkLines(plan).map((l, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{l.text}
                      </li>
                    ))}
                  </ul>
                  {plan.description && <p className="px-4 pb-2 text-xs text-gray-500">{plan.description}</p>}
                  <div className="flex gap-2 p-4 pt-2">
                    <button
                      disabled={Boolean(buying)}
                      onClick={() => buyWithRazorpay(plan)}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60"
                      style={{ background: plan.badgeColor }}>
                      {busy && buying.endsWith(":online") && <Loader2 className="h-4 w-4 animate-spin" />}
                      {current ? "Extend" : "Join"} for {inr(plan.price)}
                    </button>
                    <button
                      disabled={Boolean(buying) || !canWallet}
                      onClick={() => buyWithWallet(plan)}
                      title={canWallet ? "Pay from wallet" : `Wallet balance ${inr(wallet)} is not enough`}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm font-semibold text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200">
                      {busy && buying.endsWith(":wallet") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                      Wallet
                    </button>
                  </div>
                </div>
              )
            })}
            {current && <p className="px-1 text-xs text-gray-500">A new purchase starts when your current membership ends, so you never lose paid days.</p>}
          </>
        )}

        {me?.history?.length > 0 && (
          <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-[#1a1a1a]">
            <p className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">History</p>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {me.history.map((h) => (
                <li key={h.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium text-gray-800 dark:text-gray-200">{h.planName}</p>
                    <p className="text-xs text-gray-500">{fmtDate(h.startsAt)} – {fmtDate(h.expiresAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-800 dark:text-gray-200">{h.source === "admin_grant" ? "Gift" : inr(h.pricePaid)}</p>
                    <p className="text-xs capitalize text-gray-500">{h.status}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AnimatedPage>
  )
}
