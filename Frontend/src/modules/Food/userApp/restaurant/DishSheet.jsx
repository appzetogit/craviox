import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import BottomSheet from "../ui/BottomSheet"
import Icon from "../ui/Icon"
import { VegMark } from "./DishParts"

const rupees = (n) => `₹${Math.round(Number(n) || 0)}`

function Stepper({ value, onChange, min = 0, height = 34 }) {
  return (
    <span
      className="flex items-center rounded-lg px-2.5"
      style={{ height, background: "var(--ca-primary-tint)", border: "1.2px solid var(--ca-primary)", color: "var(--ca-primary)" }}
    >
      <button type="button" aria-label="Less" onClick={() => onChange(Math.max(min, value - 1))} className="flex p-0.5">
        <Icon name="remove" size={16} />
      </button>
      <span className="min-w-7 text-center text-sm font-black">{value}</span>
      <button type="button" aria-label="More" onClick={() => onChange(value + 1)} className="flex p-0.5">
        <Icon name="add" size={16} />
      </button>
    </span>
  )
}

const SectionTitle = ({ children, aside }) => (
  <div className="flex items-center justify-between gap-2">
    <h3 className="text-[15px] font-black" style={{ color: "var(--ca-title)" }}>{children}</h3>
    {aside && <span className="text-xs font-bold" style={{ color: "var(--ca-primary)" }}>{aside}</span>}
  </div>
)

/**
 * Dish details (food_detail_sheet.dart): photo, price, size, quantity and
 * optional add-ons, then "Add to Cart | ₹total".
 */
export function DishSheet({ dish, addons, onClose, onAddToCart, closed }) {
  const [variantId, setVariantId] = useState("")
  const [qty, setQty] = useState(1)
  const [addonQty, setAddonQty] = useState({})

  useEffect(() => {
    if (!dish) return
    setVariantId(dish.variants[0]?.id || "")
    setQty(1)
    setAddonQty({})
  }, [dish])

  const variant = useMemo(() => dish?.variants.find((v) => v.id === variantId) || null, [dish, variantId])
  if (!dish) return null

  const unit = variant ? Number(variant.price) : dish.price
  const unitOther = variant ? (Number(variant.otherPrice) > unit ? Number(variant.otherPrice) : 0) : dish.otherPrice
  const addonsTotal = addons.reduce((sum, a) => sum + a.price * (addonQty[a.id] || 0), 0)
  const total = unit * qty + addonsTotal
  const pct = unitOther > unit ? Math.round(((unitOther - unit) / unitOther) * 100) : 0

  return (
    <BottomSheet open={Boolean(dish)} onClose={onClose} maxHeight="88vh">
      <div className="ca-noscroll flex-1 overflow-y-auto px-4 pb-4 pt-2">
        <div className="relative overflow-hidden rounded-2xl bg-[#F1F5F9]" style={{ height: 200 }}>
          {dish.imageUrl ? (
            <img src={dish.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <Icon name="restaurant" size={48} color="#CBD5E1" />
            </span>
          )}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full border border-[#E2E8F0] bg-white"
          >
            <Icon name="close" size={18} color="var(--ca-primary)" />
          </button>
        </div>

        <div className="mt-3.5 flex items-start gap-2">
          <span className="mt-1">
            <VegMark veg={dish.isVeg} size={14} />
          </span>
          <h2 className="text-[17px] font-extrabold leading-[1.2]" style={{ color: "var(--ca-title)" }}>
            {dish.name}
          </h2>
        </div>
        {dish.isBestseller && (
          <span className="mt-1.5 inline-block rounded bg-[#E0F2FE] px-1.5 py-0.5 text-[9.5px] font-extrabold text-[#0284C7]">
            Bestseller
          </span>
        )}
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-lg font-black" style={{ color: "var(--ca-title)" }}>{rupees(unit)}</span>
          {unitOther > 0 && <span className="text-[13px] text-[#94A3B8] line-through">{rupees(unitOther)}</span>}
          {pct > 0 && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-extrabold" style={{ background: "var(--ca-primary-tint)", color: "var(--ca-primary)" }}>
              {pct}% OFF
            </span>
          )}
        </div>
        {dish.description && <p className="mt-3 text-[13px] leading-[1.4] text-[#64748B]">{dish.description}</p>}

        {dish.variants.length > 0 && (
          <>
            <hr className="my-4 border-[#F1F5F9]" />
            <SectionTitle aside="Required">Choose a size</SectionTitle>
            <div className="mt-3 space-y-2">
              {dish.variants.map((v) => {
                const on = v.id === variantId
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVariantId(v.id)}
                    className="flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left"
                    style={{ borderColor: on ? "var(--ca-primary)" : "#E2E8F0", background: on ? "var(--ca-primary-tint)" : "#fff" }}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className="flex h-[18px] w-[18px] items-center justify-center rounded-full border-2"
                        style={{ borderColor: on ? "var(--ca-primary)" : "#CBD5E1" }}
                      >
                        {on && <span className="h-2 w-2 rounded-full" style={{ background: "var(--ca-primary)" }} />}
                      </span>
                      <span className="text-[13.5px] font-bold text-[#0F172A]">{v.name}</span>
                    </span>
                    <span className="text-[13.5px] font-extrabold text-[#0F172A]">{rupees(v.price)}</span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        <hr className="my-4 border-[#F1F5F9]" />
        <div className="flex items-center justify-between">
          <SectionTitle>{dish.variants.length ? "2. Quantity" : "1. Quantity"}</SectionTitle>
          <Stepper value={qty} min={1} onChange={setQty} />
        </div>

        {addons.length > 0 && (
          <>
            <hr className="my-4 border-[#F1F5F9]" />
            <SectionTitle aside="(Optional)">{dish.variants.length ? "3. Choose Add-ons" : "2. Choose Add-ons"}</SectionTitle>
            <div className="mt-3 space-y-3">
              {addons.map((a) => {
                const n = addonQty[a.id] || 0
                const on = n > 0
                return (
                  <div key={a.id} className="flex items-center gap-3">
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setAddonQty((m) => ({ ...m, [a.id]: on ? 0 : 1 }))}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border-2"
                        style={{ borderColor: on ? "var(--ca-primary)" : "#CBD5E1", background: on ? "var(--ca-primary)" : "#fff" }}
                      >
                        {on && <Icon name="check" size={14} color="#fff" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-extrabold text-[#0F172A]">{a.name}</span>
                        {a.description && <span className="block truncate text-[11px] font-medium text-[#64748B]">{a.description}</span>}
                      </span>
                    </button>
                    <span className="text-[13.5px] font-extrabold text-[#0F172A]">+{rupees(a.price)}</span>
                    {on && <Stepper height={30} value={n} onChange={(v) => setAddonQty((m) => ({ ...m, [a.id]: v }))} />}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <div className="rounded-t-[20px] bg-[#F8FAFC] px-4 pb-4 pt-3" style={{ boxShadow: "0 -2px 10px rgba(0,0,0,0.05)" }}>
        <button
          type="button"
          disabled={closed || !dish.isAvailable}
          onClick={() => {
            const ok = onAddToCart({ dish, variant, quantity: qty, addonQty })
            if (ok) {
              toast.success(`${dish.name} added to cart`)
              onClose()
            }
          }}
          className="flex w-full items-center justify-center gap-3 rounded-[14px] px-4 py-3.5 text-sm font-black text-white disabled:opacity-50"
          style={{ background: "var(--ca-primary)" }}
        >
          {closed ? "Restaurant closed" : !dish.isAvailable ? "Sold out" : "Add to Cart"}
          {!closed && dish.isAvailable && (
            <>
              <span className="h-3.5 w-px bg-white/40" />
              {rupees(total)}
            </>
          )}
        </button>
      </div>
    </BottomSheet>
  )
}

/** "Menu" index: every category with its dish count; picking one jumps to it. */
export function MenuIndexSheet({ open, groups, onPick, onClose }) {
  if (!open) return null
  return createPortal(
    <div className="ca-app fixed inset-0 z-[100] flex items-end justify-center" style={{ background: "transparent" }}>
      <div className="ca-fade-in absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="ca-sheet relative m-4 w-full max-w-[448px] overflow-y-auto rounded-[20px] bg-white py-2"
        style={{ maxHeight: "70vh", marginBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}
      >
        {groups.map(([name, items], i) => (
          <button
            key={name}
            type="button"
            onClick={() => onPick(name)}
            className={`flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-[#F8FAFC] ${i ? "border-t border-[#F1F5F9]" : ""}`}
          >
            <span className="text-[15px] font-bold text-[#0F172A]">{name}</span>
            <span className="text-[15px] font-bold text-[#64748B]">{items.length}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )
}
