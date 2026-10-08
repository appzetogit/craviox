import { Link } from "react-router-dom"
import Icon from "../ui/Icon"
import PromotedTag from "../ui/PromotedTag"
import { CONTENT, DesktopPage } from "../shell/DesktopChrome"
import FloatingViewCartBar from "../shell/FloatingViewCartBar"
import { useFavoriteToggle } from "../home/RestaurantCard"
import { BestsellerCard, DishCard, VegMark } from "./DishParts"

const rupees = (n) => `₹${Math.round(Number(n) || 0)}`

function InfoChip({ icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
      <Icon name={icon} outlined size={22} color="var(--ca-primary)" />
      <div>
        <p className="text-[15px] font-extrabold text-[#0F172A]">{title}</p>
        <p className="text-xs font-medium text-[#64748B]">{subtitle}</p>
      </div>
    </div>
  )
}

/**
 * The restaurant page on a computer: header across the top, a sticky menu
 * index on the left and the dishes in two columns. Same data and actions as
 * the phone layout (RestaurantScreen passes them in).
 */
export default function DesktopRestaurant({
  r,
  raw,
  distanceLabel,
  isOpen,
  offers,
  query,
  setQuery,
  diet,
  setDiet,
  groups,
  shown,
  category,
  setCategory,
  bestsellers,
  dishes,
  qtyByDish,
  onOpen,
  onAdd,
  onRemove,
  jumpTo,
  sectionId,
}) {
  const [fav, toggleFav] = useFavoriteToggle(r)
  const cover = r.coverImages[0] || r.imageUrl
  const freeDelivery = raw?.isFreeDelivery === true || raw?.freeDelivery === true

  return (
    <DesktopPage>
      <div className={`${CONTENT} pb-24 pt-6`}>
        <nav className="mb-4 flex items-center gap-1.5 text-[13px] font-medium text-[#64748B]">
          <Link to="/home" className="hover:text-[var(--ca-primary)]">Home</Link>
          <Icon name="chevron_right" size={16} />
          {r.area && (
            <>
              <span>{r.area}</span>
              <Icon name="chevron_right" size={16} />
            </>
          )}
          <span className="font-semibold text-[#0F172A]">{r.name}</span>
        </nav>

        <section className="flex gap-8 rounded-3xl border border-[#E2E8F0] bg-white p-6" style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.06)" }}>
          <div className="relative h-[230px] w-[380px] shrink-0 overflow-hidden rounded-2xl bg-[#E2E8F0]">
            {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
            {!isOpen && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                <span className="rounded-full bg-black/70 px-4 py-2 text-sm font-extrabold tracking-wide text-white">CURRENTLY CLOSED</span>
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <h1 className="truncate text-[32px] font-black tracking-[-0.6px] text-[var(--ca-ink)]">{r.name}</h1>
                  {r.isPromoted && <PromotedTag fontSize={11} />}
                  {r.isPureVeg && (
                    <span className="flex items-center gap-1 rounded-md bg-[#F0FDF4] px-2 py-1 text-xs font-bold text-[#15803D]">
                      <VegMark veg size={12} />
                      Pure Veg
                    </span>
                  )}
                </div>
                {r.tags.length > 0 && <p className="mt-1 text-[15px] font-medium text-[#64748B]">{r.tags.join(", ")}</p>}
                {(r.area || raw?.city) && (
                  <p className="mt-1 flex items-center gap-1 text-sm font-medium text-[#64748B]">
                    <Icon name="location_on" outlined size={16} />
                    {[r.area, raw?.city].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ")}
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label={fav ? "Remove from favourites" : "Add to favourites"}
                onClick={toggleFav}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] bg-white hover:bg-[#FFF1F2]"
              >
                <Icon name="favorite" outlined={!fav} size={22} color={fav ? "#EF4444" : "#64748B"} />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-4 gap-3">
              <InfoChip icon="star" title={r.rating > 0 ? r.rating.toFixed(1) : "New"} subtitle={r.reviewCount > 0 ? `${r.reviewCount} ratings` : "No ratings yet"} />
              <InfoChip icon="timer" title={r.deliveryTime || "—"} subtitle="Delivery time" />
              <InfoChip icon="location_on" title={distanceLabel || "—"} subtitle="Distance" />
              <InfoChip icon="payments" title={r.priceForOne > 0 ? rupees(r.priceForOne) : "—"} subtitle="For one" />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {r.offerBadges.map((o) => (
                <span key={o} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold" style={{ background: "var(--ca-primary-tint)", color: "var(--ca-primary)" }}>
                  <Icon name="local_offer" size={15} />
                  {o}
                </span>
              ))}
              {freeDelivery && (
                <span className="flex items-center gap-1.5 rounded-full bg-[#F0FDF4] px-3 py-1.5 text-[13px] font-bold text-[#15803D]">
                  <Icon name="two_wheeler" size={15} />
                  Free delivery
                </span>
              )}
            </div>
            {!isOpen && (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-[#FFFBEB] px-3 py-2 text-[13px] font-semibold text-[#92400E]">
                <Icon name="schedule" size={16} />
                This restaurant isn&apos;t taking orders right now. You can browse the menu.
              </p>
            )}
          </div>
        </section>

        {offers.length > 0 && (
          <div className="ca-noscroll mt-6 flex gap-3 overflow-x-auto">
            {offers.map((o) => (
              <div key={o.couponCode || o.code || o.title} className="flex min-w-[280px] items-center gap-3 rounded-2xl border px-4 py-3" style={{ background: "var(--ca-primary-tint)", borderColor: "var(--ca-primary-soft)" }}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(245,74,0,0.15)" }}>
                  <Icon name="percent" size={18} color="var(--ca-primary)" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-extrabold text-[#0F172A]">{o.headline || o.title}</span>
                  <span className="block truncate text-xs text-[#64748B]">
                    {[o.couponCode || o.code ? `Use ${o.couponCode || o.code}` : "", ...(o.conditions || [])].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 grid grid-cols-[230px_1fr] gap-10">
          <aside className="sticky top-[104px] self-start">
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-[#94A3B8]">Menu</h2>
            <ul className="space-y-1 border-l-2 border-[#F1F5F9]">
              {[["All", dishes]].concat(groups).map(([name, items]) => {
                const active = category === name
                return (
                  <li key={name}>
                    <button
                      type="button"
                      onClick={() => (name === "All" ? setCategory("All") : jumpTo(name))}
                      className="-ml-0.5 flex w-full items-center justify-between border-l-2 py-2 pl-4 pr-2 text-left text-[15px] transition-colors hover:text-[var(--ca-primary)]"
                      style={{ borderColor: active ? "var(--ca-primary)" : "transparent", color: active ? "var(--ca-primary)" : "#334155", fontWeight: active ? 800 : 600 }}
                    >
                      <span className="truncate">{name}</span>
                      <span className="text-xs font-bold text-[#94A3B8]">{items.length}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          <div className="min-w-0">
            <div className="sticky top-20 z-20 -mx-2 flex items-center gap-3 bg-white px-2 py-3">
              <label className="flex h-12 min-w-0 flex-1 items-center rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 focus-within:border-[var(--ca-primary)]">
                <Icon name="search" size={22} color="#64748B" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search dishes at ${r.name}`}
                  aria-label="Search in menu"
                  className="ml-3 min-w-0 flex-1 bg-transparent text-[15px] text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
                />
              </label>
              {[
                ["veg", "Veg", true],
                ["nonveg", "Non-Veg", false],
              ].map(([key, label, veg]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={diet === key}
                  onClick={() => setDiet(diet === key ? null : key)}
                  className="flex h-12 items-center gap-2 rounded-2xl border px-4 text-sm font-extrabold text-[#0F172A]"
                  style={{
                    background: diet === key ? (veg ? "#E8F5E9" : "#FFEBEE") : "#fff",
                    borderColor: diet === key ? (veg ? "#16A34A" : "#EF4444") : "#E2E8F0",
                  }}
                >
                  <VegMark veg={veg} />
                  {label}
                </button>
              ))}
            </div>

            {bestsellers.length > 0 && category === "All" && !query.trim() && (
              <div className="mt-4">
                <h2 className="mb-3 text-xl font-black text-[var(--ca-ink)]">Bestsellers</h2>
                <div className="ca-noscroll flex gap-3 overflow-x-auto pb-1">
                  {bestsellers.map((d) => (
                    <BestsellerCard key={d.id} dish={d} qty={qtyByDish.get(d.id) || 0} onOpen={onOpen} onAdd={onAdd} onRemove={onRemove} closed={!isOpen} />
                  ))}
                </div>
              </div>
            )}

            {!dishes.length ? (
              <div className="py-20 text-center">
                <Icon name="restaurant" size={48} color="#CBD5E1" />
                <p className="mt-3 text-lg font-extrabold text-[#0F172A]">This restaurant has no dishes yet</p>
              </div>
            ) : !shown.length ? (
              <div className="py-16 text-center">
                <Icon name="search_off" size={40} color="#94A3B8" />
                <p className="mt-2 text-sm font-semibold text-[#64748B]">
                  {query.trim() ? `No dishes match "${query.trim()}"` : "No dishes match your filter"}
                </p>
              </div>
            ) : (
              shown.map(([name, items]) => (
                <section key={name} id={sectionId(name)} className="mt-8 scroll-mt-40">
                  <div className="mb-4 flex items-baseline justify-between border-b border-[#F1F5F9] pb-2">
                    <h2 className="text-xl font-black text-[var(--ca-ink)]">{name}</h2>
                    <span className="text-sm font-bold text-[#94A3B8]">{items.length} {items.length === 1 ? "item" : "items"}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {items.map((d) => (
                      <DishCard key={d.id} dish={d} qty={qtyByDish.get(d.id) || 0} onOpen={onOpen} onAdd={onAdd} onRemove={onRemove} closed={!isOpen} />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </div>
      </div>
      <FloatingViewCartBar bottom={24} aboveNav={false} />
    </DesktopPage>
  )
}
