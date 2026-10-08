import { useState } from "react"
import { toast } from "sonner"
import BottomSheet from "../ui/BottomSheet"
import Icon from "../ui/Icon"

const rupees = (n) => `₹${Math.round(Number(n) || 0)}`

/** Coupon ticket: code panel, notched edge, headline and conditions. */
function Ticket({ offer, selected, refusal, onApply }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => onApply(offer.code)}
        className="relative flex min-h-[84px] w-full overflow-hidden rounded-xl border border-[#E2E8F0] bg-white text-left"
      >
        <span className="flex w-[100px] shrink-0 items-center justify-center px-2" style={{ background: "var(--ca-primary-tint)" }}>
          <span className="break-all text-center text-lg font-black tracking-[0.5px]" style={{ color: "var(--ca-primary)" }}>{offer.code}</span>
        </span>
        <span className="pointer-events-none absolute left-[94px] top-[-6px] h-3 w-3 rounded-full border border-[#E2E8F0] bg-white" />
        <span className="pointer-events-none absolute bottom-[-6px] left-[94px] h-3 w-3 rounded-full border border-[#E2E8F0] bg-white" />
        <span className="border-l-[1.2px] border-dashed" style={{ borderColor: "rgba(245,74,0,0.4)" }} />
        <span className="min-w-0 flex-1 py-2 pl-3 pr-3">
          <span className="flex items-start gap-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-black text-[#0F172A]">{offer.headline || offer.code}</span>
              {offer.isFirstOrderOnly && (
                <span className="mt-0.5 inline-block rounded border px-1.5 py-0.5 text-[8.5px] font-black" style={{ borderColor: "var(--ca-primary)", color: "var(--ca-primary)" }}>
                  FIRST ORDER
                </span>
              )}
            </span>
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.8px]" style={{ borderColor: selected ? "var(--ca-primary)" : "#CBD5E1" }}>
              {selected && <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--ca-primary)" }} />}
            </span>
          </span>
          {offer.conditions.length > 0 && <span className="mt-0.5 block truncate text-[11px] text-[#64748B]">{offer.conditions.join(" · ")}</span>}
          <span className="mt-1.5 flex items-center gap-2">
            {refusal && <span className="rounded bg-[#FFEDD5] px-1.5 py-0.5 text-[9.5px] font-extrabold text-[#EA580C]">{refusal}</span>}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                setOpen((v) => !v)
              }}
              className="flex items-center text-[10px] font-bold"
              style={{ color: "var(--ca-primary)" }}
            >
              View details
              <Icon name={open ? "keyboard_arrow_up" : "keyboard_arrow_down"} size={13} />
            </span>
          </span>
        </span>
      </button>
      {open && (
        <div className="mt-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5">
          {offer.conditions.length ? (
            offer.conditions.map((c) => (
              <p key={c} className="flex items-start gap-1.5 py-0.5 text-[11.5px] text-[#334155]">
                <Icon name="check_circle" outlined size={14} color="#16A34A" style={{ marginTop: 1 }} />
                {c}
              </p>
            ))
          ) : (
            <p className="text-[11.5px] text-[#64748B]">No extra conditions on this offer.</p>
          )}
        </div>
      )}
    </div>
  )
}

/** "Promocodes" sheet (coupon_sheet.dart). */
export default function CouponSheet({ open, onClose, checkout }) {
  const { offers, couponCode, appliedCode, couponError, applyCoupon, removeCoupon, pricing } = checkout
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)

  const apply = async (code) => {
    if (!String(code || "").trim() || busy) return
    setBusy(true)
    const r = await applyCoupon(code)
    setBusy(false)
    if (r.ok) {
      toast.success(r.message)
      setInput("")
      onClose()
    } else {
      toast.error(r.message)
    }
  }

  const firstOrder = offers.filter((o) => o.isFirstOrderOnly)

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="88vh">
      <div className="flex items-start justify-between px-[18px]">
        <div>
          <h2 className="text-xl font-black tracking-[-0.3px] text-[#0F172A]">Promocodes</h2>
          <p className="mt-0.5 text-[12.5px] font-medium text-[#64748B]">Save more on your order</p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-[#E2E8F0] bg-white"
          style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}
        >
          <Icon name="close" size={18} color="var(--ca-primary)" />
        </button>
      </div>

      <div className="ca-noscroll mt-4 flex-1 overflow-y-auto px-[18px] pb-6">
        <form
          className="flex h-12 items-center overflow-hidden rounded-[10px] border border-[#E2E8F0]"
          onSubmit={(e) => {
            e.preventDefault()
            apply(input)
          }}
        >
          <span className="ml-3.5">
            <Icon name="local_offer" outlined size={18} color="var(--ca-primary)" />
          </span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            placeholder="Enter Promocode"
            aria-label="Promocode"
            className="ml-2.5 min-w-0 flex-1 bg-transparent text-[13.5px] font-semibold tracking-[0.5px] text-[#0F172A] outline-none placeholder:font-medium placeholder:tracking-normal placeholder:text-[#94A3B8]"
          />
          {input && (
            <button type="button" aria-label="Clear" onClick={() => setInput("")} className="mr-2 flex">
              <Icon name="cancel" size={18} color="#CBD5E1" />
            </button>
          )}
          <button type="submit" disabled={!input.trim() || busy} className="h-12 px-6 text-sm font-extrabold text-white disabled:opacity-60" style={{ background: "var(--ca-primary)" }}>
            {busy ? "…" : "Apply"}
          </button>
        </form>

        {appliedCode && (
          <div className="mt-3 flex items-center gap-2 rounded-[10px] border px-3.5 py-3" style={{ borderColor: "var(--ca-primary)" }}>
            <Icon name="local_offer" outlined size={16} color="var(--ca-primary)" />
            <p className="min-w-0 flex-1 text-[11.5px] font-medium text-[#334155]">
              Code <b className="font-black" style={{ color: "var(--ca-primary)" }}>{appliedCode}</b> applied — you saved{" "}
              <b className="font-black" style={{ color: "var(--ca-primary)" }}>{rupees(pricing?.discount)}</b>
            </p>
            <button type="button" onClick={removeCoupon} className="text-[10px] font-black tracking-[0.5px]" style={{ color: "var(--ca-primary)" }}>
              REMOVE
            </button>
          </div>
        )}

        <h3 className="mb-3 mt-5 text-[15px] font-black text-[#0F172A]">Best Offers for You</h3>
        {offers.length ? (
          offers.map((o) => (
            <Ticket
              key={o.code}
              offer={o}
              selected={appliedCode === o.code || couponCode === o.code}
              refusal={couponCode === o.code && !appliedCode ? couponError || "Not valid for this order" : ""}
              onApply={apply}
            />
          ))
        ) : (
          <p className="text-[12.5px] font-semibold text-[#64748B]">No offers available right now</p>
        )}

        {firstOrder.length > 0 && (
          <>
            <h3 className="mb-3 mt-[22px] text-[15px] font-black text-[#0F172A]">For First Time Users</h3>
            {firstOrder.map((o) => (
              <div key={`first-${o.code}`} className="mb-2 flex items-center gap-3 rounded-2xl border border-[#E2E8F0] p-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--ca-primary-tint)" }}>
                  <Icon name="card_giftcard" size={22} color="var(--ca-primary)" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-black" style={{ color: "var(--ca-primary)" }}>{o.code}</span>
                  <span className="block truncate text-[11.5px] font-bold text-[#0F172A]">{o.headline}</span>
                  {o.conditions.length > 0 && <span className="block truncate text-[10.5px] text-[#64748B]">{o.conditions.join(" · ")}</span>}
                </span>
                <button type="button" onClick={() => apply(o.code)} className="rounded-[10px] border-[1.2px] px-4 py-[7px] text-xs font-black" style={{ borderColor: "var(--ca-primary)", color: "var(--ca-primary)" }}>
                  Apply
                </button>
              </div>
            ))}
          </>
        )}

        <div className="mt-[22px] flex items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(245,74,0,0.12)" }}>
            <Icon name="info" outlined size={18} color="var(--ca-primary)" />
          </span>
          <span>
            <span className="block text-[13px] font-black text-[#0F172A]">How it works?</span>
            <span className="block text-[11px] leading-[1.3] text-[#64748B]">
              Choose a code, apply it at checkout and the discount will be applied to your order.
            </span>
          </span>
        </div>
      </div>
    </BottomSheet>
  )
}
