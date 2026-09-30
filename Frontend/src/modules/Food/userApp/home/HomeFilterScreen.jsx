import { useMemo } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useProfile } from "@food/context/ProfileContext"
import AppShell from "../shell/AppShell"
import Icon from "../ui/Icon"
import RestaurantCard from "./RestaurantCard"
import { useHomeData } from "../data/useHomeData"
import { filterAndSort, useHomeFilter } from "../data/homeFilter"

/**
 * A filtered restaurant list: one category, or all "Top Restaurants"
 * (home_filter_screen.dart). `?cat=Pizza` or `?top=1`.
 */
export default function HomeFilterScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const cat = params.get("cat")
  const title = cat || "Top Restaurants"
  const { vegMode } = useProfile()
  const filter = useHomeFilter()
  const { restaurants, reload } = useHomeData()

  const list = useMemo(
    () => filterAndSort(restaurants.list, filter, Boolean(vegMode), cat),
    [restaurants.list, filter, vegMode, cat],
  )
  const loading = restaurants.loading && !restaurants.list.length

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/home"))

  return (
    <AppShell showCartBar={false}>
      <header
        className="sticky top-0 z-30 flex h-14 items-center px-1"
        style={{ background: "var(--ca-bg)", paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <button type="button" aria-label="Back" onClick={back} className="flex h-12 w-12 items-center justify-center">
          <Icon name="arrow_back" size={24} color="var(--ca-title)" />
        </button>
        <h1 className="flex-1 truncate text-center text-[17px] font-bold" style={{ color: "var(--ca-title)" }}>
          {title}
        </h1>
        <span className="w-12" />
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#E2E8F0] border-t-[var(--ca-primary)]" />
        </div>
      ) : restaurants.error && !restaurants.list.length ? (
        <div className="flex flex-col items-center px-8 py-16 text-center">
          <Icon name="wifi_off" size={56} color="rgba(235,46,0,0.35)" />
          <p className="mt-4 text-[19px] font-extrabold" style={{ color: "var(--ca-title)" }}>
            Couldn&apos;t load nearby restaurants
          </p>
          <p className="mt-2 text-[13.5px] text-[#64748B]">Please check your connection and location settings and try again.</p>
          <button type="button" onClick={reload} className="mt-5 rounded-xl px-7 py-3 font-extrabold text-white" style={{ background: "var(--ca-primary)" }}>
            Retry
          </button>
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center px-8 py-16 text-center">
          <Icon name="restaurant" size={56} color="#CBD5E1" />
          <p className="mt-4 text-xl font-extrabold" style={{ color: "var(--ca-title)" }}>
            {title}
          </p>
          <p className="mt-2 text-[13.5px] text-[#64748B]">
            {cat ? `No restaurants serving ${cat} near you right now.` : "No top restaurants available near you right now."}
          </p>
        </div>
      ) : (
        <div className="pt-2">
          <p className="px-5 pb-2 text-[13px] font-semibold text-[#64748B]">
            {list.length} {list.length === 1 ? "restaurant" : "restaurants"}
          </p>
          {list.map((r, i) => (
            <RestaurantCard key={r.id} restaurant={r} index={i} />
          ))}
        </div>
      )}
    </AppShell>
  )
}
