import { useEffect, useMemo, useState } from "react"
import BottomSheet from "../ui/BottomSheet"
import Icon from "../ui/Icon"
import { SORTS } from "../data/homeFilter"

function SheetHeader({ title, onClose, action }) {
  return (
    <div className="flex items-center justify-between px-5 pt-2.5">
      <h2 className="text-lg font-extrabold" style={{ color: "var(--ca-title)" }}>
        {title}
      </h2>
      <div className="flex items-center gap-2">
        {action}
        <button type="button" aria-label="Close" onClick={onClose} className="flex p-1">
          <Icon name="close" size={24} color="var(--ca-title)" />
        </button>
      </div>
    </div>
  )
}

function ChoiceChip({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[20px] px-3 py-[7px] text-[12.5px] transition-colors"
      style={{
        fontWeight: selected ? 700 : 500,
        color: selected ? "#fff" : "var(--ca-title)",
        background: selected ? "var(--ca-primary)" : "var(--ca-surface)",
        border: `1px solid ${selected ? "var(--ca-primary)" : "#E2E8F0"}`,
      }}
    >
      {children}
    </button>
  )
}

const Section = ({ title, children }) => (
  <div className="mb-5">
    <h3 className="mb-2.5 text-sm font-bold" style={{ color: "var(--ca-title)" }}>
      {title}
    </h3>
    {children}
  </div>
)

/** "Sort & Filter" sheet (filter_bottom_sheet.dart). `count(draft)` previews the result size. */
export function FilterSheet({ open, onClose, initial, initialVeg, count, onApply, onReset }) {
  const [draft, setDraft] = useState(initial)
  const [veg, setVeg] = useState(initialVeg)
  // Re-seed each time the sheet opens.
  useEffect(() => {
    if (!open) return
    setDraft(initial)
    setVeg(initialVeg)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const n = useMemo(() => (open ? count(draft, veg) : 0), [open, count, draft, veg])

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="82vh">
      <SheetHeader
        title="Sort & Filter"
        onClose={onClose}
        action={
          <button
            type="button"
            className="text-[13px] font-bold"
            style={{ color: "var(--ca-primary)" }}
            onClick={() => {
              setDraft({ maxPrice: null, minRating: null, sortBy: "relevance", scheduledAt: null })
              setVeg(false)
              onReset()
            }}
          >
            Clear All
          </button>
        }
      />
      <div className="ca-noscroll flex-1 overflow-y-auto px-5 pt-3">
        <Section title="Sort By">
          <div className="flex flex-wrap gap-2">
            {SORTS.map((s) => (
              <ChoiceChip key={s.key} selected={draft.sortBy === s.key} onClick={() => setDraft({ ...draft, sortBy: s.key })}>
                {s.label}
              </ChoiceChip>
            ))}
          </div>
        </Section>
        <Section title="Dietary Preference">
          <button
            type="button"
            onClick={() => setVeg(!veg)}
            className="flex w-full items-center rounded-[14px] border px-3.5 py-2"
            style={{ background: "var(--ca-surface)", borderColor: "#E2E8F0" }}
          >
            <span className="flex rounded-md bg-green-600/15 p-1">
              <Icon name="eco" size={18} color="#16A34A" />
            </span>
            <span className="ml-2.5 flex-1 text-left text-sm font-semibold" style={{ color: "var(--ca-title)" }}>
              Pure Veg Only
            </span>
            <span
              className="flex h-6 w-11 rounded-full p-0.5 transition-colors"
              style={{ background: veg ? "#16A34A" : "#CBD5E1", justifyContent: veg ? "flex-end" : "flex-start" }}
            >
              <span className="h-5 w-5 rounded-full bg-white shadow" />
            </span>
          </button>
        </Section>
        <Section title="Price Per Person">
          <div className="flex flex-wrap gap-2">
            {[
              ["Under ₹150", 150],
              ["Under ₹250", 250],
              ["Under ₹500", 500],
              ["Any Price", null],
            ].map(([label, v]) => (
              <ChoiceChip key={label} selected={draft.maxPrice === v} onClick={() => setDraft({ ...draft, maxPrice: v })}>
                {label}
              </ChoiceChip>
            ))}
          </div>
        </Section>
        <Section title="Minimum Rating">
          <div className="flex flex-wrap gap-2">
            {[4.5, 4, 3.5].map((v) => (
              <ChoiceChip
                key={v}
                selected={draft.minRating === v}
                onClick={() => setDraft({ ...draft, minRating: draft.minRating === v ? null : v })}
              >
                {v.toFixed(1)}+ ★
              </ChoiceChip>
            ))}
          </div>
        </Section>
      </div>
      <div className="px-5 pb-4 pt-3.5">
        <button
          type="button"
          onClick={() => onApply(draft, veg)}
          className="h-12 w-full rounded-[14px] text-[15px] font-bold text-white"
          style={{ background: "var(--ca-primary)" }}
        >
          {n > 0 ? `Apply Filters (${n})` : "Apply Filters"}
        </button>
      </div>
    </BottomSheet>
  )
}

const pad = (n) => String(n).padStart(2, "0")
const MIN_LEAD_MS = 30 * 60 * 1000
const MAX_DAYS = 6

/**
 * Pick a delivery slot (schedule_slot_picker.dart): today up to 6 days ahead,
 * at least 30 minutes from now. The cart reads the slot as its schedule.
 */
export function ScheduleSheet({ open, onClose, onPick }) {
  const days = useMemo(() => {
    const out = []
    const base = new Date()
    base.setHours(0, 0, 0, 0)
    for (let i = 0; i <= MAX_DAYS; i++) {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      out.push(d)
    }
    return out
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const earliest = new Date(Date.now() + MIN_LEAD_MS)
  const [day, setDay] = useState(0)
  const [time, setTime] = useState(`${pad(earliest.getHours())}:${pad(earliest.getMinutes())}`)
  const [error, setError] = useState("")

  const confirm = () => {
    const [h, m] = time.split(":").map(Number)
    const slot = new Date(days[day])
    slot.setHours(h || 0, m || 0, 0, 0)
    if (slot.getTime() < Date.now() + MIN_LEAD_MS - 60000) {
      setError("Pick a time at least 30 minutes from now.")
      return
    }
    setError("")
    onPick(slot.toISOString())
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <SheetHeader title="Schedule delivery" onClose={onClose} />
      <div className="px-5 pb-5 pt-3">
        <div className="ca-noscroll -mx-5 flex gap-2 overflow-x-auto px-5">
          {days.map((d, i) => (
            <ChoiceChip key={d.toISOString()} selected={day === i} onClick={() => setDay(i)}>
              {i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
            </ChoiceChip>
          ))}
        </div>
        <label className="mt-4 block text-sm font-bold" style={{ color: "var(--ca-title)" }}>
          Delivery time
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-2 block h-12 w-full rounded-[18px] border border-[#E9ECEF] bg-white px-4 text-base font-semibold text-[#0F172A] outline-none focus:border-[1.5px] focus:border-[var(--ca-primary)] dark:border-[#303030] dark:bg-[#1B1B1B] dark:text-white"
          />
        </label>
        {error && <p className="mt-2 text-[13px] font-semibold text-[#FF6464]">{error}</p>}
        <button
          type="button"
          onClick={confirm}
          className="mt-5 h-12 w-full rounded-[14px] text-[15px] font-bold text-white"
          style={{ background: "var(--ca-primary)" }}
        >
          Schedule
        </button>
      </div>
    </BottomSheet>
  )
}

/** "All Food Categories" grid. */
export function AllCategoriesSheet({ open, onClose, categories, onPick }) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <SheetHeader title="All Food Categories" onClose={onClose} />
      <div className="ca-noscroll grid grid-cols-4 gap-x-3 gap-y-4 overflow-y-auto px-5 pb-6 pt-4">
        {categories.map((c) => (
          <button key={c.id} type="button" onClick={() => onPick(c)} className="flex flex-col items-center">
            <span
              className="h-[54px] w-[54px] overflow-hidden rounded-full bg-white p-0.5"
              style={{ border: "1.2px solid #F1F5F9", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}
            >
              {c.imageUrl ? (
                <img src={c.imageUrl} alt="" loading="lazy" className="h-full w-full rounded-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center rounded-full bg-[#F1F5F9]">
                  <Icon name="restaurant" size={20} color="#94A3B8" />
                </span>
              )}
            </span>
            <span className="mt-1.5 line-clamp-2 text-center text-[11px] font-semibold text-[#334155] dark:text-white">{c.name}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}
