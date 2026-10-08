import "../theme.css"
import { useCallback, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useCart } from "@food/context/CartContext"
import { useProfile } from "@food/context/ProfileContext"
import { useDeliveryLocation } from "@food/context/DeliveryLocationContext"
import { isModuleAuthenticated } from "@food/utils/auth"
import Icon from "../ui/Icon"
import LocationSearch from "../ui/LocationSearch"
import RestaurantCard from "./RestaurantCard"
import { PromoBannerCarousel, QuickFilterBar } from "./HomeWidgets"
import { AllCategoriesSheet, FilterSheet, ScheduleSheet } from "./HomeSheets"
import { useHomeData } from "../data/useHomeData"
import { activeFilterCount, filterAndSort, formatScheduleSlot, homeFilter, useHomeFilter } from "../data/homeFilter"
import wordmark from "../assets/craviox-wordmark.png"

const CONTENT = "mx-auto w-full max-w-[1200px] px-8"

function NavLink({ to, icon, children, badge }) {
  return (
    <Link to={to} className="flex items-center gap-2 text-[15px] font-semibold text-[var(--ca-ink)] transition-colors hover:text-[var(--ca-primary)]">
      <span className="relative flex">
        <Icon name={icon} outlined size={22} />
        {badge > 0 && (
          <span className="absolute -right-2 -top-1.5 min-w-[18px] rounded-full bg-[var(--ca-primary)] px-1 text-center text-[11px] font-bold leading-[18px] text-white">
            {badge}
          </span>
        )}
      </span>
      {children}
    </Link>
  )
}

function TopBar() {
  const { itemCount } = useCart()
  const { userProfile } = useProfile()
  const authed = isModuleAuthenticated("user")
  const firstName = String(userProfile?.name || "").trim().split(/\s+/)[0]
  return (
    <header className="sticky top-0 z-40 border-b border-[#F1F5F9] bg-white/95 backdrop-blur">
      <div className={`${CONTENT} flex h-20 items-center gap-10`}>
        <Link to="/home" aria-label="Craviox home" className="mr-auto flex">
          <img src={wordmark} alt="Craviox" className="h-10 w-auto" />
        </Link>
        <NavLink to="/food/restaurant/welcome" icon="restaurant">Partner with us</NavLink>
        <NavLink to="/food/delivery/welcome" icon="two_wheeler">Ride with us</NavLink>
        <NavLink to="/food/user/offers" icon="local_offer">Offers</NavLink>
        <NavLink to="/food/user/help" icon="help">Help</NavLink>
        <NavLink to={authed ? "/food/user/profile" : "/food/user/auth/login"} icon="person">
          {authed ? firstName || "Account" : "Sign in"}
        </NavLink>
        <NavLink to="/food/user/cart" icon="shopping_bag" badge={itemCount}>Cart</NavLink>
      </div>
    </header>
  )
}

function Hero({ onSearch, locationLabel }) {
  const [q, setQ] = useState("")
  return (
    <section className="relative overflow-hidden" style={{ background: "var(--ca-primary)" }}>
      {/* Soft rings echo the round cart mark of the logo. */}
      <span className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full border-[40px] border-white/10" />
      <span className="pointer-events-none absolute -right-20 bottom-[-120px] h-96 w-96 rounded-full border-[48px] border-white/10" />
      <div className={`${CONTENT} relative pb-16 pt-14 text-center`}>
        <h1 className="mx-auto max-w-[760px] text-[44px] font-extrabold leading-[1.15] tracking-[-0.5px] text-white">
          Food you crave, from restaurants near you. Delivered fast.
        </h1>
        <p className="mt-3 text-lg font-medium text-white/90">Order from the best places in your city with Craviox.</p>
        <div className="mx-auto mt-9 flex max-w-[860px] gap-4">
          <div className="w-[40%] shrink-0">
            <LocationSearch variant="hero" />
          </div>
          <form
            className="flex h-[60px] flex-1 items-center rounded-2xl bg-white px-4"
            style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}
            onSubmit={(e) => {
              e.preventDefault()
              onSearch(q.trim())
            }}
          >
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search for restaurant, item or more"
              aria-label="Search for restaurant, item or more"
              className="min-w-0 flex-1 bg-transparent text-base font-medium text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
            />
            <button type="submit" aria-label="Search" className="flex p-1">
              <Icon name="search" size={24} color="#64748B" />
            </button>
          </form>
        </div>
        {locationLabel && (
          <p className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white">
            <Icon name="location_on" size={16} />
            Delivering to {locationLabel}
          </p>
        )}
        <div className="mx-auto mt-10 grid max-w-[860px] grid-cols-2 gap-5 text-left">
          <ServiceCard
            to="#restaurants"
            title="Food Delivery"
            subtitle="From restaurants near you"
            note="Live order tracking"
            icon="two_wheeler"
          />
          <ServiceCard
            to="/food/user/dining"
            title="Dining Out"
            subtitle="Book a table, skip the wait"
            note="Offers on dine-in"
            icon="restaurant"
          />
        </div>
      </div>
    </section>
  )
}

function ServiceCard({ to, title, subtitle, note, icon }) {
  const inner = (
    <span className="group flex h-full items-center justify-between rounded-3xl bg-white p-6 transition-transform hover:-translate-y-0.5" style={{ boxShadow: "0 10px 30px rgba(0,0,0,0.12)" }}>
      <span>
        <span className="block text-2xl font-extrabold uppercase tracking-[-0.3px] text-[var(--ca-ink)]">{title}</span>
        <span className="mt-1 block text-[15px] font-semibold uppercase text-[#64748B]">{subtitle}</span>
        <span className="mt-3 inline-block rounded-md bg-[var(--ca-primary-tint)] px-2 py-1 text-xs font-bold uppercase text-[var(--ca-primary-deep)]">
          {note}
        </span>
        <span className="mt-5 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ca-primary)] text-white transition-transform group-hover:translate-x-1">
          <Icon name="chevron_right" size={24} />
        </span>
      </span>
      <span className="flex h-28 w-28 items-center justify-center rounded-full bg-[var(--ca-primary-tint)]">
        <Icon name={icon} size={60} color="var(--ca-primary)" />
      </span>
    </span>
  )
  if (to.startsWith("#")) {
    return (
      <a href={to} onClick={(e) => {
        e.preventDefault()
        document.getElementById(to.slice(1))?.scrollIntoView({ behavior: "smooth" })
      }}>
        {inner}
      </a>
    )
  }
  return <Link to={to}>{inner}</Link>
}

function SectionHead({ title, action }) {
  return (
    <div className="mb-5 flex items-end justify-between">
      <h2 className="text-2xl font-extrabold tracking-[-0.4px] text-[var(--ca-ink)]">{title}</h2>
      {action}
    </div>
  )
}

function CategoryRail({ categories, onPick, onSeeAll }) {
  const rail = useRef(null)
  const scroll = (dir) => rail.current?.scrollBy({ left: dir * 600, behavior: "smooth" })
  if (!categories.length) return null
  return (
    <section className={`${CONTENT} pt-12`}>
      <SectionHead
        title="What's on your mind?"
        action={
          <div className="flex items-center gap-2">
            <button type="button" onClick={onSeeAll} className="mr-2 text-sm font-bold text-[var(--ca-primary)]">See all</button>
            {[-1, 1].map((d) => (
              <button
                key={d}
                type="button"
                aria-label={d < 0 ? "Scroll left" : "Scroll right"}
                onClick={() => scroll(d)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F1F5F9] hover:bg-[#E2E8F0]"
              >
                <Icon name={d < 0 ? "arrow_back" : "chevron_right"} size={20} color="var(--ca-ink)" />
              </button>
            ))}
          </div>
        }
      />
      <div ref={rail} className="ca-noscroll flex gap-6 overflow-x-auto pb-2">
        {categories.map((c) => (
          <button key={c.id} type="button" onClick={() => onPick(c)} className="flex w-[120px] shrink-0 flex-col items-center">
            <span className="h-[120px] w-[120px] overflow-hidden rounded-full bg-[#F8FAFC] ring-1 ring-[#F1F5F9] transition-transform hover:scale-[1.04]">
              {c.imageUrl ? (
                <img src={c.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <Icon name="restaurant" size={40} color="#CBD5E1" />
                </span>
              )}
            </span>
            <span className="mt-3 line-clamp-1 text-[15px] font-semibold text-[#334155]">{c.name}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function Footer() {
  const cols = [
    ["Company", [["About Craviox", "/food/user/profile/about"], ["Terms & Conditions", "/terms"], ["Privacy Policy", "/privacy"]]],
    ["Contact us", [["Help & Support", "/food/user/help"], ["Partner with us", "/food/restaurant/welcome"], ["Ride with us", "/food/delivery/welcome"]]],
    ["For you", [["Offers", "/food/user/offers"], ["Dining out", "/food/user/dining"], ["Your orders", "/food/user/orders"]]],
  ]
  return (
    <footer className="mt-20 bg-[var(--ca-ink)] text-white">
      <div className={`${CONTENT} grid grid-cols-4 gap-10 py-14`}>
        <div>
          <span className="inline-flex rounded-xl bg-white px-3 py-2">
            <img src={wordmark} alt="Craviox" className="h-8 w-auto" />
          </span>
          <p className="mt-4 text-sm text-white/60">© {new Date().getFullYear()} Craviox. All rights reserved.</p>
        </div>
        {cols.map(([title, links]) => (
          <div key={title}>
            <h3 className="text-base font-bold">{title}</h3>
            <ul className="mt-4 space-y-3">
              {links.map(([label, to]) => (
                <li key={label}>
                  <Link to={to} className="text-[15px] text-white/70 hover:text-white">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  )
}

/**
 * Home on a computer: a landing page in the style of the big delivery sites
 * (location + search up top), in Craviox colours, over the same data as the
 * phone layout.
 */
export default function DesktopHome() {
  const navigate = useNavigate()
  const { vegMode, setVegMode } = useProfile()
  const { effectiveLocation, zoneStatus, zoneLoading, zone } = useDeliveryLocation() || {}
  const { restaurants, categories, banners } = useHomeData()
  const filter = useHomeFilter()
  const isPureVeg = Boolean(vegMode)
  const [sheet, setSheet] = useState(null)

  const list = useMemo(() => filterAndSort(restaurants.list, filter, isPureVeg), [restaurants.list, filter, isPureVeg])
  const countFor = useCallback((f, veg) => filterAndSort(restaurants.list, f, veg).length, [restaurants.list])

  const hasCoords = Number.isFinite(Number(effectiveLocation?.latitude)) && Number.isFinite(Number(effectiveLocation?.longitude))
  const outOfZone = hasCoords && zoneStatus === "OUT_OF_SERVICE" && !zoneLoading
  const locationLabel = hasCoords
    ? effectiveLocation?.area || effectiveLocation?.city || effectiveLocation?.address || zone?.name || ""
    : ""
  const loading = restaurants.loading && !restaurants.list.length

  const openCategory = (c) => navigate(`/food/user/home-filter?cat=${encodeURIComponent(c.name)}`)
  const openBanner = (b) => {
    const dest = String(b.link || "").trim()
    if (!dest) return
    if (/^https?:\/\//i.test(dest)) window.open(dest, "_blank", "noopener")
    else navigate(dest.startsWith("/") ? dest : `/${dest}`)
  }

  return (
    <div className="ca-app min-h-[100dvh] bg-white">
      <TopBar />
      <Hero
        locationLabel={locationLabel}
        onSearch={(q) => navigate(q ? `/food/user/search?q=${encodeURIComponent(q)}` : "/food/user/search")}
      />

      {!hasCoords && !zoneLoading ? (
        <section className={`${CONTENT} py-20 text-center`}>
          <span className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[var(--ca-primary-tint)]">
            <Icon name="location_on" size={48} color="var(--ca-primary)" />
          </span>
          <h2 className="mt-6 text-2xl font-extrabold text-[var(--ca-ink)]">Where should we deliver?</h2>
          <p className="mt-2 text-base text-[#64748B]">Enter your delivery location above to see restaurants near you.</p>
        </section>
      ) : outOfZone ? (
        <section className={`${CONTENT} py-20 text-center`}>
          <span className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#F1F5F9]">
            <Icon name="location_off" size={48} color="#94A3B8" />
          </span>
          <h2 className="mt-6 text-2xl font-extrabold text-[var(--ca-ink)]">We&apos;re not in {locationLabel || "your area"} yet</h2>
          <p className="mt-2 text-base text-[#64748B]">We&apos;re growing fast. Try another delivery location above.</p>
        </section>
      ) : (
        <>
          <CategoryRail categories={categories.list} onPick={openCategory} onSeeAll={() => setSheet("categories")} />

          {banners.length > 0 && (
            <section className={`${CONTENT} pt-12`}>
              <SectionHead title="Offers for you" />
              <div className="grid grid-cols-3 gap-5">
                {banners.slice(0, 3).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => openBanner(b)}
                    className="overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5"
                    style={{ aspectRatio: "1.68", boxShadow: "0 6px 18px rgba(0,0,0,0.08)" }}
                  >
                    <img src={b.imageUrl} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
              {banners.length > 3 && (
                <div className="mt-5">
                  <PromoBannerCarousel banners={banners.slice(3)} onTap={openBanner} />
                </div>
              )}
            </section>
          )}

          <section id="restaurants" className={`${CONTENT} scroll-mt-24 pt-12`}>
            <SectionHead title={loading ? "Restaurants near you" : `${list.length} restaurants delivering to ${locationLabel || "you"}`} />
            <div className="-mx-3 mb-4">
              <QuickFilterBar
                filter={filter}
                isPureVeg={isPureVeg}
                activeCount={activeFilterCount(filter, isPureVeg)}
                scheduleLabel={filter.scheduledAt ? formatScheduleSlot(filter.scheduledAt) : ""}
                onFilters={() => setSheet("filter")}
                onUnder150={homeFilter.toggleUnder150}
                onSchedule={() => (filter.scheduledAt ? homeFilter.set({ scheduledAt: null }) : setSheet("schedule"))}
                onPureVeg={() => setVegMode(!isPureVeg)}
                onRating4={homeFilter.toggleRating4}
              />
            </div>
            {loading ? (
              <div className="flex justify-center py-16">
                <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#E2E8F0] border-t-[var(--ca-primary)]" />
              </div>
            ) : list.length ? (
              <div className="-mx-3 grid grid-cols-3">
                {list.map((r, i) => (
                  <RestaurantCard key={r.id} restaurant={r} index={i} />
                ))}
              </div>
            ) : (
              <div className="py-16 text-center">
                <p className="text-lg font-bold text-[var(--ca-ink)]">
                  {restaurants.list.length ? "No restaurants match your filters" : "No restaurants near you yet"}
                </p>
                {restaurants.list.length > 0 && (
                  <button
                    type="button"
                    className="mt-3 font-bold text-[var(--ca-primary)]"
                    onClick={() => {
                      homeFilter.reset()
                      setVegMode(false)
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </section>
        </>
      )}

      <Footer />

      <FilterSheet
        open={sheet === "filter"}
        onClose={() => setSheet(null)}
        initial={filter}
        initialVeg={isPureVeg}
        count={countFor}
        onApply={(draft, veg) => {
          homeFilter.set({ maxPrice: draft.maxPrice, minRating: draft.minRating, sortBy: draft.sortBy })
          setVegMode(veg)
          setSheet(null)
        }}
        onReset={() => {
          homeFilter.reset()
          setVegMode(false)
        }}
      />
      <ScheduleSheet
        open={sheet === "schedule"}
        onClose={() => setSheet(null)}
        onPick={(iso) => {
          homeFilter.set({ scheduledAt: iso })
          setSheet(null)
        }}
      />
      <AllCategoriesSheet
        open={sheet === "categories"}
        onClose={() => setSheet(null)}
        categories={categories.list}
        onPick={(c) => {
          setSheet(null)
          openCategory(c)
        }}
      />
    </div>
  )
}
