import { toast } from "sonner"
import { Camera } from "lucide-react"

/** Shortest side below this reads as blurry on a listing card. */
const MIN_SIDE_PX = 500

/**
 * Upload guidance shown next to food / add-on photo pickers. Customers order
 * from these photos, so a blurry or cluttered one costs orders.
 */
export default function PhotoGuidelines({ className = "" }) {
  return (
    <div className={`rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 ${className}`}>
      <p className="flex items-center gap-1.5 font-semibold">
        <Camera className="h-3.5 w-3.5" />
        Photo tips — customers order from this picture
      </p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-amber-800">
        <li>Use a <strong>clear, sharp</strong> photo — no blur or shake.</li>
        <li>Shoot in <strong>good light</strong>; the dish should fill most of the frame.</li>
        <li>Show the <strong>actual item</strong> — no text, logos, watermarks or collages.</li>
        <li>At least {MIN_SIDE_PX}×{MIN_SIDE_PX} px, JPG/PNG/WebP, up to 5 MB.</li>
      </ul>
    </div>
  )
}

/**
 * Warns (never blocks) when a picked image is too small to look sharp.
 * Blur itself can't be detected reliably in the browser, but low resolution
 * is the most common cause of it.
 */
export function warnIfLowQualityImage(file) {
  if (!file || !String(file.type || "").startsWith("image/")) return
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    const shortest = Math.min(img.naturalWidth, img.naturalHeight)
    URL.revokeObjectURL(url)
    if (shortest > 0 && shortest < MIN_SIDE_PX) {
      toast.warning(
        `"${file.name}" is only ${img.naturalWidth}×${img.naturalHeight}px and may look blurry. ` +
          `Please use a clearer photo (at least ${MIN_SIDE_PX}×${MIN_SIDE_PX}px).`,
        { duration: 6000 },
      )
    }
  }
  img.onerror = () => URL.revokeObjectURL(url)
  img.src = url
}
