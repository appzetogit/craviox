import { useEffect, useRef, useState } from "react"
import { Rocket, Wrench, X, Mail, Phone, Lock } from "lucide-react"
import { useNavigate } from "react-router-dom"
import cravioxMark from "@food/assets/craviox-logo.png"
import wordmark from "@food/userApp/assets/craviox-wordmark.png"
import { useAppStatus } from "./useAppStatus"

const ORANGE = "#F54A00"
const INK = "#061A19"

/**
 * Shows the launch / maintenance screen instead of `children` while the admin
 * has this app gated, and the announcement banner above it when live.
 */
export default function AppStatusGate({ app, children }) {
  const { status, refresh, unlock } = useAppStatus(app)
  const gated = status && status.mode !== "live" && !status.bypass

  if (gated) return <LaunchScreen status={status} onUnlock={unlock} onLaunch={refresh} />
  return (
    <>
      {status?.banner?.enabled && status.banner.text ? <AnnouncementBanner banner={status.banner} /> : null}
      {children}
    </>
  )
}

function useCountdown(target) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!target) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [target])
  if (!target) return null
  const ms = new Date(target).getTime() - now
  if (!Number.isFinite(ms)) return null
  return Math.max(0, Math.floor(ms / 1000))
}

function LaunchScreen({ status, onUnlock, onLaunch }) {
  const maintenance = status.mode === "maintenance"
  const seconds = useCountdown(!maintenance && status.showCountdown ? status.launchAt : null)
  const launchedRef = useRef(false)
  const taps = useRef({ count: 0, last: 0 })
  const [askCode, setAskCode] = useState(false)

  // At zero, ask the server again: an auto-launch opens the site by itself.
  useEffect(() => {
    if (seconds === 0 && !launchedRef.current) {
      launchedRef.current = true
      onLaunch()
    }
  }, [seconds, onLaunch])

  useEffect(() => {
    const previous = document.title
    document.title = maintenance ? "Craviox · Back soon" : "Craviox · Coming soon"
    return () => {
      document.title = previous
    }
  }, [maintenance])

  // Five taps on the logo opens the team access-code box.
  // A ref, so taps faster than a re-render still all count; a pause resets it.
  const tapLogo = () => {
    const t = taps.current
    const now = Date.now()
    t.count = now - t.last > 1500 ? 1 : t.count + 1
    t.last = now
    if (t.count >= 5) {
      t.count = 0
      setAskCode(true)
    }
  }

  const parts =
    seconds != null && seconds > 0
      ? [
          [Math.floor(seconds / 86400), "Days"],
          [Math.floor((seconds % 86400) / 3600), "Hours"],
          [Math.floor((seconds % 3600) / 60), "Minutes"],
          [seconds % 60, "Seconds"],
        ]
      : null

  const launchDate =
    !maintenance && status.launchAt
      ? new Date(status.launchAt).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" })
      : null

  return (
    <div
      style={{ minHeight: "100dvh", color: INK, background: "radial-gradient(1200px 600px at 50% -10%, #FFE6D9 0%, #FFF6F1 45%, #FFFFFF 100%)" }}
      className="flex flex-col"
    >
      <header className="flex justify-center pt-8 px-4">
        <img src={wordmark} alt="Craviox" className="h-8 w-auto select-none" draggable={false} />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl text-center">
          <button type="button" onClick={tapLogo} className="mx-auto block focus:outline-none" aria-label="Craviox">
            {status.imageUrl ? (
              <img src={status.imageUrl} alt="" className="mx-auto h-44 w-44 md:h-56 md:w-56 object-contain" />
            ) : (
              <div className="relative mx-auto h-28 w-28 md:h-32 md:w-32">
                <div className="absolute inset-0 rounded-[2rem] animate-ping opacity-20" style={{ background: ORANGE }} />
                <div className="relative h-full w-full rounded-[2rem] bg-white shadow-xl flex items-center justify-center">
                  <img src={cravioxMark} alt="" className="h-16 w-16 md:h-20 md:w-20 object-contain" />
                </div>
              </div>
            )}
          </button>

          <div
            className="mt-8 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: maintenance ? "#FFF4D6" : "#FFE6D9", color: maintenance ? "#8A5A00" : ORANGE }}
          >
            {maintenance ? <Wrench className="h-3.5 w-3.5" /> : <Rocket className="h-3.5 w-3.5" />}
            {maintenance ? "Under maintenance" : "Coming soon"}
          </div>

          <h1 className="mt-4 text-3xl md:text-5xl font-extrabold leading-tight tracking-tight">{status.title}</h1>
          {status.message ? (
            <p className="mt-4 text-base md:text-lg text-[#4B5A59] whitespace-pre-line leading-relaxed">{status.message}</p>
          ) : null}

          {parts ? (
            <div className="mt-8 grid grid-cols-4 gap-2 md:gap-4 max-w-md mx-auto">
              {parts.map(([v, label]) => (
                <div key={label} className="rounded-2xl bg-white border border-[#FFD9C7] shadow-sm py-3 md:py-4">
                  <div className="text-2xl md:text-4xl font-extrabold tabular-nums" style={{ color: ORANGE }}>
                    {String(v).padStart(2, "0")}
                  </div>
                  <div className="text-[11px] md:text-xs text-[#6B7877] mt-1">{label}</div>
                </div>
              ))}
            </div>
          ) : null}
          {launchDate ? <p className="mt-4 text-sm text-[#6B7877]">Launching {launchDate}</p> : null}

          {status.contactEmail || status.contactPhone ? (
            <div className="mt-8 flex flex-wrap justify-center gap-3 text-sm">
              {status.contactEmail ? (
                <a href={`mailto:${status.contactEmail}`} className="inline-flex items-center gap-2 rounded-full bg-white border px-4 py-2 hover:border-[#F54A00]">
                  <Mail className="h-4 w-4" style={{ color: ORANGE }} /> {status.contactEmail}
                </a>
              ) : null}
              {status.contactPhone ? (
                <a href={`tel:${status.contactPhone.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 rounded-full bg-white border px-4 py-2 hover:border-[#F54A00]">
                  <Phone className="h-4 w-4" style={{ color: ORANGE }} /> {status.contactPhone}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </main>

      <footer className="pb-6 text-center text-xs text-[#8A9594]">© {new Date().getFullYear()} Craviox</footer>

      {askCode ? <AccessCodeDialog onClose={() => setAskCode(false)} onUnlock={onUnlock} /> : null}
    </div>
  )
}

function AccessCodeDialog({ onClose, onUnlock }) {
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const submit = async (e) => {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    setError("")
    try {
      const ok = await onUnlock(code.trim())
      if (!ok) setError("That code isn't right.")
    } catch {
      setError("Couldn't check the code. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl text-left">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold" style={{ color: INK }}>
            <Lock className="h-4 w-4" /> Team access
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Access code"
          className="mt-4 w-full rounded-xl border px-4 py-3 font-mono outline-none focus:border-[#F54A00]"
        />
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="mt-4 w-full rounded-xl py-3 font-semibold text-white disabled:opacity-50"
          style={{ background: ORANGE }}
        >
          {busy ? "Checking…" : "Enter"}
        </button>
      </form>
    </div>
  )
}

const BANNER_STYLES = {
  info: { background: "#E8F4FD", color: "#0B4A6F" },
  success: { background: "#E7F7EE", color: "#0B5132" },
  warning: { background: "#FFF4D6", color: "#7A4F00" },
}

function AnnouncementBanner({ banner }) {
  const navigate = useNavigate()
  const key = `craviox_banner_dismissed:${banner.text}`
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(key) === "1"
    } catch {
      return false
    }
  })
  if (hidden) return null

  const dismiss = (e) => {
    e.stopPropagation()
    setHidden(true)
    try {
      sessionStorage.setItem(key, "1")
    } catch {
      // Hidden for this page view only.
    }
  }
  const open = () => {
    const dest = String(banner.link || "").trim()
    if (!dest) return
    if (/^https?:\/\//i.test(dest)) window.open(dest, "_blank", "noopener")
    else navigate(dest.startsWith("/") ? dest : `/${dest}`)
  }

  return (
    <div
      role={banner.link ? "link" : undefined}
      onClick={open}
      className={`relative z-40 flex items-center justify-center gap-3 px-10 py-2 text-center text-[13px] font-medium ${banner.link ? "cursor-pointer" : ""}`}
      style={BANNER_STYLES[banner.tone] || BANNER_STYLES.info}
    >
      <span>{banner.text}</span>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="absolute right-3 opacity-70 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
