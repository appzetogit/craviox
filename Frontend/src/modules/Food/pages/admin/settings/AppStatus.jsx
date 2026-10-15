import { useEffect, useMemo, useState } from "react"
import { adminAPI, uploadAPI } from "@food/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@food/components/ui/card"
import { Button } from "@food/components/ui/button"
import { Switch } from "@food/components/ui/switch"
import { Input } from "@food/components/ui/input"
import { Textarea } from "@food/components/ui/textarea"
import { Label } from "@food/components/ui/label"
import { Loader2, Save, Rocket, Wrench, CheckCircle2, Upload, X, Copy, RefreshCw, Smartphone, Globe, Store, Bike } from "lucide-react"
import { toast } from "sonner"

/**
 * Launch control for every app: live, coming soon or maintenance, plus the
 * force-update floor and an announcement banner. The apps read it from the
 * public GET /api/v1/app-status/:app at startup.
 */

const APPS = [
  { key: "user", label: "Customer app", icon: Smartphone, mobile: true },
  { key: "web", label: "Website", icon: Globe, mobile: false },
  { key: "restaurant", label: "Restaurant app", icon: Store, mobile: true },
  { key: "delivery", label: "Delivery app", icon: Bike, mobile: true },
]

const MODES = [
  { key: "live", label: "Live", hint: "Everyone uses the app normally", icon: CheckCircle2, tone: "emerald" },
  { key: "coming_soon", label: "Coming soon", hint: "Shows a launch screen with an optional countdown", icon: Rocket, tone: "orange" },
  { key: "maintenance", label: "Maintenance", hint: "Temporarily blocks the app with a message", icon: Wrench, tone: "amber" },
]

const TONE_CLASSES = {
  emerald: "border-emerald-500 bg-emerald-50 text-emerald-800",
  orange: "border-orange-500 bg-orange-50 text-orange-800",
  amber: "border-amber-500 bg-amber-50 text-amber-800",
}

const DEFAULT_TITLES = {
  coming_soon: "Something delicious is coming soon",
  maintenance: "We'll be right back",
}

const BANNER_TONES = [
  { key: "info", label: "Info", cls: "bg-sky-50 text-sky-900 border-sky-200" },
  { key: "success", label: "Good news", cls: "bg-emerald-50 text-emerald-900 border-emerald-200" },
  { key: "warning", label: "Warning", cls: "bg-amber-50 text-amber-900 border-amber-200" },
]

/** ISO string -> value for <input type="datetime-local"> in the admin's own time zone. */
function toLocalInput(iso) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}

function countdownParts(launchAt, now) {
  const ms = new Date(launchAt).getTime() - now
  if (!Number.isFinite(ms) || ms <= 0) return null
  const s = Math.floor(ms / 1000)
  return [
    [Math.floor(s / 86400), "Days"],
    [Math.floor((s % 86400) / 3600), "Hrs"],
    [Math.floor((s % 3600) / 60), "Min"],
    [s % 60, "Sec"],
  ]
}

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-gray-800">{label}</Label>
      {children}
      {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
    </div>
  )
}

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div>
        <div className="text-sm font-medium text-gray-800">{label}</div>
        {hint ? <div className="text-xs text-gray-500 mt-0.5">{hint}</div> : null}
      </div>
      <Switch checked={Boolean(checked)} onCheckedChange={onChange} />
    </div>
  )
}

/** Phone-shaped preview of what customers will see. */
function Preview({ config, appLabel }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const mode = config.mode
  const banner = config.banner || {}
  const bannerTone = BANNER_TONES.find((t) => t.key === banner.tone) || BANNER_TONES[0]
  const parts = mode === "coming_soon" && config.showCountdown && config.launchAt ? countdownParts(config.launchAt, now) : null

  return (
    <div className="sticky top-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Preview · {appLabel}</div>
      <div className="mx-auto w-[280px] h-[560px] rounded-[2.2rem] border-[10px] border-gray-900 bg-white overflow-hidden shadow-xl">
        {mode === "live" ? (
          <div className="h-full flex flex-col">
            {banner.enabled && banner.text ? (
              <div className={`border-b px-3 py-2 text-xs font-medium ${bannerTone.cls}`}>{banner.text}</div>
            ) : null}
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400 p-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <div className="text-sm font-semibold text-gray-700">App is live</div>
              <div className="text-xs">
                {banner.enabled && banner.text ? "The banner shows at the top of the app." : "Nothing blocks the app."}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 bg-gradient-to-b from-orange-50 to-white">
            {config.imageUrl ? (
              <img src={config.imageUrl} alt="" className="w-36 h-36 object-contain mb-4" />
            ) : (
              <div className="w-20 h-20 rounded-3xl bg-[#F54A00] flex items-center justify-center mb-5">
                {mode === "maintenance" ? <Wrench className="h-9 w-9 text-white" /> : <Rocket className="h-9 w-9 text-white" />}
              </div>
            )}
            <div className="text-lg font-extrabold text-[#061A19] leading-tight">
              {config.title || DEFAULT_TITLES[mode]}
            </div>
            {config.message ? <div className="text-xs text-gray-600 mt-2 whitespace-pre-line">{config.message}</div> : null}
            {parts ? (
              <div className="mt-5 grid grid-cols-4 gap-1.5 w-full">
                {parts.map(([v, l]) => (
                  <div key={l} className="rounded-xl bg-white border border-orange-100 py-2">
                    <div className="text-base font-extrabold text-[#F54A00] tabular-nums">{String(v).padStart(2, "0")}</div>
                    <div className="text-[10px] text-gray-500">{l}</div>
                  </div>
                ))}
              </div>
            ) : null}
            {config.contactEmail || config.contactPhone ? (
              <div className="mt-5 text-[11px] text-gray-500">
                {[config.contactEmail, config.contactPhone].filter(Boolean).join(" · ")}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

export default function AppStatus() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [active, setActive] = useState("user")
  const [configs, setConfigs] = useState({})
  const [saved, setSaved] = useState({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await adminAPI.getAppStatus()
        const apps = res?.data?.data?.apps || []
        const map = Object.fromEntries(apps.map((a) => [a.app, a.config]))
        if (!cancelled) {
          setConfigs(map)
          setSaved(map)
        }
      } catch (error) {
        toast.error(error?.response?.data?.message || "Failed to load app status.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const appMeta = APPS.find((a) => a.key === active) || APPS[0]
  const config = configs[active]
  const dirty = useMemo(
    () => JSON.stringify(configs[active] || null) !== JSON.stringify(saved[active] || null),
    [configs, saved, active],
  )

  // Every app with edits that are not saved yet, so switching tabs never hides them.
  const unsavedApps = APPS.filter((a) => configs[a.key] && JSON.stringify(configs[a.key]) !== JSON.stringify(saved[a.key] || null))

  // Changes only reach the apps on Save; warn before they are lost.
  useEffect(() => {
    if (!unsavedApps.length) return undefined
    const warn = (e) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [unsavedApps.length])

  const discard = () => setConfigs((prev) => ({ ...prev, [active]: saved[active] }))

  const set = (patch) => setConfigs((prev) => ({ ...prev, [active]: { ...prev[active], ...patch } }))
  const setNested = (key, patch) =>
    setConfigs((prev) => ({ ...prev, [active]: { ...prev[active], [key]: { ...prev[active][key], ...patch } } }))

  const handleUpload = async (file) => {
    if (!file) return
    try {
      setUploading(true)
      const res = await uploadAPI.uploadMedia(file, { folder: "craviox/app-status" })
      const url = res?.data?.data?.url
      if (!url) throw new Error("Upload returned no URL")
      set({ imageUrl: url })
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Image upload failed.")
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const res = await adminAPI.updateAppStatus(active, configs[active])
      const next = res?.data?.data?.config || configs[active]
      setConfigs((prev) => ({ ...prev, [active]: next }))
      setSaved((prev) => ({ ...prev, [active]: next }))
      const live = next.mode === "live"
      toast.success(
        live
          ? `${appMeta.label} is live.`
          : `${appMeta.label} now shows the ${next.mode === "maintenance" ? "maintenance" : "coming soon"} screen.`,
        {
          description:
            active === "web"
              ? "Visitors see it on their next page load (open tabs within 2 minutes)."
              : "Shown in app versions that include App Status, on next open.",
          ...(active === "web" ? { action: { label: "Open site", onClick: () => window.open("/home", "_blank", "noopener") } } : {}),
        },
      )
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save.")
    } finally {
      setSaving(false)
    }
  }

  const copy = (text) => {
    navigator.clipboard?.writeText(text).then(
      () => toast.success("Copied"),
      () => toast.error("Couldn't copy"),
    )
  }

  if (loading) {
    return (
      <div className="flex h-[320px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }
  if (!config) {
    return <div className="p-6 text-sm text-gray-600">App status could not be loaded. Reload the page to try again.</div>
  }

  const apiUrl = `${window.location.origin}/api/v1/app-status/${active}`
  const gated = config.mode !== "live"

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">App Status</h1>
          <p className="text-sm text-gray-500 mt-1">
            Put any app in coming soon or maintenance, force old versions to update, and show announcements.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving || !dirty}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {dirty ? `Save ${appMeta.label}` : "Saved"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {APPS.map((a) => {
          const m = configs[a.key]?.mode || "live"
          const modeMeta = MODES.find((x) => x.key === m)
          const Icon = a.icon
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => setActive(a.key)}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                active === a.key ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
              }`}
            >
              <Icon className="h-4 w-4" />
              {a.label}
              <span
                className={`ml-1 rounded-full px-2 py-0.5 text-[11px] ${
                  m === "live" ? "bg-emerald-100 text-emerald-800" : m === "maintenance" ? "bg-amber-100 text-amber-800" : "bg-orange-100 text-orange-800"
                }`}
              >
                {modeMeta?.label}
              </span>
            </button>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5 min-w-0">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg">Status</CardTitle>
              <CardDescription>What happens when someone opens the {appMeta.label.toLowerCase()}.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              {MODES.map((m) => {
                const Icon = m.icon
                const on = config.mode === m.key
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => set({ mode: m.key })}
                    className={`rounded-xl border-2 p-4 text-left transition ${on ? TONE_CLASSES[m.tone] : "border-gray-200 hover:border-gray-300"}`}
                  >
                    <Icon className="h-5 w-5 mb-2" />
                    <div className="font-semibold text-sm">{m.label}</div>
                    <div className="text-xs opacity-80 mt-1">{m.hint}</div>
                  </button>
                )
              })}
            </CardContent>
          </Card>

          <Card className={`border-slate-200 ${gated ? "" : "opacity-60"}`}>
            <CardHeader>
              <CardTitle className="text-lg">Launch screen</CardTitle>
              <CardDescription>
                {gated ? "Shown instead of the app while it is not live." : "Used when the app is set to coming soon or maintenance."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Title" hint={`Leave empty for "${DEFAULT_TITLES[config.mode] || DEFAULT_TITLES.coming_soon}"`}>
                <Input value={config.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} placeholder="Craviox is launching in Jabalpur" />
              </Field>
              <Field label="Message">
                <Textarea
                  rows={3}
                  value={config.message}
                  maxLength={1000}
                  onChange={(e) => set({ message: e.target.value })}
                  placeholder="Hot food from the best local restaurants, delivered fast. Stay tuned!"
                />
              </Field>
              <Field label="Image" hint="Optional. Shown above the title; the Craviox mark is used otherwise.">
                <div className="flex items-center gap-3">
                  {config.imageUrl ? (
                    <div className="relative">
                      <img src={config.imageUrl} alt="" className="h-16 w-16 rounded-lg border object-contain bg-gray-50" />
                      <button
                        type="button"
                        onClick={() => set({ imageUrl: "" })}
                        className="absolute -right-2 -top-2 rounded-full bg-white border p-0.5 shadow"
                        aria-label="Remove image"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {config.imageUrl ? "Replace" : "Upload image"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        handleUpload(e.target.files?.[0])
                        e.target.value = ""
                      }}
                    />
                  </label>
                </div>
              </Field>

              {config.mode !== "maintenance" ? (
                <div className="rounded-xl border border-dashed p-4 space-y-3">
                  <Field label="Launch date & time" hint="Your local time. Leave empty if there's no date yet.">
                    <div className="flex gap-2">
                      <Input
                        type="datetime-local"
                        value={toLocalInput(config.launchAt)}
                        onChange={(e) => set({ launchAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                        className="max-w-xs"
                      />
                      {config.launchAt ? (
                        <Button type="button" variant="outline" onClick={() => set({ launchAt: null })}>
                          Clear
                        </Button>
                      ) : null}
                    </div>
                  </Field>
                  <ToggleRow
                    label="Show countdown"
                    hint="Days, hours, minutes and seconds to the launch."
                    checked={config.showCountdown}
                    onChange={(v) => set({ showCountdown: v })}
                  />
                  <ToggleRow
                    label="Go live automatically at launch time"
                    hint="No one has to flip the switch: the app opens for everyone once the time passes."
                    checked={config.autoLiveAtLaunch}
                    onChange={(v) => set({ autoLiveAtLaunch: v })}
                  />
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Contact email" hint="Optional, shown on the screen.">
                  <Input value={config.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} placeholder="support@craviox.com" />
                </Field>
                <Field label="Contact phone" hint="Optional, shown on the screen.">
                  <Input value={config.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} placeholder="+91 …" />
                </Field>
              </div>

              <Field
                label="Team access code"
                hint="Your team types this on the launch screen (tap the logo 5 times) to use the app before launch. Leave empty to turn off."
              >
                <div className="flex gap-2">
                  <Input
                    value={config.accessCode}
                    maxLength={64}
                    onChange={(e) => set({ accessCode: e.target.value.trim() })}
                    placeholder="No code"
                    className="max-w-xs font-mono"
                  />
                  <Button type="button" variant="outline" onClick={() => set({ accessCode: randomCode() })}>
                    <RefreshCw className="h-4 w-4 mr-1.5" /> Generate
                  </Button>
                  {config.accessCode ? (
                    <Button type="button" variant="outline" onClick={() => copy(config.accessCode)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </Field>
            </CardContent>
          </Card>

          {appMeta.mobile ? (
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg">App updates</CardTitle>
                <CardDescription>
                  Builds older than the minimum version are blocked until updated. Builds older than the latest version get a skippable prompt.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Minimum version (force update)" hint="e.g. 1.2.0 — empty means never forced.">
                    <Input value={config.update.minVersion} onChange={(e) => setNested("update", { minVersion: e.target.value.trim() })} placeholder="1.0.0" />
                  </Field>
                  <Field label="Latest version (optional update)" hint="e.g. 1.3.0">
                    <Input value={config.update.latestVersion} onChange={(e) => setNested("update", { latestVersion: e.target.value.trim() })} placeholder="1.0.0" />
                  </Field>
                </div>
                <Field label="Update message">
                  <Input
                    value={config.update.message}
                    maxLength={300}
                    onChange={(e) => setNested("update", { message: e.target.value })}
                    placeholder="A new version with faster checkout is available."
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Play Store link">
                    <Input value={config.update.androidUrl} onChange={(e) => setNested("update", { androidUrl: e.target.value.trim() })} placeholder="https://play.google.com/store/apps/details?id=…" />
                  </Field>
                  <Field label="App Store link">
                    <Input value={config.update.iosUrl} onChange={(e) => setNested("update", { iosUrl: e.target.value.trim() })} placeholder="https://apps.apple.com/app/…" />
                  </Field>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg">Announcement banner</CardTitle>
              <CardDescription>A strip at the top of the live app, e.g. "Free delivery this weekend" or "Rain may delay orders".</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ToggleRow label="Show banner" checked={config.banner.enabled} onChange={(v) => setNested("banner", { enabled: v })} />
              <Field label="Text">
                <Input value={config.banner.text} maxLength={200} onChange={(e) => setNested("banner", { text: e.target.value })} placeholder="Free delivery on all orders this weekend!" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <Field label="Link (optional)" hint="Opens when the banner is tapped. A path like /food/user/offers or a full URL.">
                  <Input value={config.banner.link} onChange={(e) => setNested("banner", { link: e.target.value.trim() })} placeholder="/food/user/offers" />
                </Field>
                <Field label="Style">
                  <div className="flex gap-1.5">
                    {BANNER_TONES.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setNested("banner", { tone: t.key })}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium ${t.cls} ${config.banner.tone === t.key ? "ring-2 ring-gray-900" : ""}`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg">For developers</CardTitle>
              <CardDescription>
                Public endpoint the app reads at startup. Optional query: <code>version</code>, <code>platform</code> (android/ios),{" "}
                <code>code</code> (team access code).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 rounded-lg bg-gray-50 border px-3 py-2 font-mono text-xs text-gray-700">
                <span className="truncate">GET {apiUrl}</span>
                <button type="button" className="ml-auto shrink-0" onClick={() => copy(apiUrl)} aria-label="Copy URL">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Preview config={config} appLabel={appMeta.label} />
      </div>

      {unsavedApps.length ? (
        <div className="sticky bottom-4 z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-3 rounded-2xl border border-orange-200 bg-white px-4 py-3 shadow-xl">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#F54A00]" />
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold text-gray-900">Not saved yet</div>
            <div className="text-gray-600">
              {unsavedApps.map((a) => a.label).join(", ")} {unsavedApps.length === 1 ? "has" : "have"} changes that customers won't see until you save.
            </div>
          </div>
          {dirty ? (
            <>
              <Button variant="outline" onClick={discard} disabled={saving}>Discard</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save {appMeta.label}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setActive(unsavedApps[0].key)}>Go to {unsavedApps[0].label}</Button>
          )}
        </div>
      ) : null}
    </div>
  )
}
