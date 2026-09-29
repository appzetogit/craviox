import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { adminAPI, uploadAPI } from "@food/api"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@food/components/ui/dialog"
import AddonDishPicker from "./AddonDishPicker"
import PhotoGuidelines, { warnIfLowQualityImage } from "@food/components/restaurant/PhotoGuidelines"

const EMPTY = { restaurantId: "", name: "", price: "", foodType: "veg", description: "", foodIds: [] }

/** Admin creates an add-on for a restaurant, optionally limited to some dishes. Goes live at once. */
export default function AddonCreateDialog({ open, onOpenChange, onCreated }) {
  const [restaurants, setRestaurants] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [imageFile, setImageFile] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(EMPTY)
    setImageFile(null)
    adminAPI
      .getRestaurants({ limit: 500, page: 1 })
      .then((res) => {
        const payload = res?.data?.data ?? res?.data ?? {}
        const rows = payload.items || payload.data || payload.restaurants || payload.docs || (Array.isArray(payload) ? payload : [])
        setRestaurants(
          (Array.isArray(rows) ? rows : [])
            .map((r) => ({ id: String(r.id || r._id), name: r.restaurantName || r.name || "Restaurant" }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        )
      })
      .catch(() => setRestaurants([]))
  }, [open])

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }))

  const handleCreate = async () => {
    if (!form.restaurantId) return toast.error("Choose a restaurant")
    if (!form.name.trim()) return toast.error("Name is required")
    const price = Number(form.price)
    if (form.price === "" || !Number.isFinite(price) || price < 0) return toast.error("Enter a valid price")

    try {
      setSaving(true)
      let image = ""
      if (imageFile) {
        const uploadRes = await uploadAPI.uploadMedia(imageFile, { folder: "craviox/admin/addons" })
        image = uploadRes?.data?.data?.url || uploadRes?.data?.url || ""
      }
      const res = await adminAPI.createRestaurantAddon({
        restaurantId: form.restaurantId,
        name: form.name.trim(),
        price,
        foodType: form.foodType,
        description: form.description.trim(),
        image,
        images: image ? [image] : [],
        foodIds: form.foodIds,
      })
      toast.success("Add-on created and live")
      onCreated?.(res?.data?.data?.addon)
      onOpenChange(false)
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to create add-on")
    } finally {
      setSaving(false)
    }
  }

  const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add add-on</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Restaurant</label>
            <select
              value={form.restaurantId}
              onChange={(e) => set({ restaurantId: e.target.value, foodIds: [] })}
              className={inputClass}
            >
              <option value="">Select a restaurant</option>
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
              <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Extra cheese" className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Price (₹)</label>
              <input type="number" min="0" value={form.price} onChange={(e) => set({ price: e.target.value })} placeholder="30" className={inputClass} />
            </div>
          </div>
          <div className="flex gap-2">
            {[
              ["veg", "Veg"],
              ["non-veg", "Non-veg"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => set({ foodType: value })}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                  form.foodType === value ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-300 text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Description (optional)</label>
            <textarea rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Image (optional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] || null
                setImageFile(file)
                warnIfLowQualityImage(file)
              }}
              className="text-sm"
            />
            <PhotoGuidelines className="mt-2" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Dishes it applies to</label>
            <AddonDishPicker restaurantId={form.restaurantId} value={form.foodIds} onChange={(foodIds) => set({ foodIds })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
