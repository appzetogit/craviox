import { useNavigate } from "react-router-dom"
import { useCart } from "@food/context/CartContext"
import Icon from "../ui/Icon"

const formatRupees = (n) => `₹${Math.round(Number(n) || 0)}`

/** Floating "View Cart" pill above the bottom bar (floating_view_cart_bar.dart). */
export default function FloatingViewCartBar({ bottom = 16, aboveNav = true }) {
  const navigate = useNavigate()
  const { itemCount, total, items } = useCart()
  if (!itemCount) return null

  const thumbs = (items || []).filter((i) => i?.product?.imageUrl).slice(0, 3)
  const extra = Math.max(0, (items || []).length - thumbs.length)

  return (
    <div
      className="ca-sheet fixed left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 px-5"
      style={{ bottom: `calc(${bottom}px + ${aboveNav ? 84 : 0}px + env(safe-area-inset-bottom, 0px))` }}
    >
      <button
        type="button"
        onClick={() => navigate("/food/user/cart")}
        className="relative flex h-14 w-full items-center overflow-hidden rounded-3xl px-3 py-2 text-left text-white"
        style={{ background: "var(--ca-primary)", boxShadow: "0 8px 20px rgba(235,46,0,0.4)" }}
      >
        <span className="ca-glow-sweep pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-white/20 blur-md" />
        <span className="relative flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-[17px] font-bold">{formatRupees(total)}</span>
          <span className="text-xs font-medium text-white/90">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
        </span>
        <span className="relative mr-3 flex items-center">
          {thumbs.map((t, i) => (
            <span
              key={`${t.product.id}-${i}`}
              className="-ml-3 h-[34px] w-[34px] rounded-[10px] bg-white p-0.5 first:ml-0"
              style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.15)", zIndex: 3 - i }}
            >
              <img src={t.product.imageUrl} alt="" className="h-[30px] w-[30px] rounded-lg object-cover" />
            </span>
          ))}
          {extra > 0 && (
            <span className="-ml-3 flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border-[1.5px] border-white bg-white/25 text-[11px] font-bold">
              +{extra}
            </span>
          )}
        </span>
        <span className="relative text-[15px] font-bold">View Cart</span>
        <Icon name="chevron_right" size={24} color="#fff" className="relative" />
      </button>
    </div>
  )
}
