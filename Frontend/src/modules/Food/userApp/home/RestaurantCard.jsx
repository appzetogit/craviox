import { memo, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useProfile } from "@food/context/ProfileContext"
import Icon from "../ui/Icon"
import PromotedTag from "../ui/PromotedTag"
import { useInView, useRotatingIndex } from "../ui/hooks"
import { useRestaurantMenu } from "../data/useHomeData"

const rupees = (n) => `₹${Math.round(n)}`
const dishLabel = (f) => `${f.name}${f.price > 0 ? ` • ${rupees(f.price)}` : ""}`

/** Heart toggle shared by both restaurant cards (ProfileContext favourites). */
export function useFavoriteToggle(r) {
  const { isFavorite, addFavorite, removeFavorite } = useProfile()
  const fav = isFavorite?.(r.slug) || false
  const toggle = (e) => {
    e?.preventDefault()
    e?.stopPropagation()
    if (fav) removeFavorite?.(r.slug)
    else
      addFavorite?.({
        slug: r.slug,
        name: r.name,
        cuisine: r.tags.join(", "),
        rating: r.rating,
        deliveryTime: r.deliveryTime,
        distance: r.distanceKm != null ? `${r.distanceKm.toFixed(1)} km` : "",
        priceRange: r.priceForOne ? `${rupees(r.priceForOne)} for one` : "",
        image: r.imageUrl,
      })
  }
  return [fav, toggle]
}

/** Swipeable photos with the dish tag, heart and page dots (_MediaCarousel). */
function MediaCarousel({ restaurant, slides, dishLabels, onPage }) {
  const [page, setPage] = useState(0)
  const [touching, setTouching] = useState(false)
  const [fav, toggleFav] = useFavoriteToggle(restaurant)
  const [bump, setBump] = useState(0)
  const track = useRef(null)
  const count = slides.length
  const [auto] = useRotatingIndex(count, 2800, touching || !restaurant.isOpen)

  // Auto-advance scrolls the track; a user swipe updates `page` via onScroll.
  useEffect(() => {
    const el = track.current
    if (!el || count <= 1 || touching) return
    el.scrollTo({ left: auto * el.clientWidth, behavior: "smooth" })
  }, [auto, count, touching])

  const onScroll = () => {
    const el = track.current
    if (!el) return
    const p = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
    if (p !== page) {
      setPage(p)
      onPage?.(p)
    }
  }

  const label = dishLabels.length ? dishLabels[page % dishLabels.length] : null

  return (
    <div className="relative h-[205px]">
      {count === 0 ? (
        <div className="absolute inset-0 bg-[#F0F0F0] dark:bg-[#2A2A2A]" />
      ) : (
        <div
          ref={track}
          onScroll={onScroll}
          onTouchStart={() => setTouching(true)}
          onTouchEnd={() => setTimeout(() => setTouching(false), 3000)}
          className="ca-noscroll ca-snap-x absolute inset-0 flex overflow-x-auto"
        >
          {slides.map((src, i) => (
            <img
              key={`${src}-${i}`}
              src={src}
              alt=""
              loading="lazy"
              draggable={false}
              className="h-full w-full shrink-0 object-cover"
            />
          ))}
        </div>
      )}

      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.25), transparent 50%, rgba(0,0,0,0.4))" }}
      />

      {!restaurant.isOpen && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/35">
          <div
            className="flex items-center gap-2.5 rounded-[22px] border border-white/15 px-[18px] py-2.5"
            style={{ background: "rgba(24,24,27,0.86)", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}
          >
            <Icon name="schedule" size={26} color="#F43F5E" />
            <div>
              <div className="text-[12.5px] font-extrabold tracking-[0.6px] text-white">UNAVAILABLE DELIVERY</div>
              <div className="mt-px text-[10.5px] font-medium text-[#D4D4D8]">Will reopen soon</div>
            </div>
          </div>
        </div>
      )}

      {label && (
        <div className="absolute left-3 top-3 max-w-[70%] overflow-hidden rounded-[20px] bg-black/[0.68] px-2.5 py-[5px]">
          <div key={label} className="ca-ticker-up flex items-center gap-1">
            <Icon name="local_fire_department" size={13} color="var(--ca-primary)" />
            <span className="truncate text-[10.5px] font-semibold text-white">{label}</span>
          </div>
        </div>
      )}

      <button
        type="button"
        aria-label={fav ? "Remove from favourites" : "Add to favourites"}
        onClick={(e) => {
          setBump((b) => b + 1)
          toggleFav(e)
        }}
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white"
        style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }}
      >
        <span key={bump} className={bump ? "ca-bump" : ""}>
          <Icon name="favorite" size={17} outlined={!fav} color={fav ? "#FF4B72" : "rgba(0,0,0,0.54)"} />
        </span>
      </button>

      {count > 1 && (
        <div className="absolute bottom-2.5 right-3 flex rounded-xl bg-black/65 px-1.5 py-1">
          {slides.map((_, i) => (
            <span
              key={i}
              className="ml-1 h-[5px] rounded-[3px] transition-all duration-250 first:ml-0"
              style={{ width: i === page ? 14 : 5, background: i === page ? "#fff" : "rgba(255,255,255,0.5)" }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Offers ticker: the next offer slides in from the right (AutoScrollingOffers). */
function OffersTicker({ offers }) {
  const [paused, setPaused] = useState(false)
  const [i] = useRotatingIndex(offers.length, 3500, paused)
  if (!offers.length) return null
  return (
    <div
      className="mt-1.5 overflow-hidden"
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setTimeout(() => setPaused(false), 5000)}
    >
      <div key={i} className="ca-ticker-left flex items-center gap-1" style={{ color: "var(--ca-primary-deep)" }}>
        <Icon name="local_offer" size={12} />
        <span className="truncate text-xs font-bold">{offers[i]}</span>
      </div>
    </div>
  )
}

function MustTryTicker({ items }) {
  const [i] = useRotatingIndex(items.length, 2800)
  return (
    <div className="min-w-0 flex-1 overflow-hidden">
      <div key={i} className="ca-ticker-up flex min-w-0 items-center gap-1">
        <span className="shrink-0 text-[11px] font-bold" style={{ color: "var(--ca-primary-deep)" }}>
          Must Try •
        </span>
        <span className="truncate text-[11.5px] font-semibold" style={{ color: "var(--ca-title)" }}>
          {items[i]}
        </span>
      </div>
    </div>
  )
}

/** The main feed card (restaurant_card.dart). */
function RestaurantCard({ restaurant: r, index = 0 }) {
  const navigate = useNavigate()
  const [ref, inView] = useInView("300px")
  const menu = useRestaurantMenu(r.id, inView)
  const [page, setPage] = useState(0)

  const withImages = menu.filter((f) => f.imageUrl)
  const featured = menu.find((f) => f.isPopular) || menu[0] || null

  let slides = withImages.map((f) => f.imageUrl)
  if (!slides.length) slides = r.menuImages.length ? r.menuImages : r.coverImages.length ? r.coverImages : r.imageUrl ? [r.imageUrl] : []

  const startingPrice = r.priceForOne > 0 ? r.priceForOne : featured ? featured.price : 0
  const slideSource = withImages.length ? withImages : menu
  const slidePrices = slideSource.map((f) => f.price)
  const slideLabels = slideSource.map(dishLabel)

  let topItems = menu.slice(0, 3).map(dishLabel)
  if (!topItems.length && r.featuredDishName) {
    topItems = [`${r.featuredDishName}${startingPrice > 0 ? ` • ${rupees(startingPrice)}` : ""}`, ...r.tags.slice(0, 1)]
  } else if (!topItems.length) {
    topItems = r.tags.slice(0, 3)
  }

  const featuredDishName = r.featuredDishName || featured?.name
  const priceBadge = startingPrice > 0 ? `${rupees(startingPrice)} for one` : null
  const dishLabels = slideLabels.length
    ? slideLabels
    : topItems.length
      ? topItems
      : featuredDishName
        ? [`${featuredDishName}${priceBadge ? ` • ${priceBadge}` : ""}`]
        : priceBadge
          ? [priceBadge]
          : []

  const activePrice = slidePrices.length && slidePrices[page % slidePrices.length] > 0 ? slidePrices[page % slidePrices.length] : startingPrice
  const cuisines = r.tags.length ? r.tags.join("  •  ") : "Desserts  •  North Indian  •  Snacks"
  const open = () => r.isOpen && navigate(`/food/user/restaurants/${r.slug}`)

  const dot = <span className="px-[3px] opacity-50">•</span>

  return (
    <div
      ref={ref}
      className="ca-card-in"
      style={{ animationDelay: `${(index % 6) * 60}ms` }}
    >
      <div
        role="link"
        tabIndex={r.isOpen ? 0 : -1}
        onClick={open}
        onKeyDown={(e) => e.key === "Enter" && open()}
        className={`mx-3 mb-3.5 overflow-hidden rounded-2xl border ${r.isOpen ? "cursor-pointer" : "grayscale"}`}
        style={{
          background: "var(--ca-card)",
          borderColor: "var(--ca-card-border)",
          boxShadow: "0 6px 16px var(--ca-shadow)",
        }}
      >
        <MediaCarousel restaurant={r} slides={slides} dishLabels={dishLabels} onPage={setPage} />

        <div className="px-3 py-1.5">
          <div className="flex items-center">
            <h3 className="min-w-0 flex-1 truncate text-[16.5px] font-bold tracking-[-0.2px]" style={{ color: "var(--ca-title)" }}>
              {r.name}
            </h3>
            {r.isPromoted && (
              <span className="mx-1.5">
                <PromotedTag fontSize={10} />
              </span>
            )}
            {r.rating > 0 && (
              <span className="flex items-center gap-[3px] rounded-lg bg-[#22C55E] px-2 py-1 text-xs font-bold text-white">
                <Icon name="star" size={13} color="#fff" />
                {r.rating.toFixed(1)}
              </span>
            )}
          </div>

          <OffersTicker offers={r.offerBadges} />

          <div className="mt-[3px] flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center truncate text-xs font-semibold" style={{ color: "var(--ca-muted)" }}>
              {r.deliveryTime && (
                <>
                  <Icon name="schedule" size={13} color="var(--ca-primary-deep)" />
                  <span className="ml-1">{r.deliveryTime}</span>
                </>
              )}
              {r.distanceKm != null && (
                <>
                  {r.deliveryTime && dot}
                  <span>{r.distanceKm.toFixed(1)} km</span>
                </>
              )}
              {activePrice > 0 && (
                <>
                  {(r.deliveryTime || r.distanceKm != null) && dot}
                  <span>{rupees(activePrice)} for one</span>
                </>
              )}
            </div>
            {r.area ? (
              <span className="flex min-w-0 max-w-[45%] items-center gap-[3px]" style={{ color: "var(--ca-primary-deep)" }}>
                <Icon name="location_on" size={12} />
                <span className="truncate text-[11.5px] font-bold">{r.area}</span>
              </span>
            ) : (
              !r.isOpen && (
                <span className="flex items-center gap-1 rounded-2xl border border-[#FECDD3] bg-[#FFF1F2] px-2.5 py-1 text-[11px] font-bold text-[#E11D48]">
                  <Icon name="schedule" size={12} />
                  Unavailable Delivery
                </span>
              )
            )}
          </div>

          <div className="mt-[3px] flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium" style={{ color: "var(--ca-muted)" }}>
              {cuisines}
            </span>
            {r.isPureVeg && (
              <span className="flex shrink-0 items-center gap-[3px] text-[#2E7D32]">
                <Icon name="eco" size={12} />
                <span className="text-[11.5px] font-bold">Pure Veg</span>
              </span>
            )}
          </div>

          {!r.isOpen && (
            <div
              className="mt-1.5 flex gap-2 rounded-xl border px-3 py-2"
              style={{ background: "var(--ca-primary-tint)", borderColor: "var(--ca-primary-soft)" }}
            >
              <Icon name="schedule" size={15} color="var(--ca-primary-deep)" style={{ marginTop: 2 }} />
              <div style={{ color: "var(--ca-primary-deep-text)" }}>
                <div className="text-[11.5px] font-bold">Delivery is currently unavailable.</div>
                <div className="mt-px text-[10.5px] font-medium opacity-85">It will accept orders once it reopens.</div>
              </div>
            </div>
          )}

          {topItems.length > 0 && (
            <div
              className="mt-[5px] flex items-center gap-1.5 rounded-xl px-2.5 py-1"
              style={{ background: "var(--ca-primary-tint)", border: "0.8px solid var(--ca-primary-soft)" }}
            >
              <Icon name="auto_awesome" size={14} color="var(--ca-primary-deep)" />
              <MustTryTicker items={topItems} />
              {r.isOpen ? (
                <span
                  className="flex shrink-0 items-center gap-0.5 rounded-lg bg-white px-2.5 py-1 text-[10.5px] font-bold"
                  style={{ color: "var(--ca-primary-deep)", border: "0.8px solid var(--ca-primary-soft)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
                >
                  <Icon name="add" size={14} />
                  Add
                </span>
              ) : (
                <span className="shrink-0 rounded-lg bg-[#E2E8F0] px-2.5 py-[5px] text-[10.5px] font-semibold text-[#64748B] dark:bg-[#334155] dark:text-[#94A3B8]">
                  Unavailable
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(RestaurantCard)
