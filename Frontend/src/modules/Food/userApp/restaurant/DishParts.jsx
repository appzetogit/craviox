import { memo } from "react"
import Icon from "../ui/Icon"

const rupees = (n) => `₹${Math.round(Number(n) || 0)}`

/** Green square with a dot (veg) or red square with a triangle (non-veg). */
export function VegMark({ veg, size = 12 }) {
  const color = veg ? "#16A34A" : "#EF4444"
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[2px] bg-white"
      style={{ width: size, height: size, border: `1.2px solid ${color}` }}
      aria-label={veg ? "Veg" : "Non-veg"}
    >
      {veg ? (
        <span className="rounded-full" style={{ width: size * 0.42, height: size * 0.42, background: color }} />
      ) : (
        <span
          style={{
            width: 0,
            height: 0,
            borderLeft: `${size * 0.25}px solid transparent`,
            borderRight: `${size * 0.25}px solid transparent`,
            borderBottom: `${size * 0.45}px solid ${color}`,
          }}
        />
      )}
    </span>
  )
}

/** ADD button that turns into a − n + stepper (height 30, radius 8). */
export function AddStepper({ qty, onAdd, onRemove, disabled = false, small = false }) {
  const h = small ? 26 : 30
  if (qty > 0) {
    return (
      <span
        className="flex shrink-0 items-center rounded-lg px-1.5"
        style={{ height: h, background: "var(--ca-primary-tint)", border: "1.2px solid var(--ca-primary)", color: "var(--ca-primary)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" aria-label="Remove one" onClick={onRemove} className="flex p-0.5">
          <Icon name="remove" size={14} />
        </button>
        <span className="px-1.5 text-xs font-extrabold">{qty}</span>
        <button type="button" aria-label="Add one" onClick={onAdd} className="flex p-0.5">
          <Icon name="add" size={14} />
        </button>
      </span>
    )
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onAdd()
      }}
      className={`flex shrink-0 items-center justify-center gap-0.5 rounded-lg bg-white font-black disabled:opacity-50 ${small ? "w-full text-[10px]" : "px-3.5 text-[11px]"}`}
      style={{ height: h, border: "1.2px solid var(--ca-primary)", color: "var(--ca-primary)" }}
    >
      ADD
      <Icon name="add" size={12} />
    </button>
  )
}

const BestsellerTag = ({ size = 8.5 }) => (
  <span
    className="shrink-0 rounded px-[5px] py-[1.5px] font-extrabold"
    style={{ fontSize: size, background: "var(--ca-primary-tint)", color: "var(--ca-primary)" }}
  >
    Bestseller
  </span>
)

/** One menu dish (restaurant_screen.dart _buildDishCard). */
export const DishCard = memo(function DishCard({ dish, qty, onOpen, onAdd, onRemove, closed }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(dish)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(dish)}
      className={`flex cursor-pointer items-center gap-2.5 rounded-[14px] border border-[#E2E8F0] bg-white p-2.5 dark:border-[#303030] dark:bg-[#242424] ${dish.isAvailable ? "" : "opacity-60"}`}
      style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}
    >
      <span className="block aspect-square w-[40%] shrink-0 overflow-hidden rounded-xl bg-[#F1F5F9]">
        {dish.imageUrl ? (
          <img src={dish.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <Icon name="restaurant" size={32} color="#CBD5E1" />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          <VegMark veg={dish.isVeg} />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-extrabold" style={{ color: "var(--ca-title)" }}>
            {dish.name}
          </span>
          {dish.isBestseller && <BestsellerTag />}
        </span>
        {dish.description && (
          <span className="mt-[3px] line-clamp-2 text-[10.5px] leading-[1.3] text-[#64748B]">{dish.description}</span>
        )}
        <span className="mt-2 flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-baseline gap-1 truncate">
            <span className="text-sm font-black" style={{ color: "var(--ca-title)" }}>
              {dish.variants.length ? `From ${rupees(dish.price)}` : rupees(dish.price)}
            </span>
            {dish.otherPrice > 0 && <span className="text-[11px] text-[#94A3B8] line-through">{rupees(dish.otherPrice)}</span>}
            {dish.discountPercent > 0 && (
              <span className="text-[9.5px] font-extrabold" style={{ color: "var(--ca-primary)" }}>
                {dish.discountPercent}% OFF
              </span>
            )}
          </span>
          {dish.isAvailable ? (
            <AddStepper qty={qty} onAdd={() => onAdd(dish)} onRemove={() => onRemove(dish)} disabled={closed} />
          ) : (
            <span className="shrink-0 text-[10.5px] font-bold text-[#94A3B8]">Sold out</span>
          )}
        </span>
      </span>
    </div>
  )
})

/** Small card in the "Bestsellers" strip. */
export function BestsellerCard({ dish, qty, onOpen, onAdd, onRemove, closed }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(dish)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(dish)}
      className="w-[150px] shrink-0 cursor-pointer overflow-hidden rounded-[14px] border border-[#E2E8F0] bg-white dark:border-[#303030] dark:bg-[#242424]"
    >
      <span className="block h-[75px] bg-[#F1F5F9]">
        {dish.imageUrl && <img src={dish.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}
      </span>
      <span className="block p-2">
        <span className="block truncate text-[11.5px] font-extrabold" style={{ color: "var(--ca-title)" }}>
          {dish.name}
        </span>
        <span className="mt-0.5 inline-block">
          <BestsellerTag size={8} />
        </span>
        <span className="mt-1 flex items-baseline gap-1">
          <span className="text-xs font-black" style={{ color: "var(--ca-title)" }}>{rupees(dish.price)}</span>
          {dish.otherPrice > 0 && <span className="text-[10px] text-[#94A3B8] line-through">{rupees(dish.otherPrice)}</span>}
        </span>
        <span className="mt-1.5 flex">
          <AddStepper small qty={qty} onAdd={() => onAdd(dish)} onRemove={() => onRemove(dish)} disabled={closed || !dish.isAvailable} />
        </span>
      </span>
    </div>
  )
}
