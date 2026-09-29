import { useEffect, useMemo, useState } from "react"
import { Loader2, Search } from "lucide-react"
import { adminAPI } from "@food/api"

/**
 * Which of a restaurant's dishes an add-on applies to. Nothing ticked means the
 * whole menu — the same meaning `foodIds: []` has on the server.
 */
export default function AddonDishPicker({ restaurantId, value = [], onChange }) {
  const [dishes, setDishes] = useState([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!restaurantId) {
      setDishes([])
      return
    }
    let cancelled = false
    setLoading(true)
    adminAPI
      .getRestaurantMenuById(restaurantId)
      .then((res) => {
        const sections = res?.data?.data?.menu?.sections || []
        const list = []
        for (const section of sections) {
          const items = [
            ...(section.items || []),
            ...(section.subsections || []).flatMap((sub) => sub.items || []),
          ]
          for (const item of items) {
            const id = String(item.id || item._id || "")
            if (id && !list.some((d) => d.id === id)) {
              list.push({ id, name: item.name || "Dish", price: item.price, section: section.name || "" })
            }
          }
        }
        if (!cancelled) setDishes(list)
      })
      .catch(() => {
        if (!cancelled) setDishes([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [restaurantId])

  const selected = useMemo(() => new Set((value || []).map(String)), [value])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? dishes.filter((d) => d.name.toLowerCase().includes(q)) : dishes
  }, [dishes, query])

  const toggle = (id) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange?.([...next])
  }

  if (!restaurantId) {
    return <p className="text-xs text-slate-500">Choose a restaurant first to pick its dishes.</p>
  }

  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <span className="text-xs font-medium text-slate-700">
          {selected.size === 0 ? "Applies to all dishes" : `Applies to ${selected.size} dish${selected.size > 1 ? "es" : ""}`}
        </span>
        {selected.size > 0 && (
          <button type="button" onClick={() => onChange?.([])} className="text-xs font-medium text-emerald-700 hover:underline">
            All dishes
          </button>
        )}
      </div>
      <div className="relative border-b border-slate-100">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search dishes"
          className="w-full py-2 pl-8 pr-3 text-sm outline-none"
        />
      </div>
      <div className="max-h-48 overflow-y-auto p-1">
        {loading ? (
          <div className="flex items-center justify-center py-4 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <p className="px-2 py-3 text-xs text-slate-500">{dishes.length ? "No dish matches." : "This restaurant has no dishes yet."}</p>
        ) : (
          visible.map((dish) => (
            <label key={dish.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50">
              <input type="checkbox" checked={selected.has(dish.id)} onChange={() => toggle(dish.id)} />
              <span className="flex-1 truncate text-sm text-slate-800">{dish.name}</span>
              <span className="text-xs text-slate-400">{dish.section}</span>
              {Number.isFinite(Number(dish.price)) && <span className="text-xs text-slate-500">₹{dish.price}</span>}
            </label>
          ))
        )}
      </div>
    </div>
  )
}
