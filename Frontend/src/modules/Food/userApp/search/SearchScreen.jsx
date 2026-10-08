import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { searchAPI } from "@food/api"
import { useDeliveryLocation } from "@food/context/DeliveryLocationContext"
import { resolveMediaUrl } from "../../../../shared/utils/mediaUrl.js"
import AppShell from "../shell/AppShell"
import { CONTENT, DesktopPage } from "../shell/DesktopChrome"
import Icon from "../ui/Icon"
import PromotedTag from "../ui/PromotedTag"
import { useIsDesktop } from "../ui/hooks"
import { BackButton } from "../cart/CartScreen"
import { PromoBannerCarousel } from "../home/HomeWidgets"
import { useHomeData } from "../data/useHomeData"
import { toRestaurant } from "../data/restaurant"

const HISTORY_KEY = "professional_search_history_v1"
const readHistory = () => {
  try {
    const v = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]")
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []
  } catch {
    return []
  }
}
const writeHistory = (list) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list))
  } catch {
    // ignore
  }
}

function listen(onText) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) return toast.error("Voice search isn't supported in this browser.")
  const r = new SR()
  r.lang = "en-IN"
  r.interimResults = false
  r.onresult = (e) => {
    const t = e.results?.[0]?.[0]?.transcript?.trim()
    if (t) onText(t)
  }
  r.onerror = () => toast.error("Couldn't hear that. Try again.")
  toast("Listening…", { duration: 2500 })
  try {
    r.start()
  } catch {
    // already listening
  }
}

function RestaurantResult({ r, onOpen }) {
  return (
    <div role="button" tabIndex={0} onClick={() => onOpen(r)} className="flex cursor-pointer gap-2.5 rounded-2xl border border-[#E2E8F0] bg-white p-2.5" style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
      <span className="relative h-[110px] w-[110px] shrink-0 overflow-hidden rounded-[14px] bg-[#F1F5F9]">
        {r.imageUrl && <img src={r.imageUrl} alt="" loading="lazy" className={`h-full w-full object-cover ${r.isOpen ? "" : "grayscale"}`} />}
        {r.offerBadges[0] && (
          <span className="absolute left-1.5 top-1.5 max-w-[95px] truncate rounded px-1.5 py-0.5 text-[8.5px] font-black text-white" style={{ background: "var(--ca-primary)" }}>
            {r.offerBadges[0]}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[14.5px] font-black text-[#0F172A]">{r.name}</span>
          <span className="flex shrink-0 items-center gap-1 rounded-[10px] px-1.5 py-0.5 text-[9.5px] font-extrabold" style={{ background: r.isPureVeg ? "#DCFCE7" : "#FEE2E2", color: r.isPureVeg ? "#15803D" : "#B91C1C" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: r.isPureVeg ? "#16A34A" : "#EF4444" }} />
            {r.isPureVeg ? "Pure Veg" : "Non-Veg"}
          </span>
        </span>
        {r.area && <span className="block truncate text-[10.5px] font-medium text-[#64748B]">{r.area}</span>}
        {r.tags.length > 0 && <span className="block truncate text-[10.5px] font-medium text-[#64748B]">{r.tags.join(" • ")}</span>}
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px] font-semibold text-[#475569]">
          {r.rating > 0 && (
            <span className="flex items-center gap-0.5 rounded bg-[#16A34A] px-1.5 py-0.5 text-[9.5px] font-bold text-white">
              <Icon name="star" size={10} color="#fff" />
              {r.rating.toFixed(1)}
            </span>
          )}
          {r.reviewCount > 0 && <span className="text-[9.5px] text-[#64748B]">({r.reviewCount})</span>}
          {r.deliveryTime && <span>• {r.deliveryTime}</span>}
          {r.priceForOne > 0 && <span className="text-[9.5px]">• ₹{Math.round(r.priceForOne)} for one</span>}
        </span>
        <span className="mt-1.5 flex items-center gap-1.5">
          {!r.isOpen && <span className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-[8.5px] font-extrabold text-[#64748B]">CLOSED NOW</span>}
          {r.isPromoted && <PromotedTag fontSize={8.5} compact />}
        </span>
      </span>
    </div>
  )
}

function DishResult({ d, onOpen }) {
  return (
    <div role="button" tabIndex={0} onClick={() => onOpen(d)} className="flex cursor-pointer gap-2.5 rounded-2xl border border-[#E2E8F0] bg-white p-2.5" style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
      <span className="h-[84px] w-[84px] shrink-0 overflow-hidden rounded-xl bg-[#F1F5F9]">
        {d.image && <img src={d.image} alt="" loading="lazy" className="h-full w-full object-cover" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-extrabold text-[#0F172A]">{d.name}</span>
        <span className="mt-0.5 block truncate text-[11.5px] font-medium text-[#64748B]">from {d.restaurant}</span>
        {d.tags && <span className="block truncate text-[11px] text-[#94A3B8]">{d.tags}</span>}
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold" style={{ color: "var(--ca-primary)" }}>
          View in menu
          <Icon name="chevron_right" size={16} />
        </span>
      </span>
    </div>
  )
}

/** Search tab (search_screen.dart). */
export default function SearchScreen() {
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()
  const [params, setParams] = useSearchParams()
  const { zoneId, effectiveLocation } = useDeliveryLocation() || {}
  const { restaurants: nearby, categories, banners } = useHomeData()
  const [query, setQuery] = useState(params.get("q") || "")
  const [categoryId, setCategoryId] = useState(params.get("cat") || "")
  const [tab, setTab] = useState("restaurants")
  const [results, setResults] = useState({ restaurants: [], dishes: [], loading: false })
  const [history, setHistory] = useState(readHistory)
  const seq = useRef(0)
  const inputRef = useRef(null)

  const remember = (term) => {
    const t = String(term || "").trim()
    if (!t) return
    const next = [t, ...history.filter((h) => h.toLowerCase() !== t.toLowerCase())].slice(0, 8)
    setHistory(next)
    writeHistory(next)
  }

  useEffect(() => {
    if (params.get("voice") === "true") listen((t) => { setQuery(t); remember(t) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced unified search, scoped to the delivery zone like before.
  useEffect(() => {
    const q = query.trim()
    const next = new URLSearchParams()
    if (q) next.set("q", q)
    if (categoryId) next.set("cat", categoryId)
    setParams(next, { replace: true })
    if (!q && !categoryId) {
      setResults({ restaurants: [], dishes: [], loading: false })
      return undefined
    }
    const mine = ++seq.current
    setResults((r) => ({ ...r, loading: true }))
    const t = setTimeout(async () => {
      try {
        const res = await searchAPI.unifiedSearch({
          q,
          categoryId: categoryId || undefined,
          lat: effectiveLocation?.latitude,
          lng: effectiveLocation?.longitude,
          zoneId: zoneId || undefined,
          strictZone: categoryId ? "true" : "false",
        })
        if (mine !== seq.current) return
        const rows = (res?.data?.data?.restaurants || []).filter((row) => {
          const z = row.zoneId || row.zone?._id || row.zone
          return !zoneId || !z || String(z) === String(zoneId)
        })
        const restaurants = []
        const dishes = []
        for (const row of rows) {
          if (row.matchType === "food") {
            const r = toRestaurant(row)
            dishes.push({
              id: `${row._id}-${row.matchedDishId}`,
              dishId: row.matchedDishId,
              slug: r.slug || row._id,
              name: row.matchedDish || r.name,
              image: row.matchedDishImage ? resolveMediaUrl(row.matchedDishImage) : r.imageUrl,
              restaurant: r.name,
              tags: r.tags.slice(0, 3).join(" • "),
            })
          } else {
            restaurants.push(toRestaurant(row))
          }
        }
        setResults({ restaurants, dishes, loading: false })
        if (!restaurants.length && dishes.length) setTab("items")
      } catch {
        if (mine === seq.current) setResults({ restaurants: [], dishes: [], loading: false })
      }
    }, 450)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, categoryId, zoneId, effectiveLocation?.latitude, effectiveLocation?.longitude])

  const searching = Boolean(query.trim() || categoryId)
  const restaurantList = searching ? results.restaurants : nearby.list
  const selectedCategory = categories.list.find((c) => String(c.id) === String(categoryId))

  const openRestaurant = (r) => {
    remember(query)
    navigate(`/food/user/restaurants/${r.slug || r.id}`)
  }
  const openDish = (d) => {
    remember(query)
    navigate(`/food/user/restaurants/${d.slug}${d.dishId ? `?dish=${d.dishId}` : ""}`)
  }
  const placeholders = useMemo(() => categories.list.map((c) => c.name), [categories.list])

  const bar = (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        remember(query)
        inputRef.current?.blur()
      }}
      className={`flex min-w-0 flex-1 items-center rounded-3xl bg-white px-3.5 transition-shadow focus-within:shadow-[0_4px_16px_rgba(245,74,0,0.22)] ${isDesktop ? "h-14" : "h-12"}`}
      style={{ border: "1.2px solid rgba(245,74,0,0.35)", boxShadow: "0 3px 10px rgba(0,0,0,0.06)" }}
    >
      <Icon name="search" size={22} color="#64748B" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
        placeholder={placeholders.length ? `Search "${placeholders[0]}"` : "Search for dishes and restaurants"}
        aria-label="Search for dishes and restaurants"
        className="ml-2.5 min-w-0 flex-1 bg-transparent text-sm text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
      />
      {query && (
        <button type="button" aria-label="Clear" onClick={() => setQuery("")} className="flex p-1">
          <Icon name="close" size={20} color="#94A3B8" />
        </button>
      )}
      <span className="mx-1.5 h-5 w-px bg-[#E2E8F0]" />
      <button type="button" aria-label="Search by voice" onClick={() => listen((t) => { setQuery(t); remember(t) })} className="flex p-1">
        <Icon name="mic" outlined size={22} color="var(--ca-primary)" />
      </button>
    </form>
  )

  const tabs = (
    <div className="flex rounded-2xl bg-[#F1F5F9] p-1">
      {[
        ["restaurants", "storefront", "Search Restaurants", "Find your favorite restaurant"],
        ["items", "soup_kitchen", "Search Items", "Find your favorite food"],
      ].map(([key, icon, label, sub]) => {
        const on = tab === key
        return (
          <button key={key} type="button" onClick={() => setTab(key)} className="flex flex-1 flex-col items-center rounded-xl py-2.5" style={{ background: on ? "var(--ca-primary)" : "transparent" }}>
            <span className="flex items-center gap-1.5 text-[13px] font-black" style={{ color: on ? "#fff" : "#0F172A" }}>
              <Icon name={icon} outlined={!on} size={18} color={on ? "#fff" : "#475569"} />
              {label}
            </span>
            <span className="text-[10px] font-medium" style={{ color: on ? "rgba(255,255,255,0.9)" : "#64748B" }}>{sub}</span>
          </button>
        )
      })}
    </div>
  )

  const recent = history.length > 0 && !searching && (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-[#0F172A]">Recent Searches</h2>
        <button type="button" onClick={() => { setHistory([]); writeHistory([]) }} className="text-xs font-extrabold" style={{ color: "var(--ca-primary)" }}>
          Clear All
        </button>
      </div>
      <div className="ca-noscroll mt-2.5 flex gap-2 overflow-x-auto">
        {history.map((h) => (
          <button key={h} type="button" onClick={() => setQuery(h)} className="flex shrink-0 items-center gap-1.5 rounded-[20px] border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#0F172A]">
            <Icon name="schedule" outlined size={13} color="#64748B" />
            {h}
          </button>
        ))}
      </div>
    </div>
  )

  const selectedChip = selectedCategory && (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-[#64748B]">Category:</span>
      <button type="button" onClick={() => setCategoryId("")} className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: "var(--ca-primary)" }}>
        {selectedCategory.name}
        <Icon name="close" size={14} />
      </button>
    </div>
  )

  const resultsHeader = (title, n) => (
    <div className="mb-3 flex items-baseline justify-between">
      <p className="text-[15px] font-black text-[#0F172A]">
        {title} <span className="text-xs font-medium text-[#64748B]">({n} {n === 1 ? "result" : "results"})</span>
      </p>
    </div>
  )

  const spinner = (
    <div className="flex justify-center py-8">
      <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#E2E8F0] border-t-[var(--ca-primary)]" />
    </div>
  )

  const resultsBlock =
    tab === "restaurants" ? (
      (results.loading && searching) || (!searching && nearby.loading) ? (
        spinner
      ) : searching && !restaurantList.length ? (
        <p className="py-6 text-center text-[13px] text-[#64748B]">No results for &quot;{query.trim() || selectedCategory?.name}&quot;</p>
      ) : (
        <div>
          {resultsHeader(searching ? "Top Restaurant Results" : "Restaurants near you", restaurantList.length)}
          <div className={isDesktop ? "grid grid-cols-2 gap-3" : "space-y-3"}>
            {restaurantList.map((r) => (
              <RestaurantResult key={r.id} r={r} onOpen={openRestaurant} />
            ))}
          </div>
        </div>
      )
    ) : !searching ? (
      <p className="py-6 text-center text-[13px] text-[#64748B]">Type a dish name to search the menus near you.</p>
    ) : results.loading ? (
      spinner
    ) : !results.dishes.length ? (
      <p className="py-6 text-center text-[13px] font-semibold text-[#64748B]">No items match &quot;{query.trim()}&quot;</p>
    ) : (
      <div>
        {resultsHeader("Item Results", results.dishes.length)}
        <div className={isDesktop ? "grid grid-cols-2 gap-3" : "space-y-3"}>
          {results.dishes.map((d) => (
            <DishResult key={d.id} d={d} onOpen={openDish} />
          ))}
        </div>
      </div>
    )

  const popular = !searching && categories.list.length > 0 && (
    <div>
      <h2 className="mb-2.5 text-sm font-black text-[#0F172A]">Popular Searches</h2>
      <div className={isDesktop ? "flex flex-wrap gap-2.5" : "ca-noscroll flex gap-2.5 overflow-x-auto"}>
        {categories.list.map((c) => (
          <button key={c.id} type="button" onClick={() => setCategoryId(c.id)} className="flex h-[74px] w-16 shrink-0 flex-col items-center justify-center rounded-[14px] border border-[#E2E8F0] bg-white px-1">
            {c.imageUrl ? <img src={c.imageUrl} alt="" loading="lazy" className="h-8 w-8 rounded-full object-cover" /> : <Icon name="restaurant" size={24} color="#CBD5E1" />}
            <span className="mt-1 w-full truncate text-center text-[10px] font-extrabold text-[#0F172A]">{c.name}</span>
          </button>
        ))}
      </div>
    </div>
  )

  const content = (
    <div className="space-y-3.5">
      {tabs}
      {selectedChip}
      {recent}
      {popular}
      {resultsBlock}
      {!searching && banners.length > 0 && (
        <div className={isDesktop ? "max-w-[720px]" : ""}>
          <PromoBannerCarousel banners={banners} onTap={(b) => b.link && navigate(b.link.startsWith("/") ? b.link : `/${b.link}`)} />
        </div>
      )}
    </div>
  )

  if (isDesktop) {
    return (
      <DesktopPage>
        <div className={`${CONTENT} pb-20 pt-8`}>
          <div className="mb-6 flex items-center gap-3">{bar}</div>
          {content}
        </div>
      </DesktopPage>
    )
  }

  return (
    <AppShell>
      <div className="min-h-[100dvh]" style={{ background: "var(--ca-bg)" }}>
        <header className="flex items-center gap-2 px-4 py-1.5 pt-[calc(6px+env(safe-area-inset-top,0px))]">
          <BackButton />
          {bar}
        </header>
        <div className="px-4 pb-10 pt-2.5">{content}</div>
      </div>
    </AppShell>
  )
}
