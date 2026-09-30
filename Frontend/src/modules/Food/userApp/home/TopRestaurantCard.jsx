import { memo, useLayoutEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import Icon from "../ui/Icon"
import PromotedTag from "../ui/PromotedTag"
import { useFavoriteToggle } from "./RestaurantCard"

/** One line that drifts sideways when it does not fit (_MarqueeText). */
function Marquee({ text, className, style }) {
  const box = useRef(null)
  const inner = useRef(null)
  const [shift, setShift] = useState(0)
  useLayoutEffect(() => {
    const overflow = (inner.current?.scrollWidth || 0) - (box.current?.clientWidth || 0)
    setShift(overflow > 6 ? overflow + 6 : 0)
  }, [text])
  return (
    <div ref={box} className={`overflow-hidden whitespace-nowrap ${className}`} style={style}>
      <span
        ref={inner}
        className={`inline-block ${shift ? "ca-marquee" : ""}`}
        style={
          shift
            ? { "--ca-marquee-shift": `-${shift}px`, "--ca-marquee-duration": `${Math.min(4.5, Math.max(1.4, shift * 0.028)) + 2.7}s` }
            : undefined
        }
      >
        {text}
      </span>
    </div>
  )
}

// Stable per restaurant, so a card keeps its colours when the feed re-sorts.
function variantOf(id) {
  let h = 0
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(h) % 3
}

const TAGS = [
  { bg: "#EBF7EE", fg: "#16A34A", logo: "#0D4734", logoText: "#fff" },
  { bg: "#FDE8E8", fg: "#DC2626", logo: "#D31027", logoText: "#fff" },
  { bg: "#FEF9C3", fg: "#D97706", logo: "#FFCB05", logoText: "#000" },
]

/** The small card in the 2-row "Top Restaurants" rail (top_restaurant_card.dart). */
function TopRestaurantCard({ restaurant: r }) {
  const navigate = useNavigate()
  const [fav, toggleFav] = useFavoriteToggle(r)
  const v = TAGS[variantOf(r.id)]
  const isBestseller = r.highlightBadge === "bestseller"
  const time = !r.deliveryTime ? "" : r.deliveryTime.includes("min") ? r.deliveryTime : `${r.deliveryTime} mins`
  const freeText = r.freeDeliveryAbove == null ? "" : r.freeDeliveryAbove <= 0 ? "Free delivery" : `Free delivery above ₹${Math.round(r.freeDeliveryAbove)}`

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/food/user/restaurants/${r.slug}`)}
      onKeyDown={(e) => e.key === "Enter" && navigate(`/food/user/restaurants/${r.slug}`)}
      className={`flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white dark:border-[#334155] dark:bg-[#1E293B] ${r.isOpen ? "" : "grayscale"}`}
      style={{ boxShadow: "0 1.5px 5px rgba(0,0,0,0.04)" }}
    >
      <div className="relative h-[54px] shrink-0">
        {r.imageUrl ? (
          <img src={r.imageUrl} alt="" loading="lazy" className="h-full w-full rounded-t-[11px] object-cover" />
        ) : (
          <div className="h-full w-full rounded-t-[11px] bg-[#F0F0F0]" />
        )}

        {r.highlightBadge && (
          <span
            className="absolute left-1 top-1 flex items-center gap-[1.5px] rounded-lg px-1 py-[1.5px] text-[8.5px] font-extrabold tracking-[-0.2px]"
            style={{
              background: isBestseller ? "#FDE047" : "#FF2B42",
              color: isBestseller ? "#1E293B" : "#fff",
              boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
            }}
          >
            {isBestseller ? <span className="text-[8px]">👑</span> : <Icon name="star" size={8.5} color="#fff" />}
            {isBestseller ? "Bestseller" : "Popular"}
          </span>
        )}
        {r.isPromoted && (
          <span className="absolute left-1" style={{ top: r.highlightBadge ? 20 : 4 }}>
            <PromotedTag fontSize={8} compact />
          </span>
        )}

        <button
          type="button"
          aria-label={fav ? "Remove from favourites" : "Add to favourites"}
          onClick={toggleFav}
          className="absolute right-1 top-1 flex rounded-full bg-black/25 p-[2.5px]"
        >
          <Icon name="favorite" size={13.5} outlined={!fav} color={fav ? "#EF4444" : "#fff"} />
        </button>

        <span
          className="absolute -bottom-[9px] left-[5px] h-6 w-6 overflow-hidden rounded-full border-[1.5px] border-white bg-white"
          style={{ boxShadow: "0 1px 2.5px rgba(0,0,0,0.12)" }}
        >
          {r.logoUrl ? (
            <img src={r.logoUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center p-0.5" style={{ background: v.logo, color: v.logoText }}>
              <Icon name="restaurant" size={12} />
            </span>
          )}
        </span>

        {r.offerBadges.length > 0 && (
          <span
            className="absolute bottom-1 left-8 right-1 truncate rounded-md px-[5px] py-0.5 text-center text-[8.5px] font-extrabold tracking-[-0.1px] text-white"
            style={{ background: "rgba(6,78,59,0.92)", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }}
          >
            {r.offerBadges[0]}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-col px-[5px] pb-0.5 pt-1">
        <Marquee text={r.name} className="text-[10.5px] font-semibold tracking-[-0.2px] text-[#334155] dark:text-[#E2E8F0]" />
        <Marquee
          text={r.tags.length ? r.tags.join(" • ") : r.area}
          className="mt-px text-[8.5px] font-medium text-[#64748B] dark:text-[#94A3B8]"
        />
        <div className="mt-0.5 flex items-center">
          {r.rating > 0 && (
            <span className="flex items-center gap-[1.5px] rounded-[3.5px] bg-[#16A34A] px-[3.5px] py-px text-[9px] font-bold text-white">
              <Icon name="star" size={9} color="#fff" />
              {r.rating.toFixed(1)}
            </span>
          )}
          {r.rating > 0 && time && <span className="mx-1 h-2 w-px bg-[#CBD5E1] dark:bg-[#475569]" />}
          {time && (
            <>
              <Icon name="directions_bike" size={11.5} className="text-[#334155] dark:text-[#CBD5E1]" />
              <span className="ml-[2.5px] truncate text-[9.5px] font-semibold text-[#334155] dark:text-[#F1F5F9]">{time}</span>
            </>
          )}
        </div>
        {freeText && (
          <span className="mt-[3px] flex items-center gap-[3px] rounded-[5px] px-[4.5px] py-0.5" style={{ background: v.bg, color: v.fg }}>
            <Icon name="sell" size={9.5} />
            <span className="truncate text-[8.5px] font-semibold">{freeText}</span>
          </span>
        )}
      </div>
    </div>
  )
}

export default memo(TopRestaurantCard)
