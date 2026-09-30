import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { userAPI } from "@food/api"
import { useProfile } from "@food/context/ProfileContext"
import { useDeliveryLocation } from "@food/context/DeliveryLocationContext"
import { useLocationSelector } from "@food/components/user/UserLayout"
import useNotificationInbox from "@food/hooks/useNotificationInbox"
import { isModuleAuthenticated } from "@food/utils/auth"
import OutOfZoneScreen from "@food/components/user/OutOfZoneScreen"
import AppShell from "../shell/AppShell"
import Icon from "../ui/Icon"
import RestaurantCard from "./RestaurantCard"
import TopRestaurantCard from "./TopRestaurantCard"
import { CategoryRow, PromoBannerCarousel, QuickFilterBar, SearchBar, VegModeToggle } from "./HomeWidgets"
import { AllCategoriesSheet, FilterSheet, ScheduleSheet } from "./HomeSheets"
import { useHomeData } from "../data/useHomeData"
import { activeFilterCount, filterAndSort, formatScheduleSlot, homeFilter, useHomeFilter } from "../data/homeFilter"

const HEADER_RED = "#EB2E00"
const cap = (s) => String(s || "").replace(/^\w/, (c) => c.toUpperCase())

/** Where we're delivering to: the default saved address, else the detected location / zone. */
function useLocationLabels() {
  const { defaultSavedAddress, savedAddressText, effectiveLocation, zone, isInService } = useDeliveryLocation() || {}
  const a = defaultSavedAddress
  const title =
    cap(a?.label) || a?.city || effectiveLocation?.area || effectiveLocation?.city || zone?.name || "Select location"
  const subtitle =
    savedAddressText ||
    effectiveLocation?.formattedAddress ||
    effectiveLocation?.address ||
    (isInService && zone?.name ? `Delivering to ${zone.name}` : "Tap to set your delivery address")
  return { title, subtitle }
}

/** The gold membership pill; hidden when no plan is published (home_screen.dart). */
function MembershipPill({ authed, onTap }) {
  const [state, setState] = useState({ loading: authed, plan: null, member: false, hasPlans: true })
  useEffect(() => {
    if (!authed) return undefined
    let live = true
    Promise.allSettled([userAPI.getMembershipPlans(), userAPI.getMyMembership()]).then(([p, me]) => {
      if (!live) return
      const raw = p.status === "fulfilled" ? p.value?.data?.data : null
      const plans = Array.isArray(raw) ? raw : Array.isArray(raw?.plans) ? raw.plans : []
      const mine = me.status === "fulfilled" ? me.value?.data?.data : null
      const member = Boolean(mine && (mine.isActive || mine.status === "active" || mine.membership?.status === "active"))
      setState({
        loading: false,
        plan: plans.find((x) => x.isFeatured) || plans[0] || null,
        member,
        hasPlans: p.status !== "fulfilled" || plans.length > 0,
      })
    })
    return () => {
      live = false
    }
  }, [authed])

  if (authed && !state.loading && !state.hasPlans) return null
  const name = String(state.plan?.name || "Gold").toUpperCase()
  const price = Number(state.plan?.price)
  const subtitle = state.member ? "MEMBER" : Number.isFinite(price) ? `₹${Number.isInteger(price) ? price : price.toFixed(2)}` : null
  const ink = "#854D0E"

  return (
    <button
      type="button"
      onClick={onTap}
      className="mr-2 flex shrink-0 flex-col items-center justify-center rounded-[20px] px-2.5 py-[3px]"
      style={{ background: "#FFFBEB", border: "1.2px solid #F59E0B", boxShadow: "0 1px 4px rgba(245,158,11,0.12)" }}
    >
      <span className="flex items-center text-[9px] font-black leading-[1.1] tracking-[0.4px]" style={{ color: ink }}>
        {name === "GOLD" ? (
          <>
            G
            <span
              className="mx-[0.6px] inline-block h-[7px] w-[7px] rounded-full"
              style={{ background: "linear-gradient(135deg, #FDE68A, #D97706)" }}
            />
            LD
          </>
        ) : (
          name
        )}
      </span>
      {subtitle && (
        <span className="text-[8.5px] font-extrabold leading-[1.1]" style={{ color: ink }}>
          {subtitle}
        </span>
      )}
    </button>
  )
}

function Bell({ authed, onTap }) {
  const { unreadCount, items } = useNotificationInbox(authed ? "user" : null, { autoload: authed, limit: 20 })
  const hasUnread = unreadCount > 0 || (items || []).some((n) => n && n.read === false)
  return (
    <button
      type="button"
      aria-label="Notifications"
      onClick={onTap}
      className="relative flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full border border-[#E2E8F0]"
      style={{ background: "var(--ca-surface)", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
    >
      <Icon name="notifications" outlined size={22} color="var(--ca-title)" />
      {hasUnread && (
        <span className="absolute right-[3px] top-[3px] h-2.5 w-2.5 rounded-full bg-[#EF4444]" style={{ border: "1.8px solid #fff" }} />
      )}
    </button>
  )
}

function startVoiceSearch(onText) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) {
    toast.error("Voice search isn't supported in this browser.")
    return
  }
  const r = new SR()
  r.lang = "en-IN"
  r.interimResults = false
  r.maxAlternatives = 1
  r.onresult = (e) => {
    const t = e.results?.[0]?.[0]?.transcript?.trim()
    if (t) onText(t)
  }
  r.onerror = () => toast.error("Couldn't hear that. Try again.")
  toast("Listening…", { duration: 2500 })
  try {
    r.start()
  } catch {
    // Already listening.
  }
}

/** Shown until we know where to deliver (location_access_prompt.dart). */
function LocationRequired({ onEnable, onChoose }) {
  const [asking, setAsking] = useState(false)
  return (
    <div className="flex flex-col items-center px-8 pb-10 pt-12 text-center">
      <span className="flex h-24 w-24 items-center justify-center rounded-full" style={{ background: "rgba(235,46,0,0.12)" }}>
        <Icon name="location_off" size={44} color="var(--ca-primary)" />
      </span>
      <h2 className="mt-7 text-[22px] font-extrabold" style={{ color: "var(--ca-title)" }}>
        Location Required
      </h2>
      <p className="mt-3 text-[13.5px] leading-normal text-[#64748B]">
        Craviox requires your location to discover nearby restaurants, check delivery serviceability, and deliver your food.
      </p>
      <button
        type="button"
        disabled={asking}
        onClick={async () => {
          setAsking(true)
          try {
            const loc = await onEnable()
            if (!loc) toast.error("Couldn't get your location. Allow location access, or choose an address.")
          } finally {
            setAsking(false)
          }
        }}
        className="mt-9 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold text-white disabled:opacity-80"
        style={{ background: "var(--ca-primary)" }}
      >
        {asking ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/50 border-t-white" />
        ) : (
          <Icon name="my_location" size={20} />
        )}
        {asking ? "Checking Location…" : "Enable Location"}
      </button>
      <button type="button" onClick={onChoose} className="mt-3.5 text-[13.5px] font-bold" style={{ color: "var(--ca-primary)" }}>
        Choose a delivery address
      </button>
    </div>
  )
}

const SectionTitle = ({ children, action }) => (
  <div className="flex items-center justify-between">
    <h2 className="text-base font-extrabold tracking-[-0.3px]" style={{ color: "var(--ca-title)" }}>
      {children}
    </h2>
    {action}
  </div>
)

/** Home tab (home_screen.dart). */
export default function HomeScreen() {
  const navigate = useNavigate()
  const authed = isModuleAuthenticated("user")
  const { vegMode, setVegMode } = useProfile()
  const { openLocationSelector } = useLocationSelector()
  const { effectiveLocation, zoneStatus, zoneLoading, requestLiveLocation, loading: locating } = useDeliveryLocation() || {}
  const { title, subtitle } = useLocationLabels()
  const { restaurants, categories, banners, reload } = useHomeData()
  const filter = useHomeFilter()
  const isPureVeg = Boolean(vegMode)

  const [selectedCat, setSelectedCat] = useState("all")
  const [sheet, setSheet] = useState(null) // "filter" | "schedule" | "categories"

  useEffect(() => {
    homeFilter.sync()
  }, [])

  const list = useMemo(() => filterAndSort(restaurants.list, filter, isPureVeg), [restaurants.list, filter, isPureVeg])
  const countFor = useCallback((f, veg) => filterAndSort(restaurants.list, f, veg).length, [restaurants.list])

  const openCategory = (cat) => {
    setSelectedCat(cat.id)
    if (cat.id === "all") return
    navigate(`/food/user/home-filter?cat=${encodeURIComponent(cat.name)}`)
  }

  const openBanner = (b) => {
    const dest = String(b.link || "").trim()
    if (!dest) return
    if (/^https?:\/\//i.test(dest)) window.open(dest, "_blank", "noopener")
    else navigate(dest.startsWith("/") ? dest : `/${dest}`)
  }

  const outOfZone =
    Number.isFinite(Number(effectiveLocation?.latitude)) && zoneStatus === "OUT_OF_SERVICE" && !zoneLoading
  if (outOfZone) return <OutOfZoneScreen location={effectiveLocation} />

  const hasCoords = Number.isFinite(Number(effectiveLocation?.latitude)) && Number.isFinite(Number(effectiveLocation?.longitude))
  const needsLocation = !hasCoords && !zoneLoading && !locating
  const failed = restaurants.error && !restaurants.list.length
  const loading = restaurants.loading && !restaurants.list.length
  const fade = "var(--ca-bg)"

  return (
    <AppShell showCartBar>
      {/* 1. Location row on the brand red */}
      <div className="flex items-center px-2 pb-0 pt-[calc(6px+env(safe-area-inset-top,0px))]" style={{ background: HEADER_RED }}>
        <button type="button" onClick={openLocationSelector} className="flex min-w-0 flex-1 items-center text-left">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white" style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.12)" }}>
            <Icon name="location_on" size={20} color="var(--ca-primary)" />
          </span>
          <span className="ml-2.5 flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center">
              <span className="truncate text-lg font-black tracking-[-0.3px] text-black">{title}</span>
              <Icon name="keyboard_arrow_down" size={20} color="#000" className="ml-1" />
            </span>
            <span className="mt-px flex min-w-0 items-center">
              <span className="truncate text-[11.5px] font-medium text-black">{subtitle}</span>
              <Icon name="chevron_right" size={16} color="#000" className="ml-0.5" />
            </span>
          </span>
        </button>
        <span className="w-2" />
        <MembershipPill authed={authed} onTap={() => navigate("/food/user/membership")} />
        <Bell authed={authed} onTap={() => navigate(authed ? "/food/user/notifications" : "/food/user/auth/login")} />
      </div>

      {/* 2. Search + categories, pinned while scrolling */}
      <div
        className="sticky top-0 z-30 px-2 pb-3 pt-3.5"
        style={{ background: `linear-gradient(to bottom, ${HEADER_RED} 0%, color-mix(in srgb, ${HEADER_RED} 50%, ${fade}) 50%, ${fade} 100%)` }}
      >
        <div className="flex items-center gap-2">
          <SearchBar
            categories={categories.list.map((c) => c.name)}
            onTap={() => navigate("/food/user/search")}
            onMic={() => startVoiceSearch((t) => navigate(`/food/user/search?q=${encodeURIComponent(t)}`))}
          />
          <VegModeToggle on={isPureVeg} onToggle={() => setVegMode(!isPureVeg)} />
        </div>
        <div className="mt-3.5">
          <CategoryRow
            categories={categories.list}
            loading={categories.loading}
            selectedId={selectedCat}
            onSelect={openCategory}
            onSeeAll={() => setSheet("categories")}
          />
        </div>
      </div>

      {needsLocation && (
        <LocationRequired onEnable={() => requestLiveLocation?.()} onChoose={openLocationSelector} />
      )}

      {/* 3. Hero banners */}
      <div className="px-2 pt-2">
        {failed && (
          <div className="flex flex-col items-center px-8 py-16 text-center">
            <Icon name="wifi_off" size={56} color="rgba(235,46,0,0.35)" />
            <p className="mt-4 text-base font-extrabold" style={{ color: "var(--ca-title)" }}>
              Couldn&apos;t load Craviox
            </p>
            <p className="mt-1.5 text-[13px] text-[#64748B]">Check your internet connection and try again.</p>
            <button type="button" onClick={reload} className="mt-5 rounded-xl px-7 py-3 font-extrabold text-white" style={{ background: "var(--ca-primary)" }}>
              Retry
            </button>
          </div>
        )}
        <PromoBannerCarousel banners={banners} onTap={openBanner} />
      </div>

      {/* 4. Quick filters */}
      <div className="mt-3">
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

      {/* 5. Top restaurants: 2-row horizontal rail */}
      {(loading || list.length > 0) && (
        <div className="mt-4 px-2">
          <SectionTitle
            action={
              <button
                type="button"
                onClick={() => navigate("/food/user/home-filter?top=1")}
                className="flex items-center text-xs font-semibold text-[#64748B]"
              >
                View All
                <Icon name="chevron_right" size={16} className="ml-0.5" />
              </button>
            }
          >
            Top Restaurants
          </SectionTitle>
          <div className="mt-2.5 h-[254px]">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#E2E8F0] border-t-[var(--ca-primary)]" />
              </div>
            ) : (
              <div className="ca-noscroll grid h-full auto-cols-[114px] grid-flow-col grid-rows-2 gap-1.5 overflow-x-auto">
                {list.map((r) => (
                  <TopRestaurantCard key={r.id} restaurant={r} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. All restaurants */}
      {(loading || list.length > 0) && (
        <div className="mt-6">
          <div className="px-2">
            <SectionTitle>{loading ? "Restaurants near you" : `${list.length} Restaurants near you`}</SectionTitle>
          </div>
          <div className="mt-1">
            {loading ? (
              <div className="flex justify-center py-6">
                <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#E2E8F0] border-t-[var(--ca-primary)]" />
              </div>
            ) : (
              list.map((r, i) => <RestaurantCard key={r.id} restaurant={r} index={i} />)
            )}
          </div>
        </div>
      )}

      {!needsLocation && !loading && !failed && list.length === 0 && (
        <div className="px-8 py-14 text-center">
          <Icon name="restaurant" size={48} color="#CBD5E1" />
          <p className="mt-3 text-[15px] font-bold" style={{ color: "var(--ca-title)" }}>
            {restaurants.list.length ? "No restaurants match your filters" : "No restaurants near you yet"}
          </p>
          {restaurants.list.length > 0 && (
            <button
              type="button"
              className="mt-3 text-sm font-bold"
              style={{ color: "var(--ca-primary)" }}
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

      <div className="h-24" />

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
          toast.success(`Scheduled for ${formatScheduleSlot(iso)}`)
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
    </AppShell>
  )
}
