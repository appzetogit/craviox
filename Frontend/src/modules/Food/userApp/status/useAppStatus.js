import { useCallback, useEffect, useState } from "react"

/**
 * Admin-controlled launch state (Admin → App Status), read from the public
 * GET /api/v1/app-status/:app.
 *
 * Fails open: if the request fails the site works as normal, so an API hiccup
 * can never lock customers out. The last answer is cached so a gated site does
 * not flash open for a moment on every load.
 */
const CACHE_KEY = (app) => `craviox_app_status_${app}`
const CODE_KEY = "craviox_access_code"
const REFRESH_MS = 2 * 60 * 1000

const base = () => String(import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "")

function readJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null")
  } catch {
    return null
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked (private mode): the status still works, just uncached.
  }
}

export function getSavedAccessCode() {
  try {
    return localStorage.getItem(CODE_KEY) || ""
  } catch {
    return ""
  }
}

export async function fetchAppStatus(app, code = getSavedAccessCode()) {
  const qs = code ? `?code=${encodeURIComponent(code)}` : ""
  const res = await fetch(`${base()}/app-status/${app}${qs}`, { cache: "no-store" })
  if (!res.ok) throw new Error(`status ${res.status}`)
  const body = await res.json()
  return body?.data || null
}

export function useAppStatus(app) {
  const [status, setStatus] = useState(() => readJSON(CACHE_KEY(app)))

  const refresh = useCallback(async () => {
    try {
      const next = await fetchAppStatus(app)
      if (next) {
        setStatus(next)
        writeJSON(CACHE_KEY(app), next)
      }
      return next
    } catch {
      return null
    }
  }, [app])

  useEffect(() => {
    refresh()
    const id = setInterval(() => {
      if (!document.hidden) refresh()
    }, REFRESH_MS)
    const onVisible = () => {
      if (!document.hidden) refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refresh])

  /** Checks a team access code; keeps it only if the server accepts it. */
  const unlock = useCallback(
    async (code) => {
      const next = await fetchAppStatus(app, code)
      if (!next?.bypass) return false
      try {
        localStorage.setItem(CODE_KEY, code)
      } catch {
        // Unlocks for this visit only.
      }
      setStatus(next)
      writeJSON(CACHE_KEY(app), next)
      return true
    },
    [app],
  )

  return { status, refresh, unlock }
}
