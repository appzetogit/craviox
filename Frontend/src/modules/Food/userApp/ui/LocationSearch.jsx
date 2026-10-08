import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useDeliveryLocation } from "@food/context/DeliveryLocationContext"
import Icon from "./Icon"
import { applyDeliveryLocation, gpsFailureMessage, resolvePlace, usePlaceSuggestions } from "../data/placeSearch"

/**
 * "Enter your delivery location": type an area for Google suggestions, or use
 * GPS. `variant="hero"` is the desktop landing field; `"panel"` the phone one.
 */
export default function LocationSearch({ variant = "panel", autoFocus = false, onDone }) {
  const { requestLiveLocation, defaultSavedAddress } = useDeliveryLocation() || {}
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null) // "gps" | placeId
  const [error, setError] = useState("")
  const { items, loading } = usePlaceSuggestions(query)
  const box = useRef(null)

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false)
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [])

  const useGps = async () => {
    setBusy("gps")
    setError("")
    try {
      const loc = await requestLiveLocation?.()
      if (loc && Number.isFinite(Number(loc.latitude))) {
        setOpen(false)
        onDone?.(loc)
      } else {
        setError(await gpsFailureMessage(null))
      }
    } catch (err) {
      setError(await gpsFailureMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const pick = async (s) => {
    setBusy(s.id)
    setError("")
    try {
      const loc = await resolvePlace(s)
      applyDeliveryLocation(loc, { hasSavedDefault: Boolean(defaultSavedAddress) })
      setQuery(s.main)
      setOpen(false)
      toast.success(`Delivering to ${loc.area || s.main}`)
      onDone?.(loc)
    } catch (err) {
      setError(err?.message || "Couldn't use that place. Try another.")
    } finally {
      setBusy(null)
    }
  }

  const hero = variant === "hero"
  const showList = open && (query.trim().length >= 3 || true)

  return (
    <div ref={box} className="relative w-full text-left">
      <div
        className={`flex items-center bg-white ${hero ? "h-[60px] rounded-2xl px-4" : "h-[52px] rounded-2xl border border-[#E2E8F0] px-3.5"}`}
        style={hero ? { boxShadow: "0 8px 24px rgba(0,0,0,0.12)" } : undefined}
      >
        <Icon name="location_on" size={hero ? 24 : 22} color="var(--ca-primary)" />
        <input
          type="text"
          value={query}
          autoFocus={autoFocus}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setError("")
          }}
          placeholder="Enter your delivery location"
          aria-label="Delivery location"
          className={`ml-2.5 min-w-0 flex-1 bg-transparent font-medium text-[#0F172A] outline-none placeholder:text-[#94A3B8] ${hero ? "text-base" : "text-[14.5px]"}`}
        />
        {query && (
          <button type="button" aria-label="Clear" onClick={() => setQuery("")} className="flex p-1">
            <Icon name="close" size={18} color="#94A3B8" />
          </button>
        )}
        <Icon name="keyboard_arrow_down" size={22} color="#64748B" />
      </div>

      {showList && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-white text-[#0F172A]"
          style={{ boxShadow: "0 12px 32px rgba(15,23,42,0.18)" }}
        >
          <button
            type="button"
            onClick={useGps}
            disabled={busy === "gps"}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-[#FFF5F2]"
          >
            {busy === "gps" ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#FECACA] border-t-[var(--ca-primary)]" />
            ) : (
              <Icon name="my_location" size={20} color="var(--ca-primary)" />
            )}
            <span>
              <span className="block text-[14.5px] font-bold" style={{ color: "var(--ca-primary)" }}>
                {busy === "gps" ? "Detecting your location…" : "Use my current location"}
              </span>
              <span className="block text-xs text-[#64748B]">Using GPS</span>
            </span>
          </button>
          {error && <p className="border-t border-[#F1F5F9] px-4 py-3 text-[13px] font-medium text-[#B91C1C]">{error}</p>}
          {query.trim().length >= 3 && (
            <div className="border-t border-[#F1F5F9]">
              {loading && !items.length && <p className="px-4 py-3 text-[13px] text-[#64748B]">Searching…</p>}
              {!loading && !items.length && (
                <p className="px-4 py-3 text-[13px] text-[#64748B]">No places found. Try a nearby landmark or area.</p>
              )}
              {items.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pick(s)}
                  disabled={Boolean(busy)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[#F8FAFC] disabled:opacity-60"
                >
                  <Icon name="location_on" outlined size={20} color="#64748B" style={{ marginTop: 2 }} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-semibold">{s.main}</span>
                    {s.secondary && <span className="block truncate text-xs text-[#64748B]">{s.secondary}</span>}
                  </span>
                  {busy === s.id && (
                    <span className="ml-auto mt-1 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#E2E8F0] border-t-[var(--ca-primary)]" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
