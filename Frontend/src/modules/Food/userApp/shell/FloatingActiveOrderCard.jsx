import { useNavigate } from "react-router-dom"
import Icon from "../ui/Icon"
import { getOrderKey, getOrderStatus, getOrderStatusText } from "@food/hooks/useActiveOrderTracking"
import { restaurantLabel } from "@food/utils/entityLabels"

const ON_THE_WAY = new Set(["picked_up", "out_for_delivery", "reached_drop"])

/**
 * The live-order card floating above the bottom bar on Home
 * (floating_active_order_card.dart). Compact when the cart bar is also up.
 */
export default function FloatingActiveOrderCard({ order, timeRemaining, compact = false, bottom }) {
  const navigate = useNavigate()
  if (!order) return null

  const id = order.orderId || getOrderKey(order)
  const name = restaurantLabel(order.restaurant) || order.restaurantName || "Food Order"
  const onTheWay = ON_THE_WAY.has(getOrderStatus(order))
  const eta = timeRemaining != null ? `${Math.max(1, timeRemaining)} mins` : null

  const s = compact
    ? { icon: 32, iconSize: 16, title: 12.5, status: 11.5, chipX: 8, chipY: 5, chip: 10, gap: 8, px: 10, py: 8 }
    : { icon: 42, iconSize: 22, title: 14, status: 12.5, chipX: 12, chipY: 8, chip: 11.5, gap: 12, px: 14, py: 12 }

  return (
    <div
      className="ca-sheet fixed left-1/2 z-40 flex w-full max-w-[480px] -translate-x-1/2 justify-center px-4"
      style={{ bottom: `calc(${bottom}px + 84px + env(safe-area-inset-bottom, 0px))` }}
    >
      <button
        type="button"
        onClick={() => navigate(`/food/user/orders/${id}`)}
        className="flex items-center rounded-3xl border border-[#E5E7EB] text-left transition-all duration-300 dark:border-[#303030]"
        style={{
          width: compact ? 280 : "100%",
          padding: `${s.py}px ${s.px}px`,
          background: "var(--ca-card)",
          boxShadow: "0 6px 16px rgba(0,0,0,0.08)",
        }}
      >
        <span
          className="flex shrink-0 items-center justify-center rounded-full"
          style={{ width: s.icon, height: s.icon, background: "rgba(245,74,0,0.12)" }}
        >
          <Icon name={onTheWay ? "two_wheeler" : "soup_kitchen"} size={s.iconSize} color="var(--ca-primary)" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col" style={{ marginLeft: s.gap }}>
          <span
            className="truncate font-bold tracking-[-0.2px] text-[#1E1E1E] dark:text-white"
            style={{ fontSize: s.title }}
          >
            {name}
          </span>
          <span className="flex items-center gap-1" style={{ marginTop: compact ? 0 : 2 }}>
            <span className="truncate font-medium text-[#6B7280] dark:text-[#9E9E9E]" style={{ fontSize: s.status }}>
              {getOrderStatusText(order)}
            </span>
            <Icon name="play_arrow" size={14} color="var(--ca-primary)" />
          </span>
        </span>
        {eta && (
          <span
            className="ml-2 max-w-[120px] truncate rounded-2xl font-bold tracking-[0.2px] text-white"
            style={{
              padding: `${s.chipY}px ${s.chipX}px`,
              fontSize: s.chip,
              background: "#00B562",
              boxShadow: "0 2px 6px rgba(0,181,98,0.25)",
            }}
          >
            {eta}
          </span>
        )}
      </button>
    </div>
  )
}
