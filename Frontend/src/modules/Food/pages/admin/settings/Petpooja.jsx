import { useCallback, useEffect, useState } from "react"
import { adminAPI } from "@food/api"
import { Button } from "@food/components/ui/button"
import { Switch } from "@food/components/ui/switch"
import { Input } from "@food/components/ui/input"
import { Textarea } from "@food/components/ui/textarea"
import { Label } from "@food/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@food/components/ui/dialog"
import {
  AlertTriangle, CheckCircle2, Copy, FileJson, Link2, Loader2, Plug, Plus, RefreshCw, RotateCcw, Search, Trash2, XCircle,
} from "lucide-react"
import { toast } from "sonner"

/**
 * Admin → Petpooja. Connects restaurants to their Petpooja POS: menu, stock
 * and outlet status come from Petpooja; new orders go to it and its
 * accept / ready / reject comes back.
 */

const errMsg = (e, fallback) => e?.response?.data?.message || fallback
const when = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—")

function copy(text) {
  navigator.clipboard?.writeText(text).then(
    () => toast.success("Copied"),
    () => toast.error("Couldn't copy"),
  )
}

function Field({ label, hint, children, className = "" }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-sm font-medium text-gray-800">{label}</Label>
      {children}
      {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
    </div>
  )
}

function Card({ title, description, children, right }) {
  return (
    <section className="rounded-xl border bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-gray-500">{description}</p> : null}
        </div>
        {right}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const WEBHOOK_LABELS = [
  ["menu", "Push menu"],
  ["stock", "Item / add-on stock on-off"],
  ["storeStatus", "Update store status"],
  ["storeStatusGet", "Get store status"],
  ["orderStatus", "Order status callback"],
]

function Setup({ onSaved }) {
  const [form, setForm] = useState(null)
  const [webhooks, setWebhooks] = useState({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await adminAPI.getPetpoojaConfig()
      setForm(res.data.data.config)
      setWebhooks(res.data.data.webhooks || {})
    } catch (err) {
      toast.error(errMsg(err, "Couldn't load Petpooja settings."))
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }))

  const save = async (patch = {}) => {
    setSaving(true)
    try {
      const body = { ...form, ...patch }
      // A secret box that was clicked into and left empty keeps the saved secret.
      if (!body.appSecret && form.hasAppSecret) delete body.appSecret
      if (!body.accessToken && form.hasAccessToken) delete body.accessToken
      const res = await adminAPI.updatePetpoojaConfig(body)
      setForm(res.data.data.config)
      setWebhooks(res.data.data.webhooks || {})
      toast.success("Petpooja settings saved")
      onSaved?.()
    } catch (err) {
      toast.error(errMsg(err, "Couldn't save."))
      load()
    } finally {
      setSaving(false)
    }
  }

  const rotate = async () => {
    if (!window.confirm("Create a new secret token? Petpooja must be given the new URLs, or its updates will be refused.")) return
    try {
      const res = await adminAPI.rotatePetpoojaToken()
      setForm(res.data.data.config)
      setWebhooks(res.data.data.webhooks || {})
      toast.success("New token created")
    } catch (err) {
      toast.error(errMsg(err, "Couldn't create a new token."))
    }
  }

  if (!form) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>

  return (
    <div className="space-y-5">
      <Card
        title="Connection"
        description="The partner keys Petpooja gives you after integration onboarding."
        right={
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${form.enabled ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>
              {form.enabled ? "On" : "Off"}
            </span>
            <Switch checked={form.enabled} disabled={saving} onCheckedChange={(v) => save({ enabled: v })} aria-label="Turn Petpooja on" />
          </div>
        }
      >
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <Field label="Environment">
            <div className="flex gap-2">
              {["sandbox", "live"].map((env) => (
                <button
                  key={env}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, environment: env }))}
                  className={`rounded-lg border px-4 py-2 text-sm capitalize ${form.environment === env ? "border-gray-900 bg-gray-900 text-white" : "bg-white hover:border-gray-400"}`}
                >
                  {env}
                </button>
              ))}
            </div>
          </Field>
          <div />
          <Field label="App key">
            <Input id="pp-key" value={form.appKey} onChange={set("appKey")} autoComplete="off" />
          </Field>
          <Field label="App secret" hint={form.hasAppSecret ? "Saved. Type a new value to replace it." : ""}>
            <Input id="pp-secret" value={form.appSecret} onChange={set("appSecret")} onFocus={(e) => e.target.value.startsWith("•") && setForm((f) => ({ ...f, appSecret: "" }))} autoComplete="off" />
          </Field>
          <Field label="Access token" hint={form.hasAccessToken ? "Saved. Type a new value to replace it." : ""} className="md:col-span-2">
            <Input id="pp-token" value={form.accessToken} onChange={set("accessToken")} onFocus={(e) => e.target.value.startsWith("•") && setForm((f) => ({ ...f, accessToken: "" }))} autoComplete="off" />
          </Field>
          <Field label="Save Order API URL" hint="From Petpooja's integration docs." className="md:col-span-2">
            <Input id="pp-save" value={form.saveOrderUrl} onChange={set("saveOrderUrl")} placeholder="https://…/save_order" />
          </Field>
          <Field label="Update Order Status API URL" className="md:col-span-2">
            <Input id="pp-status" value={form.updateOrderStatusUrl} onChange={set("updateOrderStatusUrl")} placeholder="https://…/update_order_status" />
          </Field>
          <Field label="Fetch Menu API URL" className="md:col-span-2">
            <Input id="pp-menu" value={form.fetchMenuUrl} onChange={set("fetchMenuUrl")} placeholder="https://…/mapped_restaurant_menus" />
          </Field>
          <div className="flex justify-end md:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save settings
            </Button>
          </div>
        </form>
      </Card>

      <Card
        title="URLs to give Petpooja"
        description="Petpooja calls these to send menus, stock, outlet status and order updates. Each carries your secret token."
        right={
          <Button variant="outline" size="sm" onClick={rotate}>
            <RotateCcw className="mr-1.5 h-4 w-4" /> New token
          </Button>
        }
      >
        <div className="space-y-2">
          {WEBHOOK_LABELS.map(([k, label]) => (
            <div key={k} className="grid gap-1 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-center md:gap-3">
              <span className="text-sm font-medium text-gray-700">{label}</span>
              <code className="truncate rounded-md border bg-gray-50 px-3 py-2 text-xs text-gray-700">{webhooks[k]}</code>
              <Button variant="outline" size="sm" onClick={() => copy(webhooks[k])} aria-label={`Copy ${label} URL`}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Restaurants
// ---------------------------------------------------------------------------

function LinkDialog({ open, onOpenChange, onLinked }) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState([])
  const [picked, setPicked] = useState(null)
  const [restId, setRestId] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      setQuery("")
      setResults([])
      setPicked(null)
      setRestId("")
    }
  }, [open])

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([])
      return undefined
    }
    const t = setTimeout(async () => {
      try {
        const res = await adminAPI.getRestaurants({ search: query.trim(), page: 1, limit: 8 })
        const d = res?.data?.data
        setResults(Array.isArray(d?.restaurants) ? d.restaurants : Array.isArray(d) ? d : [])
      } catch {
        setResults([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query, open])

  const submit = async (e) => {
    e.preventDefault()
    if (!picked) return toast.error("Choose a restaurant")
    setBusy(true)
    try {
      await adminAPI.createPetpoojaLink({ restaurantId: picked._id || picked.id, externalRestId: restId })
      toast.success(`${picked.restaurantName || picked.name} linked`)
      onLinked()
      onOpenChange(false)
    } catch (err) {
      toast.error(errMsg(err, "Couldn't link the restaurant."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-6">
        <DialogHeader>
          <DialogTitle>Link a restaurant</DialogTitle>
          <DialogDescription>Connect a Craviox restaurant to its outlet in Petpooja.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="mt-2 space-y-4">
          <Field label="Restaurant">
            {picked ? (
              <div className="flex items-center justify-between rounded-lg border bg-gray-50 px-3 py-2 text-sm">
                <span className="font-medium">{picked.restaurantName || picked.name}</span>
                <button type="button" className="text-xs text-blue-700 underline" onClick={() => setPicked(null)}>Change</button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input id="pp-rsearch" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name" className="pl-9" autoFocus />
                </div>
                {results.length ? (
                  <ul className="mt-2 max-h-56 divide-y overflow-y-auto rounded-lg border">
                    {results.map((r) => (
                      <li key={r._id || r.id}>
                        <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => setPicked(r)}>
                          <div className="font-medium">{r.restaurantName || r.name}</div>
                          <div className="text-xs text-gray-500">{[r.area, r.city].filter(Boolean).join(", ") || r.ownerPhone || ""}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </Field>
          <Field label="Petpooja restaurant ID (restID)" hint="Shown in the restaurant's Petpooja account, or ask Petpooja support.">
            <Input id="pp-restid" value={restId} onChange={(e) => setRestId(e.target.value)} placeholder="e.g. 4ab9gkd7" required />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !picked || !restId.trim()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
              Link
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ImportDialog({ link, onOpenChange, onDone }) {
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!link) setText("")
  }, [link])

  const run = async () => {
    setBusy(true)
    try {
      const res = await adminAPI.importPetpoojaMenu(link.id, text)
      const s = res.data.data.summary
      toast.success(`Imported ${s.items} dishes and ${s.addons} add-ons`)
      if (s.skipped?.length) toast.warning(`${s.skipped.length} skipped: ${s.skipped.slice(0, 2).join("; ")}`)
      onDone()
      onOpenChange(false)
    } catch (err) {
      toast.error(errMsg(err, "Couldn't import the menu."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={Boolean(link)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-6">
        <DialogHeader>
          <DialogTitle>Import a Petpooja menu</DialogTitle>
          <DialogDescription>
            Paste the menu JSON from Petpooja (the Fetch Menu response or a sample from their docs). Useful for testing before live keys work.
          </DialogDescription>
        </DialogHeader>
        <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} className="mt-2 font-mono text-xs" placeholder='{ "categories": [...], "items": [...], "addongroups": [...] }' />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={run} disabled={busy || !text.trim()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileJson className="mr-2 h-4 w-4" />}
            Import menu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Restaurants({ configEnabled }) {
  const [links, setLinks] = useState(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [importing, setImporting] = useState(null)
  const [syncing, setSyncing] = useState("")

  const load = useCallback(async () => {
    try {
      const res = await adminAPI.getPetpoojaLinks()
      setLinks(res.data.data.links || [])
    } catch (err) {
      toast.error(errMsg(err, "Couldn't load restaurants."))
      setLinks([])
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const patch = async (link, body) => {
    setLinks((ls) => ls.map((l) => (l.id === link.id ? { ...l, ...body } : l)))
    try {
      await adminAPI.updatePetpoojaLink(link.id, body)
    } catch (err) {
      toast.error(errMsg(err, "Couldn't update."))
      load()
    }
  }

  const sync = async (link) => {
    setSyncing(link.id)
    try {
      const res = await adminAPI.syncPetpoojaMenu(link.id)
      const s = res.data.data.summary
      toast.success(`Synced ${s.items} dishes, ${s.addons} add-ons`)
      load()
    } catch (err) {
      toast.error(errMsg(err, "Menu sync failed."))
      load()
    } finally {
      setSyncing("")
    }
  }

  const unlink = async (link) => {
    if (!window.confirm(`Unlink ${link.restaurantName}? Its menu stays as it is and becomes editable in Craviox again.`)) return
    try {
      await adminAPI.deletePetpoojaLink(link.id)
      toast.success("Unlinked")
      load()
    } catch (err) {
      toast.error(errMsg(err, "Couldn't unlink."))
    }
  }

  return (
    <div className="space-y-4">
      {!configEnabled ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Petpooja is off in Setup. Linked restaurants keep working in Craviox; nothing is sent to or accepted from Petpooja until it is on.
        </div>
      ) : null}
      <div className="flex justify-between gap-3">
        <p className="text-sm text-gray-500">{links ? `${links.length} linked` : "Loading…"}</p>
        <Button onClick={() => setLinkOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Link restaurant
        </Button>
      </div>

      {!links ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : links.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Plug className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-2 font-medium">No restaurants on Petpooja yet</p>
          <p className="text-sm text-gray-500">Link one with its Petpooja restaurant ID to start syncing.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((l) => (
            <div key={l.id} className="rounded-xl border bg-white p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">{l.restaurantName}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-[11px] text-gray-700">restID {l.externalRestId}</span>
                    {l.failedOrders ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800">{l.failedOrders} {l.failedOrders === 1 ? "order" : "orders"} not sent</span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {l.place ? `${l.place} · ` : ""}
                    {l.linkedDishes} dishes, {l.linkedAddons} add-ons linked · Outlet {l.isAcceptingOrders ? "open" : "closed"}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs">
                    {l.lastMenuSyncStatus === "ok" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    ) : l.lastMenuSyncStatus === "error" ? (
                      <XCircle className="h-3.5 w-3.5 text-red-600" />
                    ) : null}
                    <span className="text-gray-600">
                      {l.lastMenuSyncAt ? `Menu synced ${when(l.lastMenuSyncAt)}: ${l.lastMenuSyncNote}` : "Menu not synced yet"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => sync(l)} disabled={syncing === l.id || !l.syncMenu}>
                    {syncing === l.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                    Sync menu
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setImporting(l)} disabled={!l.syncMenu}>
                    <FileJson className="mr-1.5 h-4 w-4" /> Import JSON
                  </Button>
                  <Button variant="outline" size="sm" className="text-red-600" onClick={() => unlink(l)} aria-label="Unlink">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-3">
                {[
                  ["enabled", "Connected", "Turn off to pause everything for this restaurant"],
                  ["syncMenu", "Menu from Petpooja", "Locks menu editing in Craviox"],
                  ["pushOrders", "Send orders to Petpooja", "Accept / ready / reject come back"],
                ].map(([k, label, hint]) => (
                  <label key={k} className="flex items-start justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                    <span>
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="block text-xs text-gray-500">{hint}</span>
                    </span>
                    <Switch checked={l[k]} onCheckedChange={(v) => patch(l, { [k]: v })} />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <LinkDialog open={linkOpen} onOpenChange={setLinkOpen} onLinked={load} />
      <ImportDialog link={importing} onOpenChange={(o) => !o && setImporting(null)} onDone={load} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Orders and activity
// ---------------------------------------------------------------------------

const PUSH_BADGE = {
  sent: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  pending: "bg-amber-100 text-amber-800",
  cancelled: "bg-gray-200 text-gray-700",
}
const POS_STATUS = { "-1": "Rejected", 1: "Accepted", 2: "Accepted", 3: "Accepted", 4: "Dispatched", 5: "Food ready", 10: "Delivered" }

function Orders() {
  const [status, setStatus] = useState("")
  const [orders, setOrders] = useState(null)
  const [retrying, setRetrying] = useState("")

  const load = useCallback(async () => {
    try {
      const res = await adminAPI.getPetpoojaOrders(status ? { status } : {})
      setOrders(res.data.data.orders || [])
    } catch (err) {
      toast.error(errMsg(err, "Couldn't load orders."))
      setOrders([])
    }
  }, [status])
  useEffect(() => {
    load()
  }, [load])

  const retry = async (o) => {
    setRetrying(o.orderId)
    try {
      await adminAPI.retryPetpoojaOrder(o.orderId)
      toast.success(`Order ${o.displayId} sent`)
    } catch (err) {
      toast.error(errMsg(err, "Still not accepted by Petpooja."))
    } finally {
      setRetrying("")
      load()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[["", "All"], ["failed", "Not sent"], ["sent", "Sent"], ["cancelled", "Cancelled"]].map(([k, l]) => (
          <button
            key={k || "all"}
            type="button"
            onClick={() => setStatus(k)}
            className={`rounded-full border px-3 py-1.5 text-sm ${status === k ? "border-gray-900 bg-gray-900 text-white" : "bg-white hover:border-gray-400"}`}
          >
            {l}
          </button>
        ))}
        <Button variant="ghost" size="sm" onClick={load} className="ml-auto">
          <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
        </Button>
      </div>
      {!orders ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-gray-500">No orders here yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2.5">Order</th>
                <th className="px-4 py-2.5">Restaurant</th>
                <th className="px-4 py-2.5">To Petpooja</th>
                <th className="px-4 py-2.5">In Petpooja</th>
                <th className="px-4 py-2.5">Craviox status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map((o) => (
                <tr key={o.orderId} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">{o.displayId}</div>
                    <div className="text-xs text-gray-500">{when(o.createdAt)} · ₹{o.total}</div>
                  </td>
                  <td className="px-4 py-3">{o.restaurantName}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PUSH_BADGE[o.pushStatus] || ""}`}>{o.pushStatus}</span>
                    {o.lastError ? <div className="mt-1 max-w-xs text-xs text-red-700">{o.lastError}</div> : null}
                    <div className="mt-1 text-xs text-gray-400">{o.attempts} attempt{o.attempts === 1 ? "" : "s"}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{POS_STATUS[o.posStatus] || o.posStatus || "—"}</td>
                  <td className="px-4 py-3 text-gray-700">{o.orderStatus.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-right">
                    {o.pushStatus === "failed" || o.pushStatus === "pending" ? (
                      <Button size="sm" variant="outline" onClick={() => retry(o)} disabled={retrying === o.orderId}>
                        {retrying === o.orderId ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1.5 h-4 w-4" />}
                        Retry
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const TYPE_LABEL = {
  menu_push: "Menu pushed",
  menu_import: "Menu imported",
  fetch_menu: "Menu fetched",
  stock: "Stock",
  store_status: "Outlet status",
  save_order: "Order sent",
  cancel_order: "Cancellation sent",
  order_status: "Order status",
  link: "Link",
}

function Activity() {
  const [onlyErrors, setOnlyErrors] = useState(false)
  const [logs, setLogs] = useState(null)
  const [open, setOpen] = useState("")

  const load = useCallback(async () => {
    try {
      const res = await adminAPI.getPetpoojaLogs(onlyErrors ? { ok: "false", limit: 100 } : { limit: 100 })
      setLogs(res.data.data.logs || [])
    } catch (err) {
      toast.error(errMsg(err, "Couldn't load activity."))
      setLogs([])
    }
  }, [onlyErrors])
  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={onlyErrors} onCheckedChange={setOnlyErrors} /> Problems only
        </label>
        <Button variant="ghost" size="sm" onClick={load}>
          <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
        </Button>
      </div>
      {!logs ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : logs.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-gray-500">Nothing yet. Every call to and from Petpooja shows up here.</div>
      ) : (
        <ul className="divide-y rounded-xl border bg-white">
          {logs.map((l) => (
            <li key={l.id} className="px-4 py-3">
              <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(open === l.id ? "" : l.id)}>
                {l.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{TYPE_LABEL[l.type] || l.type}</span>
                  <span className="ml-2 text-xs text-gray-400">{l.direction === "in" ? "from Petpooja" : "to Petpooja"} · {when(l.createdAt)}</span>
                  <span className="block truncate text-sm text-gray-600">{l.message}</span>
                </span>
              </button>
              {open === l.id && l.payload ? (
                <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700">{JSON.stringify(l.payload, null, 2)}</pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Petpooja() {
  const [tab, setTab] = useState("setup")
  const [enabled, setEnabled] = useState(true)

  const refreshEnabled = useCallback(() => {
    adminAPI.getPetpoojaConfig().then((r) => setEnabled(Boolean(r?.data?.data?.config?.enabled))).catch(() => {})
  }, [])
  useEffect(() => {
    refreshEnabled()
  }, [refreshEnabled, tab])

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Petpooja</h1>
        <p className="mt-1 text-sm text-gray-500">
          Restaurants on Petpooja POS get Craviox orders on their billing screen. Their menu, stock and outlet status sync back automatically.
        </p>
      </div>
      <div className="flex w-fit flex-wrap gap-1 rounded-xl bg-gray-100 p-1">
        {[["setup", "Setup"], ["restaurants", "Restaurants"], ["orders", "Orders"], ["activity", "Activity"]].map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "setup" ? <Setup onSaved={refreshEnabled} /> : null}
      {tab === "restaurants" ? <Restaurants configEnabled={enabled} /> : null}
      {tab === "orders" ? <Orders /> : null}
      {tab === "activity" ? <Activity /> : null}
    </div>
  )
}
