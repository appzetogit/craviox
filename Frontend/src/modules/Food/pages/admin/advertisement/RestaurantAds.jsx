import { useCallback, useEffect, useState } from "react"
import { Loader2, Megaphone, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { adminAPI } from "@food/api"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@food/components/ui/dialog"

const TABS = [
  ["pending", "Pending approval"],
  ["live", "Live"],
  ["scheduled", "Scheduled"],
  ["completed", "Completed"],
  ["rejected", "Rejected / cancelled"],
  ["all", "All"],
]

const STATUS = {
  pending_approval: ["Pending approval", "bg-blue-100 text-blue-800"],
  scheduled: ["Scheduled", "bg-indigo-100 text-indigo-800"],
  live: ["Live", "bg-emerald-100 text-emerald-800"],
  completed: ["Completed", "bg-slate-200 text-slate-700"],
  rejected: ["Rejected", "bg-red-100 text-red-700"],
  cancelled: ["Cancelled", "bg-slate-100 text-slate-500"],
  stopped: ["Stopped", "bg-amber-100 text-amber-800"],
}

const inr = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
const fmtDate = (d) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-"

/** Restaurant ad campaigns: approve, reject (refunds prepaid) and stop early. */
export default function RestaurantAds() {
  const [tab, setTab] = useState("pending")
  const [data, setData] = useState({ ads: [], counts: {} })
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState("")

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await adminAPI.getRestaurantAds({ tab })
      setData(res?.data?.data || { ads: [], counts: {} })
    } catch (error) {
      setData({ ads: [], counts: {} })
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    load()
  }, [load])

  const act = async (ad, action, fn, success) => {
    try {
      setBusyId(ad.id)
      await fn()
      toast.success(success)
      await load()
    } catch (error) {
      toast.error(error?.response?.data?.message || `Could not ${action}`)
    } finally {
      setBusyId(null)
    }
  }

  const approve = (ad) => act(ad, "approve", () => adminAPI.approveRestaurantAd(ad.id), "Ad approved")
  const stop = (ad) => {
    if (!window.confirm(`Stop this ad now? ${ad.restaurantName} is charged only for the days it has run${ad.paymentMode === "prepaid" ? "; the rest is refunded" : ""}.`)) return
    act(ad, "stop", () => adminAPI.stopRestaurantAd(ad.id), "Ad stopped")
  }
  const confirmReject = async () => {
    if (!reason.trim()) return toast.error("Give a reason")
    const ad = rejecting
    setRejecting(null)
    await act(ad, "reject", () => adminAPI.rejectRestaurantAd(ad.id, reason.trim()), "Ad rejected")
    setReason("")
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-slate-700" />
            <h1 className="text-2xl font-bold text-slate-900">Restaurant Ads</h1>
          </div>
          <button type="button" onClick={load} className="rounded-lg border border-slate-300 p-2 hover:bg-slate-50" title="Refresh">
            <RefreshCw className="h-4 w-4 text-slate-600" />
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Approved ads put the restaurant first, marked "Promoted", in customer lists and search for their dates. Rejecting a
          prepaid ad refunds it; stopping one early charges only the days it ran.
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              {label}
              {data.counts?.[key] !== undefined && <span className="ml-1.5 opacity-70">{data.counts[key]}</span>}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : data.ads.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">No ads here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-700">
                  <th className="px-4 py-3">Restaurant</th>
                  <th className="px-4 py-3">Dates</th>
                  <th className="px-4 py-3">Budget</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Results</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.ads.map((ad) => {
                  const [label, cls] = STATUS[ad.displayStatus] || [ad.displayStatus, "bg-slate-100 text-slate-700"]
                  const busy = busyId === ad.id
                  return (
                    <tr key={ad.id} className="text-sm hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{ad.restaurantName || ad.restaurantId}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {fmtDate(ad.startDate)} → {fmtDate(ad.endDate)}
                        <div className="text-xs text-slate-500">{ad.days} day{ad.days > 1 ? "s" : ""}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {inr(ad.dailyBudget)}/day
                        <div className="text-xs font-semibold text-slate-900">{inr(ad.totalAmount)} total</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {ad.paymentMode === "prepaid" ? "Prepaid" : "Postpaid"}
                        <div className="text-xs text-slate-500">
                          {ad.paymentStatus.replace("_", " ")}
                          {ad.refundedAmount > 0 ? ` · refunded ${inr(ad.refundedAmount)}` : ""}
                          {ad.chargedAmount > 0 ? ` · charged ${inr(ad.chargedAmount)}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {ad.results?.menuVisits ?? 0} visits <span className="text-slate-400">(est. {ad.estimates?.visits})</span>
                        <br />
                        {ad.results?.orders ?? 0} orders <span className="text-slate-400">(est. {ad.estimates?.orders})</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{label}</span>
                        {ad.rejectionReason && <div className="mt-1 max-w-[180px] text-xs text-red-600">{ad.rejectionReason}</div>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {ad.status === "pending_approval" && (
                          <>
                            <button type="button" disabled={busy} onClick={() => approve(ad)} className="mr-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                              Approve
                            </button>
                            <button type="button" disabled={busy} onClick={() => setRejecting(ad)} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50">
                              Reject
                            </button>
                          </>
                        )}
                        {ad.status === "approved" && ad.displayStatus !== "completed" && (
                          <button type="button" disabled={busy} onClick={() => stop(ad)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">
                            Stop
                          </button>
                        )}
                        {busy && <Loader2 className="ml-2 inline h-4 w-4 animate-spin text-slate-400" />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject ad</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            {rejecting?.restaurantName} will see this reason.
            {rejecting?.paymentStatus === "paid" ? ` ${inr(rejecting?.totalAmount)} is refunded to their payment method.` : ""}
          </p>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Menu photos are missing — add them and submit again"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRejecting(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
            <button type="button" onClick={confirmReject} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">Reject</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
