import { useCallback, useEffect, useMemo, useState } from "react"
import { Award, Crown, Edit, Gift, IndianRupee, Loader2, Plus, Search, Trash2, Truck, Users, X, Zap, Percent, BadgeCheck } from "lucide-react"
import { toast } from "sonner"
import { adminAPI } from "@food/api"

const EMPTY_PLAN = {
  name: "",
  tagline: "",
  description: "",
  badgeColor: "#D4A017",
  price: "",
  originalPrice: "",
  durationDays: 30,
  freeDelivery: true,
  freeDeliveryMinOrder: 199,
  freeDeliveryMaxKm: 0,
  extraDiscountPercent: 0,
  maxDiscountPerOrder: 0,
  discountMinOrder: 0,
  stackWithCoupons: true,
  waivePlatformFee: false,
  waiveSurge: false,
  cashbackPercent: 0,
  maxCashbackPerOrder: 0,
  restaurantScope: "all",
  restaurantIds: [],
  extraPerks: [],
  isActive: true,
  isFeatured: false,
  sortOrder: 0,
}

// One-click starting points modelled on Zomato Gold, Swiggy One and Swiggy One Lite.
const TEMPLATES = [
  {
    label: "Gold (Zomato-style)",
    plan: { name: "Gold", tagline: "Free delivery + up to 30% extra off", badgeColor: "#D4A017", price: 149, originalPrice: 250, durationDays: 90, freeDelivery: true, freeDeliveryMinOrder: 199, freeDeliveryMaxKm: 7, extraDiscountPercent: 30, maxDiscountPerOrder: 120, stackWithCoupons: true, waiveSurge: true, isFeatured: true, extraPerks: ["Priority customer support"] },
  },
  {
    label: "One (Swiggy-style)",
    plan: { name: "Platinum", tagline: "Everything in Gold, plus no platform fee & cashback", badgeColor: "#6D28D9", price: 299, originalPrice: 499, durationDays: 90, freeDelivery: true, freeDeliveryMinOrder: 149, freeDeliveryMaxKm: 10, extraDiscountPercent: 30, maxDiscountPerOrder: 200, stackWithCoupons: true, waivePlatformFee: true, waiveSurge: true, cashbackPercent: 5, maxCashbackPerOrder: 50, extraPerks: ["Priority customer support", "Early access to new restaurants"] },
  },
  {
    label: "Lite",
    plan: { name: "Lite", tagline: "Free delivery on bigger orders", badgeColor: "#0EA5E9", price: 99, originalPrice: 0, durationDays: 30, freeDelivery: true, freeDeliveryMinOrder: 299, freeDeliveryMaxKm: 5, extraDiscountPercent: 10, maxDiscountPerOrder: 50, stackWithCoupons: false },
  },
]

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-")
const errMsg = (e, fallback) => e?.response?.data?.message || fallback

function perkLines(p) {
  const lines = []
  if (p.freeDelivery) {
    let s = "Free delivery"
    if (Number(p.freeDeliveryMinOrder) > 0) s += ` above ${inr(p.freeDeliveryMinOrder)}`
    if (Number(p.freeDeliveryMaxKm) > 0) s += ` within ${p.freeDeliveryMaxKm} km`
    lines.push({ icon: Truck, text: s })
  }
  if (Number(p.extraDiscountPercent) > 0) {
    let s = `${p.extraDiscountPercent}% extra off`
    if (Number(p.maxDiscountPerOrder) > 0) s += ` (up to ${inr(p.maxDiscountPerOrder)})`
    s += p.stackWithCoupons ? ", on top of coupons" : ", without coupons"
    lines.push({ icon: Percent, text: s })
  }
  if (p.waiveSurge) lines.push({ icon: Zap, text: "No surge / quick-delivery fee" })
  if (p.waivePlatformFee) lines.push({ icon: BadgeCheck, text: "No platform fee" })
  if (Number(p.cashbackPercent) > 0) {
    let s = `${p.cashbackPercent}% wallet cashback`
    if (Number(p.maxCashbackPerOrder) > 0) s += ` (up to ${inr(p.maxCashbackPerOrder)})`
    lines.push({ icon: IndianRupee, text: s })
  }
  for (const x of p.extraPerks || []) lines.push({ icon: Gift, text: x })
  return lines
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

const inputCls =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  )
}

function PlanModal({ initial, restaurants, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_PLAN, ...(initial || {}) }))
  const [perkDraft, setPerkDraft] = useState("")
  const [restaurantQuery, setRestaurantQuery] = useState("")
  const [saving, setSaving] = useState(false)
  const isEdit = Boolean(initial?.id)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const filteredRestaurants = useMemo(() => {
    const q = restaurantQuery.trim().toLowerCase()
    return restaurants.filter((r) => !q || r.name.toLowerCase().includes(q)).slice(0, 50)
  }, [restaurants, restaurantQuery])

  const addPerk = () => {
    const v = perkDraft.trim()
    if (!v) return
    set("extraPerks", [...(form.extraPerks || []), v])
    setPerkDraft("")
  }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { id, createdAt, updatedAt, ...body } = form
      if (isEdit) await adminAPI.updateMembershipPlan(id, body)
      else await adminAPI.createMembershipPlan(body)
      toast.success(isEdit ? "Plan updated" : "Plan created")
      onSaved()
    } catch (err) {
      toast.error(errMsg(err, "Could not save plan"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4">
      <form onSubmit={submit} className="my-6 w-full max-w-3xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">{isEdit ? `Edit ${initial.name}` : "Create membership plan"}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          {!isEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Start from</span>
              {TEMPLATES.map((t) => (
                <button key={t.label} type="button" onClick={() => setForm({ ...EMPTY_PLAN, ...t.plan })} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:border-blue-400 hover:text-blue-700">
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <section className="grid gap-4 sm:grid-cols-2">
            <Field label="Plan name *">
              <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Gold" required maxLength={64} />
            </Field>
            <Field label="Badge colour">
              <div className="flex gap-2">
                <input type="color" className="h-10 w-12 cursor-pointer rounded border border-slate-200" value={form.badgeColor} onChange={(e) => set("badgeColor", e.target.value)} />
                <input className={inputCls} value={form.badgeColor} onChange={(e) => set("badgeColor", e.target.value)} />
              </div>
            </Field>
            <Field label="Tagline">
              <input className={inputCls} value={form.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Free delivery + up to 30% extra off" maxLength={160} />
            </Field>
            <Field label="Sort order" hint="Lower shows first">
              <input type="number" className={inputCls} value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description">
                <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
              </Field>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Pricing</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Price (₹) *">
                <input type="number" min="0" step="0.01" className={inputCls} value={form.price} onChange={(e) => set("price", e.target.value)} required />
              </Field>
              <Field label="Original price (₹)" hint="Shown struck through. 0 = hide">
                <input type="number" min="0" step="0.01" className={inputCls} value={form.originalPrice} onChange={(e) => set("originalPrice", e.target.value)} />
              </Field>
              <Field label="Duration (days) *" hint="30 = monthly, 90 = quarterly, 365 = yearly">
                <input type="number" min="1" className={inputCls} value={form.durationDays} onChange={(e) => set("durationDays", e.target.value)} required />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Free delivery</h3>
            <Toggle checked={form.freeDelivery} onChange={(v) => set("freeDelivery", v)} label="Unlimited free delivery" hint="Delivery fee (and its GST) waived. Rider pay is unchanged — the platform absorbs it." />
            {form.freeDelivery && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Minimum order (₹)" hint="0 = any order. Zomato & Swiggy use ₹199">
                  <input type="number" min="0" className={inputCls} value={form.freeDeliveryMinOrder} onChange={(e) => set("freeDeliveryMinOrder", e.target.value)} />
                </Field>
                <Field label="Max distance (km)" hint="0 = no limit. Swiggy One uses 7 km">
                  <input type="number" min="0" step="0.5" className={inputCls} value={form.freeDeliveryMaxKm} onChange={(e) => set("freeDeliveryMaxKm", e.target.value)} />
                </Field>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Extra discount</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Extra off (%)" hint="0 = none">
                <input type="number" min="0" max="100" className={inputCls} value={form.extraDiscountPercent} onChange={(e) => set("extraDiscountPercent", e.target.value)} />
              </Field>
              <Field label="Max per order (₹)" hint="0 = no cap">
                <input type="number" min="0" className={inputCls} value={form.maxDiscountPerOrder} onChange={(e) => set("maxDiscountPerOrder", e.target.value)} />
              </Field>
              <Field label="Minimum order (₹)">
                <input type="number" min="0" className={inputCls} value={form.discountMinOrder} onChange={(e) => set("discountMinOrder", e.target.value)} />
              </Field>
            </div>
            <Toggle checked={form.stackWithCoupons} onChange={(v) => set("stackWithCoupons", v)} label="Stacks with coupons" hint="Off = the extra discount is skipped when the customer applies a coupon" />
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <Toggle checked={form.waiveSurge} onChange={(v) => set("waiveSurge", v)} label="No surge fee" hint="Waives the quick-delivery / peak surcharge" />
            <Toggle checked={form.waivePlatformFee} onChange={(v) => set("waivePlatformFee", v)} label="No platform fee" />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Cashback on delivered orders</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cashback (%)" hint="Credited to the wallet on delivery. 0 = none">
                <input type="number" min="0" max="100" className={inputCls} value={form.cashbackPercent} onChange={(e) => set("cashbackPercent", e.target.value)} />
              </Field>
              <Field label="Max cashback per order (₹)" hint="0 = no cap">
                <input type="number" min="0" className={inputCls} value={form.maxCashbackPerOrder} onChange={(e) => set("maxCashbackPerOrder", e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Where perks apply</h3>
            <div className="flex gap-2">
              {[
                ["all", "All restaurants"],
                ["selected", "Partner restaurants only"],
              ].map(([v, l]) => (
                <button key={v} type="button" onClick={() => set("restaurantScope", v)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${form.restaurantScope === v ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-700"}`}>
                  {l}
                </button>
              ))}
            </div>
            {form.restaurantScope === "selected" && (
              <div className="rounded-lg border border-slate-200 p-3">
                <input className={inputCls} placeholder="Search restaurants" value={restaurantQuery} onChange={(e) => setRestaurantQuery(e.target.value)} />
                <p className="mt-2 text-xs text-slate-500">{form.restaurantIds.length} selected</p>
                <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                  {filteredRestaurants.map((r) => {
                    const checked = form.restaurantIds.includes(r.id)
                    return (
                      <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                        <input type="checkbox" className="accent-blue-600" checked={checked} onChange={() => set("restaurantIds", checked ? form.restaurantIds.filter((x) => x !== r.id) : [...form.restaurantIds, r.id])} />
                        {r.name}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Other perks (shown on the plan card)</h3>
            <div className="flex gap-2">
              <input className={inputCls} value={perkDraft} onChange={(e) => setPerkDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPerk() } }} placeholder="e.g. Priority customer support" />
              <button type="button" onClick={addPerk} className="rounded-lg bg-slate-900 px-3 text-sm font-medium text-white">Add</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(form.extraPerks || []).map((p, i) => (
                <span key={`${p}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                  {p}
                  <button type="button" onClick={() => set("extraPerks", form.extraPerks.filter((_, j) => j !== i))} aria-label={`Remove ${p}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <Toggle checked={form.isActive} onChange={(v) => set("isActive", v)} label="Active" hint="Inactive plans cannot be bought; existing members keep their perks" />
            <Toggle checked={form.isFeatured} onChange={(v) => set("isFeatured", v)} label="Featured" hint="Highlighted as the recommended plan" />
          </section>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Create plan"}
          </button>
        </div>
      </form>
    </div>
  )
}

function GrantModal({ plans, onClose, onSaved }) {
  const [query, setQuery] = useState("")
  const [customers, setCustomers] = useState([])
  const [userId, setUserId] = useState("")
  const [planId, setPlanId] = useState(plans[0]?.id || "")
  const [days, setDays] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) { setCustomers([]); return }
    const t = setTimeout(async () => {
      try {
        const res = await adminAPI.getCustomers({ page: 1, limit: 20, search: q })
        const payload = res?.data?.data ?? {}
        const list = payload.customers || payload.users || payload.items || []
        setCustomers(list.map((c) => ({ id: String(c._id || c.id), name: c.name || c.fullName || "Unnamed", phone: c.phone || c.phoneNumber || "" })))
      } catch {
        setCustomers([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const submit = async (e) => {
    e.preventDefault()
    if (!userId) return toast.error("Select a customer")
    setSaving(true)
    try {
      await adminAPI.grantMembership({ userId, planId, durationDays: days ? Number(days) : undefined, note })
      toast.success("Membership granted")
      onSaved()
    } catch (err) {
      toast.error(errMsg(err, "Could not grant membership"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Grant membership</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <Field label="Customer" hint="Type at least 3 characters of name or phone">
          <input className={inputCls} value={query} onChange={(e) => { setQuery(e.target.value); setUserId("") }} placeholder="Search customer" />
        </Field>
        {customers.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200">
            {customers.map((c) => (
              <button key={c.id} type="button" onClick={() => { setUserId(c.id); setQuery(`${c.name} ${c.phone}`); setCustomers([]) }} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                {c.name} <span className="text-slate-500">{c.phone}</span>
              </button>
            ))}
          </div>
        )}
        <Field label="Plan">
          <select className={inputCls} value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.durationDays} days)</option>)}
          </select>
        </Field>
        <Field label="Duration (days)" hint="Leave empty to use the plan's duration">
          <input type="number" min="1" className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
        <Field label="Note">
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Compensation for delayed order" />
        </Field>
        <button type="submit" disabled={saving || !userId || !planId} className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {saving ? "Granting…" : "Grant for free"}
        </button>
      </form>
    </div>
  )
}

export default function Memberships() {
  const [tab, setTab] = useState("plans")
  const [plans, setPlans] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | {} (new) | plan
  const [granting, setGranting] = useState(false)
  const [restaurants, setRestaurants] = useState([])

  const [members, setMembers] = useState([])
  const [memberPage, setMemberPage] = useState({ page: 1, pages: 1, total: 0 })
  const [memberFilter, setMemberFilter] = useState({ status: "active", planId: "", search: "" })
  const [membersLoading, setMembersLoading] = useState(false)

  const loadPlans = useCallback(async () => {
    setLoading(true)
    try {
      const [p, s] = await Promise.all([adminAPI.getMembershipPlans(), adminAPI.getMembershipStats()])
      setPlans(p?.data?.data?.plans || [])
      setStats(s?.data?.data?.stats || null)
    } catch (err) {
      toast.error(errMsg(err, "Could not load memberships"))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMembers = useCallback(async (page = 1) => {
    setMembersLoading(true)
    try {
      const res = await adminAPI.getMembershipMembers({ ...memberFilter, page, limit: 20 })
      const d = res?.data?.data || {}
      setMembers(d.members || [])
      setMemberPage(d.pagination || { page: 1, pages: 1, total: 0 })
    } catch (err) {
      toast.error(errMsg(err, "Could not load members"))
    } finally {
      setMembersLoading(false)
    }
  }, [memberFilter])

  useEffect(() => { loadPlans() }, [loadPlans])
  useEffect(() => { if (tab === "members") loadMembers(1) }, [tab, loadMembers])
  useEffect(() => {
    adminAPI.getRestaurants({ page: 1, limit: 500 })
      .then((res) => setRestaurants((res?.data?.data?.restaurants || []).map((r) => ({ id: String(r._id || r.id), name: r.restaurantName || r.name || "" }))))
      .catch(() => {})
  }, [])

  const togglePlan = async (plan) => {
    try {
      await adminAPI.updateMembershipPlan(plan.id, { isActive: !plan.isActive })
      loadPlans()
    } catch (err) {
      toast.error(errMsg(err, "Could not update plan"))
    }
  }

  const removePlan = async (plan) => {
    if (!window.confirm(`Delete the ${plan.name} plan? Plans that have members are deactivated instead.`)) return
    try {
      const res = await adminAPI.deleteMembershipPlan(plan.id)
      toast.success(res?.data?.message || "Done")
      loadPlans()
    } catch (err) {
      toast.error(errMsg(err, "Could not delete plan"))
    }
  }

  const cancelMember = async (m) => {
    if (!window.confirm(`Cancel ${m.user?.name || "this customer"}'s ${m.planName} membership? Perks stop immediately; no refund is issued.`)) return
    try {
      await adminAPI.cancelMembership(m.id)
      toast.success("Membership cancelled")
      loadMembers(memberPage.page)
      loadPlans()
    } catch (err) {
      toast.error(errMsg(err, "Could not cancel"))
    }
  }

  const statCards = [
    { label: "Active members", value: stats?.activeMembers ?? "-", icon: Users },
    { label: "Membership revenue", value: stats ? inr(stats.revenue) : "-", icon: IndianRupee },
    { label: "Perks given to members", value: stats ? inr(stats.perksCost) : "-", icon: Gift, hint: stats ? `${stats.memberOrders} orders` : "" },
    { label: "Paid purchases", value: stats?.totalPurchases ?? "-", icon: Award },
  ]

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500">
              <Crown className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Memberships</h1>
              <p className="text-sm text-slate-500">Gold-style paid plans: free delivery, extra discounts, no surge, cashback.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setGranting(true)} disabled={plans.length === 0} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">Grant membership</button>
            <button onClick={() => setEditing({})} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
              <Plus className="h-4 w-4" /> New plan
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {statCards.map((c) => (
            <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-medium uppercase tracking-wide">{c.label}</span>
                <c.icon className="h-4 w-4" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{c.value}</div>
              {c.hint && <div className="text-xs text-slate-500">{c.hint}</div>}
            </div>
          ))}
        </div>

        <div className="flex gap-2 border-b border-slate-200">
          {[["plans", "Plans"], ["members", "Members"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? "border-blue-600 text-blue-600" : "border-transparent text-slate-600"}`}>{l}</button>
          ))}
        </div>

        {tab === "plans" && (
          loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : plans.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
              <Crown className="mx-auto h-10 w-10 text-amber-400" />
              <p className="mt-3 font-medium text-slate-800">No membership plans yet</p>
              <p className="text-sm text-slate-500">Create a Gold plan from a template in one click.</p>
              <button onClick={() => setEditing({})} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Create first plan</button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {plans.map((p) => (
                <div key={p.id} className={`overflow-hidden rounded-xl border bg-white ${p.isActive ? "border-slate-200" : "border-slate-200 opacity-60"}`}>
                  <div className="p-4 text-white" style={{ background: `linear-gradient(135deg, ${p.badgeColor}, #111827)` }}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-lg font-bold"><Crown className="h-5 w-5" />{p.name}</div>
                        {p.tagline && <div className="text-sm opacity-90">{p.tagline}</div>}
                      </div>
                      <div className="flex gap-1">
                        {p.isFeatured && <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">Featured</span>}
                        {!p.isActive && <span className="rounded-full bg-black/30 px-2 py-0.5 text-xs">Inactive</span>}
                      </div>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-2xl font-bold">{inr(p.price)}</span>
                      {p.originalPrice > p.price && <span className="text-sm line-through opacity-70">{inr(p.originalPrice)}</span>}
                      <span className="text-sm opacity-80">/ {p.durationDays} days</span>
                    </div>
                  </div>
                  <ul className="space-y-2 p-4 text-sm text-slate-700">
                    {perkLines(p).map((l, i) => (
                      <li key={i} className="flex items-start gap-2"><l.icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{l.text}</li>
                    ))}
                    <li className="text-xs text-slate-500">
                      {p.restaurantScope === "selected" ? `${p.restaurantIds.length} partner restaurants` : "All restaurants"} · {stats?.activeByPlan?.[p.id] || 0} active members
                    </li>
                  </ul>
                  <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                      <input type="checkbox" className="accent-blue-600" checked={p.isActive} onChange={() => togglePlan(p)} /> Active
                    </label>
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(p)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50" aria-label={`Edit ${p.name}`}><Edit className="h-4 w-4" /></button>
                      <button onClick={() => removePlan(p)} className="rounded-lg p-2 text-red-600 hover:bg-red-50" aria-label={`Delete ${p.name}`}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {tab === "members" && (
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input className={`${inputCls} pl-9`} placeholder="Search name or phone" value={memberFilter.search} onChange={(e) => setMemberFilter((f) => ({ ...f, search: e.target.value }))} />
              </div>
              <select className={`${inputCls} w-auto`} value={memberFilter.status} onChange={(e) => setMemberFilter((f) => ({ ...f, status: e.target.value }))}>
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select className={`${inputCls} w-auto`} value={memberFilter.planId} onChange={(e) => setMemberFilter((f) => ({ ...f, planId: e.target.value }))}>
                <option value="">All plans</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Paid</th>
                    <th className="px-4 py-3">Starts</th>
                    <th className="px-4 py-3">Expires</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {membersLoading ? (
                    <tr><td colSpan={8} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></td></tr>
                  ) : members.length === 0 ? (
                    <tr><td colSpan={8} className="py-10 text-center text-slate-500">No members found</td></tr>
                  ) : members.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-3"><div className="font-medium text-slate-800">{m.user?.name || "Unnamed"}</div><div className="text-xs text-slate-500">{m.user?.phone}</div></td>
                      <td className="px-4 py-3"><span className="rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: m.badgeColor }}>{m.planName}</span></td>
                      <td className="px-4 py-3 capitalize text-slate-600">{String(m.source).replace("_", " ")}</td>
                      <td className="px-4 py-3">{inr(m.pricePaid)}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(m.startsAt)}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(m.expiresAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.status === "active" ? "bg-emerald-50 text-emerald-700" : m.status === "cancelled" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{m.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {m.status === "active" && <button onClick={() => cancelMember(m)} className="text-xs font-medium text-red-600 hover:underline">Cancel</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {memberPage.pages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
                <span>{memberPage.total} memberships</span>
                <div className="flex gap-2">
                  <button disabled={memberPage.page <= 1} onClick={() => loadMembers(memberPage.page - 1)} className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40">Prev</button>
                  <span className="px-2 py-1">{memberPage.page} / {memberPage.pages}</span>
                  <button disabled={memberPage.page >= memberPage.pages} onClick={() => loadMembers(memberPage.page + 1)} className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {editing && (
        <PlanModal initial={editing.id ? editing : null} restaurants={restaurants} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); loadPlans() }} />
      )}
      {granting && (
        <GrantModal plans={plans} onClose={() => setGranting(false)} onSaved={() => { setGranting(false); loadPlans(); if (tab === "members") loadMembers(1) }} />
      )}
    </div>
  )
}
