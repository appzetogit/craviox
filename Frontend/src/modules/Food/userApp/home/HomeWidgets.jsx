import { useEffect, useRef, useState } from "react"
import Icon from "../ui/Icon"
import { useRotatingIndex } from "../ui/hooks"

/**
 * Read-only search bar on Home (search_bar_widget.dart): rotating
 * `Search "<category>"` hint, divider and mic.
 */
export function SearchBar({ categories = [], onTap, onMic }) {
  const hints = categories.length ? categories : ["biryani", "pizza", "burger", "cake"]
  const [i] = useRotatingIndex(hints.length, 2500)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={(e) => e.key === "Enter" && onTap?.()}
      className="flex h-12 min-w-0 flex-1 cursor-text items-center rounded-3xl pl-4 pr-1.5"
      style={{
        background: "var(--ca-surface)",
        border: "1.2px solid rgba(245,74,0,0.35)",
        boxShadow: "0 3px 10px rgba(0,0,0,0.06)",
      }}
    >
      <Icon name="search" size={22} color="#64748B" />
      <div className="ml-2.5 min-w-0 flex-1 overflow-hidden">
        <span key={i} className="ca-ticker-up block truncate text-sm text-[#94A3B8]">
          Search &quot;{hints[i]}&quot;
        </span>
      </div>
      <span className="mx-1 h-6 w-px bg-[#E2E8F0] dark:bg-[#303030]" />
      <button
        type="button"
        aria-label="Search by voice"
        onClick={(e) => {
          e.stopPropagation()
          onMic?.()
        }}
        className="flex h-9 w-9 items-center justify-center rounded-full"
      >
        <Icon name="mic" size={22} color="var(--ca-primary)" />
      </button>
    </div>
  )
}

/** VEG MODE switch beside the search bar (veg_mode_toggle.dart). */
export function VegModeToggle({ on, onToggle }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Veg mode"
      onClick={onToggle}
      className="flex h-12 shrink-0 flex-col items-center justify-center rounded-xl px-[7px] py-[3px]"
      style={{
        background: on ? "#DCFCE7" : "rgba(255,255,255,0.9)",
        border: `1.2px solid ${on ? "#16A34A" : "#E2E8F0"}`,
        boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
      }}
    >
      <span className="text-[8px] font-black tracking-[0.3px]" style={{ color: on ? "#15803D" : "#475569" }}>
        VEG MODE
      </span>
      <span
        className="mt-[3px] flex h-[15px] w-[30px] rounded-[10px] p-0.5 transition-colors duration-200"
        style={{ background: on ? "#16A34A" : "#CBD5E1", justifyContent: on ? "flex-end" : "flex-start" }}
      >
        <span className="h-[11px] w-[11px] rounded-full bg-white" />
      </span>
    </button>
  )
}

/** The round category row under the search bar. */
export function CategoryRow({ categories, loading, selectedId, onSelect, onSeeAll }) {
  if (!categories.length) {
    return loading ? (
      <div className="flex h-[84px] items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/60 border-t-[var(--ca-primary)]" />
      </div>
    ) : null
  }
  const items = [{ id: "all", name: "All" }, ...categories, { id: "see_all", name: "See all" }]
  return (
    <div className="ca-noscroll flex overflow-x-auto">
      {items.map((cat) => {
        const isAll = cat.id === "all"
        const isSeeAll = cat.id === "see_all"
        const selected = selectedId === cat.id
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => (isSeeAll ? onSeeAll() : onSelect(cat))}
            className="mr-0.5 flex w-[60px] shrink-0 flex-col items-center"
          >
            {isAll ? (
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full"
                style={{ background: "var(--ca-primary)", boxShadow: "0 4px 10px rgba(245,74,0,0.25)" }}
              >
                <Icon name="grid_view" size={20} color="#fff" />
              </span>
            ) : isSeeAll ? (
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF1F2]"
                style={{ border: "1.2px solid rgba(245,74,0,0.25)", boxShadow: "0 3px 8px rgba(0,0,0,0.05)" }}
              >
                <Icon name="restaurant" size={20} color="var(--ca-primary)" />
              </span>
            ) : (
              <span
                className="h-12 w-12 overflow-hidden rounded-full bg-white p-0.5"
                style={{
                  border: selected ? "2px solid var(--ca-primary)" : "1.2px solid #F1F5F9",
                  boxShadow: "0 3px 8px rgba(0,0,0,0.05)",
                }}
              >
                {cat.imageUrl ? (
                  <img src={cat.imageUrl} alt="" loading="lazy" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center rounded-full bg-[#F1F5F9]">
                    <Icon name="restaurant" size={18} color="#94A3B8" />
                  </span>
                )}
              </span>
            )}
            <span className="mt-[3px] flex h-6 items-start justify-center">
              {isSeeAll ? (
                <span className="flex items-center text-[10px] font-bold" style={{ color: "var(--ca-primary)" }}>
                  See all
                  <Icon name="keyboard_arrow_down" size={13} />
                </span>
              ) : (
                <span
                  className="line-clamp-2 text-center text-[10px] leading-[1.15]"
                  style={{ fontWeight: selected ? 900 : 700, color: selected ? "var(--ca-primary)" : "#334155" }}
                >
                  {cat.name}
                </span>
              )}
            </span>
            <span
              className="mt-[3px] h-[3px] rounded-sm transition-all duration-200"
              style={{ width: selected && !isSeeAll ? 16 : 0, background: "var(--ca-primary)" }}
            />
          </button>
        )
      })}
    </div>
  )
}

/**
 * Hero banner strip (promo_banner_carousel.dart): 88% wide slides, rotates
 * every 4s, pill dots underneath. Renders nothing without banners.
 */
export function PromoBannerCarousel({ banners, onTap }) {
  const track = useRef(null)
  const [page, setPage] = useState(0)
  const [touching, setTouching] = useState(false)
  const [auto] = useRotatingIndex(banners.length, 4000, touching)

  useEffect(() => {
    const el = track.current
    const slide = el?.children[auto]
    if (!el || !slide || banners.length <= 1 || touching) return
    el.scrollTo({ left: slide.offsetLeft - el.offsetLeft, behavior: "smooth" })
  }, [auto, banners.length, touching])

  if (!banners.length) return null

  const onScroll = () => {
    const el = track.current
    if (!el?.children.length) return
    const w = el.children[0].offsetWidth
    setPage(Math.min(banners.length - 1, Math.round(el.scrollLeft / Math.max(1, w))))
  }

  return (
    <div>
      <div
        ref={track}
        onScroll={onScroll}
        onTouchStart={() => setTouching(true)}
        onTouchEnd={() => setTimeout(() => setTouching(false), 2000)}
        className="ca-noscroll ca-snap-x flex overflow-x-auto"
      >
        {banners.map((b, i) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onTap?.(b)}
            className="shrink-0 pr-1.5"
            style={{ width: "88%", paddingLeft: i === 0 ? 0 : 4 }}
          >
            <span
              className="block overflow-hidden rounded-[18px]"
              style={{ aspectRatio: "1.68", maxHeight: 230, minHeight: 150, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
            >
              <img src={b.imageUrl} alt="" className="h-full w-full object-cover" loading={i === 0 ? "eager" : "lazy"} />
            </span>
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-center">
        {banners.map((b, i) => (
          <span
            key={b.id}
            className="mx-1 h-2 rounded transition-all duration-250"
            style={{ width: page === i ? 18 : 8, background: page === i ? "var(--ca-primary)" : "#CBD5E1" }}
          />
        ))}
      </div>
    </div>
  )
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center rounded-[10px] px-3 py-[7px] transition-all duration-150"
      style={{
        background: active ? "rgba(245,74,0,0.1)" : "var(--ca-surface)",
        border: active ? "1.5px solid var(--ca-primary)" : "1px solid #CBD5E1",
        boxShadow: active ? "none" : "0 2px 4px rgba(0,0,0,0.03)",
      }}
    >
      {children}
    </button>
  )
}

const chipText = (active) => ({
  fontSize: 12.5,
  fontWeight: active ? 800 : 600,
  color: active ? "var(--ca-primary)" : "var(--ca-title)",
})

/** Filters · Under ₹150 · Schedule · Pure Veg · Rating 4.0+ (quick_filter_bar.dart). */
export function QuickFilterBar({ filter, isPureVeg, activeCount, scheduleLabel, onFilters, onUnder150, onSchedule, onPureVeg, onRating4 }) {
  const under150 = filter.maxPrice === 150
  const rating4 = filter.minRating === 4
  const scheduled = Boolean(filter.scheduledAt)
  const iconColor = (on) => (on ? "var(--ca-primary)" : "#475569")
  return (
    <div className="ca-noscroll flex gap-2 overflow-x-auto px-3 py-1.5">
      <Chip active={activeCount > 0} onClick={onFilters}>
        <Icon name="tune" size={15} color={iconColor(activeCount > 0)} />
        <span className="ml-[5px]" style={chipText(activeCount > 0)}>Filters</span>
        {activeCount > 0 && (
          <span className="ml-1 rounded-[10px] px-[5px] py-px text-[10px] font-black text-white" style={{ background: "var(--ca-primary)" }}>
            {activeCount}
          </span>
        )}
        <Icon name="arrow_drop_down" size={18} color={iconColor(activeCount > 0)} className="ml-1" />
      </Chip>
      <Chip active={under150} onClick={onUnder150}>
        <span style={chipText(under150)}>Under ₹150</span>
      </Chip>
      <Chip active={scheduled} onClick={onSchedule}>
        <Icon name="schedule" size={13} color={iconColor(scheduled)} />
        <span className="ml-[5px]" style={chipText(scheduled)}>{scheduled ? scheduleLabel : "Schedule"}</span>
        <Icon name={scheduled ? "close" : "keyboard_arrow_down"} size={14} color={iconColor(scheduled)} className="ml-[3px]" />
      </Chip>
      <Chip active={isPureVeg} onClick={onPureVeg}>
        <span className="flex h-3 w-3 items-center justify-center rounded-[3px] border-[1.2px] border-green-600 bg-white">
          <span className="h-[5px] w-[5px] rounded-full bg-green-600" />
        </span>
        <span className="ml-[5px]" style={chipText(isPureVeg)}>Pure Veg</span>
      </Chip>
      <Chip active={rating4} onClick={onRating4}>
        <Icon name="star" size={15} color={rating4 ? "var(--ca-primary)" : "#F59E0B"} />
        <span className="ml-[3px]" style={chipText(rating4)}>Rating 4.0+</span>
      </Chip>
    </div>
  )
}
