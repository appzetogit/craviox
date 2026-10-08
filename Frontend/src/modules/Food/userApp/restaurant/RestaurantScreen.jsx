import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useCart } from "@food/context/CartContext"
import { useDeliveryLocation } from "@food/context/DeliveryLocationContext"
import { getUserRestaurantDistance, normalizeRestaurantLocation } from "@food/utils/geo"
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability"
import AppShell from "../shell/AppShell"
import FloatingViewCartBar from "../shell/FloatingViewCartBar"
import Icon from "../ui/Icon"
import { useIsDesktop, useRotatingIndex } from "../ui/hooks"
import { DesktopPage } from "../shell/DesktopChrome"
import DesktopRestaurant from "./DesktopRestaurant"
import { useFavoriteToggle } from "../home/RestaurantCard"
import { addonsForDish, useRestaurantPage } from "../data/restaurantPage"
import { useDishCart } from "../data/useDishCart"
import { BestsellerCard, DishCard, VegMark } from "./DishParts"
import { DishSheet, MenuIndexSheet } from "./DishSheet"

const STICKY_HEADER = 160
const CATEGORY_EMOJI = {
  recommended: "⭐️", bestsellers: "🔥", combos: "🎁", biryani: "🥣", kebabs: "🍢", rolls: "🌯", curries: "🍲",
  rice: "🍚", breads: "🍞", beverages: "🥤", desserts: "🍰", pizza: "🍕", burgers: "🍔", chicken: "🍗", "main course": "🍲",
}
const sectionId = (name) => `menu-${encodeURIComponent(name)}`

function goBack(navigate) {
  if (window.history.length > 1) navigate(-1)
  else navigate("/home")
}

function Stat({ icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center">
      <span className="flex items-center gap-1">
        <Icon name={icon} outlined size={14} color="#475569" />
        <span className="text-[11.5px] font-extrabold text-[#0F172A]">{title}</span>
      </span>
      <span className="mt-0.5 text-[9.5px] font-medium text-[#64748B]">{subtitle}</span>
    </div>
  )
}

function Header({ r, raw, distanceLabel, isOpen }) {
  const navigate = useNavigate()
  const [fav, toggleFav] = useFavoriteToggle(r)
  const cover = r.coverImages[0] || r.imageUrl
  const rating = r.rating > 0 ? r.rating.toFixed(1) : "—"
  const ratings = r.reviewCount > 0 ? `${r.reviewCount} ratings` : "No ratings yet"
  const meta = [r.priceForOne > 0 ? `₹${Math.round(r.priceForOne)} for one` : "", r.deliveryTime, distanceLabel].filter(Boolean).join(" • ")
  const freeDelivery = raw?.isFreeDelivery === true || raw?.freeDelivery === true

  return (
    <div className="relative">
      <div className="h-[175px] bg-[#E2E8F0]">{cover && <img src={cover} alt="" className="h-full w-full object-cover" />}</div>
      <div className="absolute inset-x-0 top-0 flex justify-between px-4 pt-[calc(8px+env(safe-area-inset-top,0px))]">
        <button type="button" aria-label="Back" onClick={() => goBack(navigate)} className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-black/45">
          <Icon name="arrow_back" size={20} color="#fff" />
        </button>
        <button type="button" aria-label={fav ? "Remove from favourites" : "Add to favourites"} onClick={toggleFav} className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-black/45">
          <Icon name="favorite" outlined={!fav} size={20} color={fav ? "#EF4444" : "#fff"} />
        </button>
      </div>

      <div className="relative -mt-[60px] mx-4 rounded-[22px] border border-[#E2E8F0] bg-white p-2.5 dark:bg-[#1B1B1B]" style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
        <div className="flex items-start">
          <span className="h-[42px] w-[42px] shrink-0 overflow-hidden rounded-full border-2 border-white bg-black" style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.12)" }}>
            {r.logoUrl && <img src={r.logoUrl} alt="" className="h-full w-full object-cover" />}
          </span>
          <div className="ml-3 min-w-0 flex-1">
            <span className="inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5" style={{ background: "var(--ca-primary-tint)" }}>
              <span className="text-[10.5px] font-black" style={{ color: "var(--ca-primary)" }}>{rating} ★</span>
              <span className="truncate text-[10px] font-medium text-[#64748B]">{ratings}</span>
            </span>
            <h1 className="mt-[3px] truncate text-[17px] font-black tracking-[-0.3px]" style={{ color: "var(--ca-title)" }}>{r.name}</h1>
            {r.tags.length > 0 && <p className="mt-0.5 truncate text-[11.5px] font-medium text-[#64748B]">{r.tags.join(", ")}</p>}
            {meta && <p className="mt-0.5 truncate text-[11.5px] font-semibold text-[#64748B]">{meta}</p>}
            {freeDelivery && (
              <p className="mt-[3px] flex items-center gap-1 text-[10px] font-black tracking-[0.2px]" style={{ color: "var(--ca-primary)" }}>
                <Icon name="two_wheeler" size={14} />
                FREE DELIVERY
              </p>
            )}
          </div>
          <div className="ml-1.5 flex flex-col items-center">
            <span
              className="line-clamp-2 max-w-[92px] rounded-[14px] px-2 py-2 text-center text-[13px] font-black"
              style={{ background: "var(--ca-primary-tint)", border: "1px solid rgba(245,74,0,0.3)", color: "var(--ca-primary)" }}
            >
              {r.offerBadges[0] || "No offer"}
            </span>
            {r.isPureVeg && (
              <span className="mt-2">
                <VegMark veg size={13} />
              </span>
            )}
          </div>
        </div>
        <div className="mb-1 mt-1.5 h-px bg-[#F1F5F9]" />
        <div className="flex items-center justify-around">
          <Stat icon="timer" title={r.deliveryTime || "—"} subtitle="Delivery Time" />
          <span className="h-6 w-px bg-[#E2E8F0]" />
          <Stat icon="location_on" title={distanceLabel || "—"} subtitle="Distance" />
          <span className="h-6 w-px bg-[#E2E8F0]" />
          <Stat icon="star" title={rating} subtitle={r.reviewCount > 0 ? `${r.reviewCount} ratings` : "Ratings"} />
        </div>
      </div>

      {!isOpen && (
        <div className="mx-4 mt-3 flex gap-2 rounded-xl border px-3 py-2.5" style={{ background: "var(--ca-primary-tint)", borderColor: "var(--ca-primary-soft)" }}>
          <Icon name="schedule" size={16} color="var(--ca-primary-deep)" />
          <div style={{ color: "var(--ca-primary-deep-text)" }}>
            <p className="text-[12.5px] font-bold">This restaurant isn&apos;t taking orders right now.</p>
            <p className="text-[11px] font-medium opacity-85">You can browse the menu; ordering opens when it reopens.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function FilterPill({ on, onClick, veg, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="flex h-12 shrink-0 items-center gap-1.5 rounded-xl px-2.5"
      style={{
        background: on ? (veg ? "#E8F5E9" : "#FFEBEE") : "#fff",
        border: `1.2px solid ${on ? (veg ? "#16A34A" : "#EF4444") : "#E2E8F0"}`,
      }}
    >
      <VegMark veg={veg} />
      <span className="text-xs font-extrabold text-[#0F172A]">{children}</span>
    </button>
  )
}

function OfferStrip({ offers }) {
  const [i] = useRotatingIndex(offers.length, 3500)
  const [open, setOpen] = useState(false)
  if (!offers.length) return null
  const o = offers[i]
  const title = String(o.headline || o.title || "").trim()
  const code = String(o.couponCode || o.code || "").trim()
  const conditions = (Array.isArray(o.conditions) ? o.conditions : []).map((c) => String(c).trim()).filter(Boolean)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-[14px] border px-3.5 py-2.5 text-left"
        style={{ background: "var(--ca-primary-tint)", borderColor: "var(--ca-primary-soft)" }}
      >
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(245,74,0,0.15)" }}>
          <Icon name="percent" size={16} color="var(--ca-primary)" />
        </span>
        <span key={i} className="ca-ticker-up min-w-0 flex-1">
          <span className="block truncate text-[13px] font-extrabold text-[#0F172A]">Unlock {title}</span>
          {(conditions.length > 0 || (open && code)) && (
            <span className={`block text-[11px] text-[#64748B] ${open ? "" : "truncate"}`}>
              {conditions.join(" · ")}
              {open && code ? ` · Use code ${code} in the cart` : ""}
            </span>
          )}
        </span>
        {offers.length > 1 && <span className="text-[10px] text-[#94A3B8]">{i + 1}/{offers.length}</span>}
        <Icon name="chevron_right" size={20} color="#94A3B8" />
      </button>
    </>
  )
}

/** A restaurant's menu page (restaurant_screen.dart). */
export default function RestaurantScreen() {
  const { slug } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { itemCount } = useCart()
  const { effectiveLocation } = useDeliveryLocation() || {}
  const page = useRestaurantPage(slug)
  const { raw, restaurant: r, dishes, addons, offers } = page
  const { qtyByDish, addDish, addAddon, removeOne } = useDishCart(raw)

  const [query, setQuery] = useState("")
  const [diet, setDiet] = useState(null) // "veg" | "nonveg" | null
  const [category, setCategory] = useState("All")
  const [openDish, setOpenDish] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const isDesktop = useIsDesktop()
  const Frame = isDesktop ? DesktopPage : AppShell

  const isOpen = raw ? getRestaurantAvailabilityStatus(raw).isOpen : true
  const distanceLabel = useMemo(() => {
    if (!raw) return ""
    const d = getUserRestaurantDistance(effectiveLocation?.deliveryAddress || effectiveLocation, normalizeRestaurantLocation(raw.location || raw))
    return d ? `${d.km.toFixed(1)} km` : r?.distanceKm != null ? `${r.distanceKm.toFixed(1)} km` : ""
  }, [raw, r, effectiveLocation])

  // Old links can point at a dish: /restaurants/:slug?dish=<id>.
  useEffect(() => {
    const id = params.get("dish")
    if (id && dishes.length) {
      const d = dishes.find((x) => x.id === id)
      if (d) setOpenDish(d)
    }
  }, [params, dishes])

  const categories = useMemo(() => {
    const seen = new Map()
    for (const d of dishes) if (!seen.has(d.category)) seen.set(d.category, d.categoryImage)
    return [...seen.entries()]
  }, [dishes])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return dishes.filter(
      (d) =>
        (diet !== "veg" || d.isVeg) &&
        (diet !== "nonveg" || !d.isVeg) &&
        (!q || d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)),
    )
  }, [dishes, diet, query])

  const groups = useMemo(() => {
    const m = new Map()
    for (const d of filtered) {
      if (!m.has(d.category)) m.set(d.category, [])
      m.get(d.category).push(d)
    }
    return [...m.entries()]
  }, [filtered])

  const shown = category === "All" ? groups : groups.filter(([name]) => name === category)
  const bestsellers = dishes.filter((d) => d.isBestseller)

  const jumpTo = useCallback((name) => {
    setMenuOpen(false)
    setCategory("All")
    requestAnimationFrame(() => {
      const el = document.getElementById(sectionId(name))
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - STICKY_HEADER - 8, behavior: "smooth" })
    })
  }, [])

  // Plain ADD: dishes with sizes or add-ons open the sheet so a choice is made.
  const quickAdd = useCallback(
    (dish) => {
      if (dish.variants.length > 1 || addonsForDish(addons, dish).length) setOpenDish(dish)
      else addDish(dish)
    },
    [addDish, addons],
  )

  if (page.loading && !r) {
    return (
      <Frame>
        <div className="h-[175px] animate-pulse bg-[#E2E8F0]" />
        <div className="relative -mt-[60px] mx-4 h-40 animate-pulse rounded-[22px] bg-white" />
        <div className="flex justify-center py-12">
          <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#E2E8F0] border-t-[var(--ca-primary)]" />
        </div>
      </Frame>
    )
  }

  if (!r) {
    const notFound = page.error?.response?.status === 404
    return (
      <Frame>
        <div className="flex flex-col items-center px-8 py-24 text-center">
          <Icon name={notFound ? "restaurant" : "wifi_off"} size={48} color="#94A3B8" />
          <p className="mt-4 text-base font-extrabold" style={{ color: "var(--ca-title)" }}>
            {notFound ? "Restaurant not found" : "Couldn't load this restaurant"}
          </p>
          <p className="mt-1.5 text-[13px] text-[#64748B]">{notFound ? "It may have closed or moved." : "Check your connection and try again."}</p>
          <div className="mt-5 flex gap-3">
            {!notFound && (
              <button type="button" onClick={page.reload} className="rounded-xl px-6 py-3 font-extrabold text-white" style={{ background: "var(--ca-primary)" }}>
                Retry
              </button>
            )}
            <button type="button" onClick={() => navigate("/home")} className="rounded-xl border border-[#E2E8F0] bg-white px-6 py-3 font-extrabold text-[#0F172A]">
              Go home
            </button>
          </div>
        </div>
      </Frame>
    )
  }

  const dishSheet = (
    <DishSheet
      dish={openDish}
      addons={openDish ? addonsForDish(addons, openDish) : []}
      closed={!isOpen}
      onClose={() => setOpenDish(null)}
      onAddToCart={({ dish, variant, quantity, addonQty }) => {
        if (!addDish(dish, { variant, quantity })) return false
        for (const a of addons) if (addonQty[a.id] > 0) addAddon(a, addonQty[a.id])
        return true
      }}
    />
  )

  if (isDesktop) {
    return (
      <>
        <DesktopRestaurant
          r={r}
          raw={raw}
          distanceLabel={distanceLabel}
          isOpen={isOpen}
          offers={offers}
          query={query}
          setQuery={setQuery}
          diet={diet}
          setDiet={setDiet}
          groups={groups}
          shown={shown}
          category={category}
          setCategory={setCategory}
          bestsellers={bestsellers}
          dishes={dishes}
          qtyByDish={qtyByDish}
          onOpen={setOpenDish}
          onAdd={quickAdd}
          onRemove={removeOne}
          jumpTo={jumpTo}
          sectionId={sectionId}
        />
        {dishSheet}
      </>
    )
  }

  return (
    <AppShell>
      <Header r={r} raw={raw} distanceLabel={distanceLabel} isOpen={isOpen} />

      {/* Search, veg filters and category chips, pinned while scrolling */}
      <div className="sticky top-0 z-30 mt-2 pb-1 pt-2" style={{ background: "var(--ca-bg)", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
        <div className="flex items-center gap-2 px-4">
          <label className="flex h-12 min-w-0 flex-1 items-center rounded-3xl bg-white pl-4 pr-3" style={{ border: "1.2px solid rgba(245,74,0,0.35)", boxShadow: "0 3px 10px rgba(0,0,0,0.06)" }}>
            <Icon name="search" size={22} color="#64748B" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search menu"
              aria-label="Search in menu"
              className="ml-2.5 min-w-0 flex-1 bg-transparent text-sm text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
            />
          </label>
          <FilterPill veg on={diet === "veg"} onClick={() => setDiet(diet === "veg" ? null : "veg")}>Veg</FilterPill>
          <FilterPill veg={false} on={diet === "nonveg"} onClick={() => setDiet(diet === "nonveg" ? null : "nonveg")}>Non-Veg</FilterPill>
        </div>
        {categories.length > 0 && (
          <div className="ca-noscroll mt-2 flex overflow-x-auto px-4">
            {[["All", ""], ...categories].map(([name, image]) => {
              const active = category === name
              return (
                <button key={name} type="button" onClick={() => setCategory(name)} className="mr-2.5 flex w-[52px] shrink-0 flex-col items-center">
                  {name === "All" ? (
                    <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--ca-primary)", boxShadow: "0 3px 8px rgba(245,74,0,0.25)" }}>
                      <Icon name="grid_view" size={20} color="#fff" />
                    </span>
                  ) : (
                    <span
                      className="h-12 w-12 overflow-hidden rounded-full bg-white p-0.5"
                      style={{ border: active ? "2px solid var(--ca-primary)" : "1.2px solid #F1F5F9", boxShadow: "0 3px 8px rgba(0,0,0,0.05)" }}
                    >
                      {image ? (
                        <img src={image} alt="" loading="lazy" className="h-full w-full rounded-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-xl">{CATEGORY_EMOJI[name.toLowerCase()] || "🍽️"}</span>
                      )}
                    </span>
                  )}
                  <span className="mt-[3px] line-clamp-2 h-6 text-center text-[10px] leading-[1.15]" style={{ fontWeight: active ? 900 : 700, color: active ? "var(--ca-primary)" : "#334155" }}>
                    {name}
                  </span>
                  <span className="mt-[3px] h-[3px] rounded-sm transition-all" style={{ width: active ? 16 : 0, background: "var(--ca-primary)" }} />
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="px-4 pt-2">
        {page.error && !dishes.length ? (
          <div className="mt-6 rounded-[20px] border border-[#E2E8F0] bg-white p-6 text-center">
            <Icon name="wifi_off" size={44} color="#94A3B8" />
            <p className="mt-3 text-[15px] font-extrabold text-[#0F172A]">Couldn&apos;t load the menu</p>
            <button type="button" onClick={page.reload} className="mt-4 rounded-xl px-6 py-2.5 font-bold text-white" style={{ background: "var(--ca-primary)" }}>
              Retry
            </button>
          </div>
        ) : !dishes.length ? (
          <div className="mt-6 rounded-[20px] border border-[#E2E8F0] bg-white px-6 py-9 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "rgba(245,74,0,0.1)" }}>
              <Icon name="restaurant" size={32} color="var(--ca-primary)" />
            </span>
            <p className="mt-4 text-base font-extrabold text-[#0F172A]">This restaurant has no dishes yet</p>
            <p className="mt-1.5 text-[12.5px] leading-[1.4] text-[#64748B]">No menu items are listed for this restaurant right now. Please explore other top restaurants nearby!</p>
            <button type="button" onClick={() => navigate("/home")} className="mt-5 rounded-xl px-6 py-3 text-[13px] font-extrabold text-white" style={{ background: "var(--ca-primary)" }}>
              Explore Other Restaurants
            </button>
          </div>
        ) : !shown.length ? (
          <div className="py-8 text-center">
            <Icon name="search_off" size={36} color="#94A3B8" />
            <p className="mt-2 text-[12.5px] font-semibold text-[#64748B]">
              {query.trim() ? `No dishes match "${query.trim()}"` : "No dishes match your active filter"}
            </p>
          </div>
        ) : (
          shown.map(([name, items]) => (
            <section key={name} id={sectionId(name)} className="mb-3.5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-black tracking-[0.2px] text-[#94A3B8]">{name}</h2>
                <span className="text-[12.5px] font-bold text-[#94A3B8]">{items.length}</span>
              </div>
              <div className="space-y-2.5">
                {items.map((d) => (
                  <DishCard key={d.id} dish={d} qty={qtyByDish.get(d.id) || 0} onOpen={setOpenDish} onAdd={quickAdd} onRemove={removeOne} closed={!isOpen} />
                ))}
              </div>
            </section>
          ))
        )}

        {bestsellers.length > 0 && (
          <div className="mt-5">
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="text-[14.5px] font-black text-[#0F172A]">✨ Bestsellers ✨</h2>
            </div>
            <div className="ca-noscroll flex gap-2.5 overflow-x-auto pb-1">
              {bestsellers.map((d) => (
                <BestsellerCard key={d.id} dish={d} qty={qtyByDish.get(d.id) || 0} onOpen={setOpenDish} onAdd={quickAdd} onRemove={removeOne} closed={!isOpen} />
              ))}
            </div>
          </div>
        )}
        <div style={{ height: itemCount > 0 ? 190 : 120 }} />
      </div>

      {/* Menu index + offers, stacked above the cart bar */}
      <div
        className="pointer-events-none fixed left-1/2 z-40 flex w-full max-w-[480px] -translate-x-1/2 flex-col items-end gap-2.5 px-4"
        style={{ bottom: `calc(${itemCount > 0 ? 86 : 20}px + env(safe-area-inset-bottom, 0px))` }}
      >
        {dishes.length > 0 && (
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="pointer-events-auto flex items-center gap-[7px] rounded-3xl px-[18px] py-2.5 text-[13px] font-black text-white"
            style={{ background: "var(--ca-primary)", boxShadow: "0 4px 12px rgba(245,74,0,0.35)" }}
          >
            <Icon name="menu_book" size={16} />
            Menu
          </button>
        )}
        {offers.length > 0 && (
          <div className="pointer-events-auto w-full">
            <OfferStrip offers={offers} />
          </div>
        )}
      </div>
      <FloatingViewCartBar bottom={20} aboveNav={false} />

      {dishSheet}
      <MenuIndexSheet open={menuOpen} groups={groups} onPick={jumpTo} onClose={() => setMenuOpen(false)} />
    </AppShell>
  )
}
