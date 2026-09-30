import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Megaphone, Plus, Loader2, Eye, ShoppingBag, Users, X } from "lucide-react"
import { toast } from "sonner"
import BottomNavOrders from "@food/components/restaurant/BottomNavOrders"
import { restaurantAPI } from "@food/api"
import { initRazorpayPayment } from "@food/utils/razorpay"

/** Today in Asia/Kolkata as YYYY-MM-DD (what the server validates against). */
const istToday = (offsetDays = 0) =>
  new Date(Date.now() + 5.5 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10)

const inr = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
const fmtDate = (d) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-"

const STATUS = {
  awaiting_payment: ["Payment pending", "bg-amber-100 text-amber-800"],
  pending_approval: ["Waiting for approval", "bg-blue-100 text-blue-800"],
  scheduled: ["Scheduled", "bg-indigo-100 text-indigo-800"],
  live: ["Live", "bg-emerald-100 text-emerald-800"],
  completed: ["Completed", "bg-slate-200 text-slate-700"],
  rejected: ["Rejected", "bg-red-100 text-red-700"],
  cancelled: ["Cancelled", "bg-slate-100 text-slate-500"],
  stopped: ["Stopped", "bg-slate-200 text-slate-700"],
}

function Step({ n, title, children }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">{n}</span>
        <h3 className="text-sm font-bold text-gray-900 md:text-base">{title}</h3>
      </div>
      {children}
    </section>
  )
}

function CreateAd({ config, onDone, onCancel }) {
  const [startDate, setStartDate] = useState(istToday(1))
  const [endDate, setEndDate] = useState(istToday(7))
  const [dailyBudget, setDailyBudget] = useState(String(config?.recommendedDailyBudget || 750))
  const [paymentMode, setPaymentMode] = useState("prepaid")
  const [quote, setQuote] = useState(null)
  const [quoteError, setQuoteError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Live quote: price and expected benefit, recalculated as the form changes.
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await restaurantAPI.quoteAd({ startDate, endDate, dailyBudget: Number(dailyBudget) })
        setQuote(res?.data?.data?.quote || null)
        setQuoteError("")
      } catch (error) {
        setQuote(null)
        setQuoteError(error?.response?.data?.message || "Check the dates and budget")
      }
    }, 350)
    return () => clearTimeout(t)
  }, [startDate, endDate, dailyBudget])

  const payWithRazorpay = (ad, razorpay) =>
    new Promise((resolve) => {
      initRazorpayPayment({
        key: razorpay.key,
        amount: razorpay.amount,
        currency: razorpay.currency || "INR",
        order_id: razorpay.orderId,
        name: "Craviox Ads",
        description: `Ad campaign, ${ad.days} day(s)`,
        handler: async (response) => {
          try {
            await restaurantAPI.verifyAdPayment(ad.id, response)
            toast.success("Paid. Your ad is waiting for admin approval.")
          } catch (error) {
            toast.error(error?.response?.data?.message || "Payment could not be verified")
          }
          resolve()
        },
        onClose: () => {
          toast.message("Payment not completed. You can pay later from the list.")
          resolve()
        },
        onError: () => resolve(),
      })
    })

  const submit = async () => {
    if (!quote) return toast.error(quoteError || "Check the dates and budget")
    try {
      setSubmitting(true)
      const res = await restaurantAPI.createAd({ startDate, endDate, dailyBudget: Number(dailyBudget), paymentMode })
      const { ad, razorpay } = res?.data?.data || {}
      if (paymentMode === "prepaid" && razorpay) {
        await payWithRazorpay(ad, razorpay)
      } else {
        toast.success("Submitted. Your ad is waiting for admin approval.")
      }
      onDone()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not create the ad")
    } finally {
      setSubmitting(false)
    }
  }

  const input = "w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900 md:text-lg">Create ad</h2>
        <button type="button" onClick={onCancel} className="rounded-lg p-1.5 hover:bg-gray-100" aria-label="Close">
          <X className="h-5 w-5 text-gray-600" />
        </button>
      </div>

      <Step n={1} title="Duration">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-gray-600">
            Start date
            <input type="date" min={istToday()} value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${input} mt-1`} />
          </label>
          <label className="text-xs font-medium text-gray-600">
            End date
            <input type="date" min={startDate || istToday()} value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`${input} mt-1`} />
          </label>
        </div>
        {quote && <p className="mt-2 text-xs text-gray-500">{quote.days} day{quote.days > 1 ? "s" : ""} · up to {config?.maxDays || 90} days</p>}
      </Step>

      <Step n={2} title="Daily budget">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">₹</span>
          <input
            type="number"
            min={config?.minDailyBudget || 500}
            step="50"
            value={dailyBudget}
            onChange={(e) => setDailyBudget(e.target.value)}
            className={`${input} pl-7`}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setDailyBudget(String(config?.recommendedDailyBudget || 750))}
            className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800"
          >
            Recommended {inr(config?.recommendedDailyBudget || 750)}/day
          </button>
          <span className="text-gray-500">Minimum {inr(config?.minDailyBudget || 500)}/day</span>
        </div>
      </Step>

      <Step n={3} title="Expected benefit">
        {quote ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                [Users, quote.estimatedReach, "customers reached"],
                [Eye, quote.estimatedVisits, "menu visits"],
                [ShoppingBag, quote.estimatedOrders, "orders"],
              ].map(([Icon, value, label]) => (
                <div key={label} className="rounded-xl bg-gray-50 px-2 py-3">
                  <Icon className="mx-auto mb-1 h-4 w-4 text-gray-500" />
                  <p className="text-lg font-bold text-gray-900">~{Number(value).toLocaleString("en-IN")}</p>
                  <p className="text-[11px] text-gray-500">{label}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              Estimates only. Your restaurant is shown first, marked "Promoted", in customer lists and search.
            </p>
          </>
        ) : (
          <p className="text-sm text-red-600">{quoteError || "Calculating…"}</p>
        )}
      </Step>

      <Step n={4} title="Summary & payment">
        {quote && (
          <div className="mb-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600"><span>Dates</span><span>{fmtDate(quote.startDate)} → {fmtDate(quote.endDate)}</span></div>
            <div className="flex justify-between text-gray-600"><span>Daily budget × days</span><span>{inr(quote.dailyBudget)} × {quote.days}</span></div>
            <div className="flex justify-between border-t border-gray-100 pt-1 font-bold text-gray-900"><span>Total</span><span>{inr(quote.totalAmount)}</span></div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {[
            ["prepaid", "Prepaid", "Pay now online"],
            ["postpaid", "Postpaid", "Deducted from your payouts"],
          ].map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              onClick={() => setPaymentMode(value)}
              className={`rounded-xl border-2 p-3 text-left ${paymentMode === value ? "border-gray-900 bg-gray-50" : "border-gray-200"}`}
            >
              <p className="text-sm font-bold text-gray-900">{label}</p>
              <p className="text-[11px] text-gray-500">{hint}</p>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          Every ad is reviewed by the Craviox team before it goes live. A rejected prepaid ad is refunded in full.
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !quote}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {paymentMode === "prepaid" ? `Pay ${quote ? inr(quote.totalAmount) : ""} & submit` : "Submit for approval"}
        </button>
      </Step>
    </div>
  )
}

function AdCard({ ad, onPay, onCancel, busy }) {
  const [label, cls] = STATUS[ad.displayStatus] || [ad.displayStatus, "bg-slate-100 text-slate-700"]
  // Before approval it is withdrawn; once approved (scheduled or live) it ends now.
  const canCancel =
    ["awaiting_payment", "pending_approval"].includes(ad.status) ||
    (ad.status === "approved" && ["scheduled", "live"].includes(ad.displayStatus))
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-gray-900">{fmtDate(ad.startDate)} → {fmtDate(ad.endDate)}</p>
          <p className="text-xs text-gray-500">
            {inr(ad.dailyBudget)}/day · {ad.days} day{ad.days > 1 ? "s" : ""} · {inr(ad.totalAmount)} ·{" "}
            {ad.paymentMode === "prepaid" ? "Prepaid" : "Postpaid"}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>{label}</span>
      </div>
      {ad.status === "rejected" && ad.rejectionReason && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">Reason: {ad.rejectionReason}</p>
      )}
      {ad.refundedAmount > 0 && <p className="mt-2 text-xs text-gray-600">Refunded {inr(ad.refundedAmount)} to your payment method.</p>}
      {ad.status === "stopped" && (
        <p className="mt-2 text-xs text-gray-600">Ended early · charged {inr(ad.chargedAmount)}</p>
      )}
      {["live", "completed", "stopped"].includes(ad.displayStatus) && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-gray-50 py-2">
            <p className="text-base font-bold text-gray-900">{ad.results?.menuVisits ?? 0}</p>
            <p className="text-[11px] text-gray-500">menu visits (est. {ad.estimates?.visits})</p>
          </div>
          <div className="rounded-xl bg-gray-50 py-2">
            <p className="text-base font-bold text-gray-900">{ad.results?.orders ?? 0}</p>
            <p className="text-[11px] text-gray-500">orders (est. {ad.estimates?.orders})</p>
          </div>
        </div>
      )}
      {(ad.status === "awaiting_payment" || canCancel) && (
        <div className="mt-3 flex gap-2">
          {ad.status === "awaiting_payment" && (
            <button type="button" disabled={busy} onClick={() => onPay(ad)} className="flex-1 rounded-xl bg-gray-900 py-2 text-xs font-bold text-white disabled:opacity-50">
              Pay now
            </button>
          )}
          {canCancel && (
            <button type="button" disabled={busy} onClick={() => onCancel(ad)} className="flex-1 rounded-xl border border-gray-300 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50">
              {ad.displayStatus === "live" ? "Stop ad" : `Cancel${ad.paymentStatus === "paid" ? " & refund" : ""}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function Advertisements() {
  const navigate = useNavigate()
  const [ads, setAds] = useState([])
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await restaurantAPI.getAds()
      setAds(res?.data?.data?.ads || [])
      setConfig(res?.data?.data?.config || null)
    } catch (error) {
      setAds([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const live = useMemo(() => ads.find((a) => a.displayStatus === "live"), [ads])

  const pay = async (ad) => {
    try {
      setBusyId(ad.id)
      const res = await restaurantAPI.payAd(ad.id)
      const razorpay = res?.data?.data?.razorpay
      await new Promise((resolve) =>
        initRazorpayPayment({
          key: razorpay.key,
          amount: razorpay.amount,
          currency: razorpay.currency || "INR",
          order_id: razorpay.orderId,
          name: "Craviox Ads",
          description: `Ad campaign, ${ad.days} day(s)`,
          handler: async (response) => {
            try {
              await restaurantAPI.verifyAdPayment(ad.id, response)
              toast.success("Paid. Your ad is waiting for admin approval.")
            } catch (error) {
              toast.error(error?.response?.data?.message || "Payment could not be verified")
            }
            resolve()
          },
          onClose: resolve,
          onError: resolve,
        }),
      )
      await load()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not start payment")
    } finally {
      setBusyId(null)
    }
  }

  const cancel = async (ad) => {
    const paid = ad.paymentStatus === "paid"
    let message
    if (ad.displayStatus === "live") {
      message = `Stop this ad now? You are charged ${inr(ad.dailyBudget)} for each day it has run, today included.${
        paid ? " The rest of your payment is refunded." : ""
      }`
    } else if (ad.displayStatus === "scheduled") {
      message = `Cancel this ad before it starts?${paid ? ` Your ${inr(ad.totalAmount)} is refunded in full.` : " You will not be charged."}`
    } else {
      message = paid ? "Cancel this ad and refund the payment?" : "Cancel this ad request?"
    }
    if (!window.confirm(message)) return
    try {
      setBusyId(ad.id)
      await restaurantAPI.cancelAd(ad.id)
      toast.success(ad.displayStatus === "live" ? "Ad stopped" : "Ad cancelled")
      await load()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not cancel")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:min-h-full md:h-full md:overflow-hidden md:bg-slate-50">
      <div className="sticky bg-white/95 backdrop-blur top-0 z-40 px-4 py-3 border-b border-gray-200 shrink-0 md:border-slate-200">
        <div className="flex items-center gap-3 md:max-w-3xl md:mx-auto md:px-4 md:py-2">
          <button onClick={() => navigate("/food/restaurant/explore")} className="p-1.5 hover:bg-gray-100 rounded-lg md:hidden" aria-label="Go back">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 md:text-2xl">Advertisements</h1>
            <p className="text-[11px] text-gray-500 md:text-sm">Get listed first as "Promoted" to customers near you</p>
          </div>
          {!creating && (
            <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-3 py-2 text-xs font-bold text-white md:text-sm">
              <Plus className="h-4 w-4" /> Create ad
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-28 space-y-4 md:min-h-0 md:max-w-3xl md:mx-auto md:px-8 md:py-8 md:pb-8 md:w-full">
        {creating ? (
          <CreateAd
            config={config}
            onCancel={() => setCreating(false)}
            onDone={async () => {
              setCreating(false)
              await load()
            }}
          />
        ) : loading ? (
          <div className="py-12 text-center text-gray-500">Loading ads…</div>
        ) : (
          <>
            {live && (
              <div className="rounded-2xl bg-emerald-600 p-4 text-white">
                <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Live now</p>
                <p className="text-sm font-bold">Your restaurant is promoted until {fmtDate(live.endDate)}</p>
                <p className="text-xs opacity-90">{live.results?.menuVisits ?? 0} menu visits · {live.results?.orders ?? 0} orders so far</p>
              </div>
            )}
            {ads.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
                <Megaphone className="mx-auto mb-3 h-10 w-10 text-gray-400" />
                <p className="text-sm font-bold text-gray-900">No ads yet</p>
                <p className="mt-1 text-xs text-gray-500">Promote your restaurant to reach more customers.</p>
                <button type="button" onClick={() => setCreating(true)} className="mt-4 rounded-xl bg-gray-900 px-4 py-2 text-sm font-bold text-white">
                  Create your first ad
                </button>
              </div>
            ) : (
              ads.map((ad) => <AdCard key={ad.id} ad={ad} onPay={pay} onCancel={cancel} busy={busyId === ad.id} />)
            )}
          </>
        )}
      </div>

      <div className="md:hidden">
        <BottomNavOrders />
      </div>
    </div>
  )
}
