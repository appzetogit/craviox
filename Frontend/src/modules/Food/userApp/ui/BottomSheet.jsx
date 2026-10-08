import { useEffect } from "react"
import { createPortal } from "react-dom"

/**
 * Modal bottom sheet in the app's style: rounded top, drag handle, dimmed
 * backdrop. Sits inside the centred app column on wide screens.
 */
export default function BottomSheet({ open, onClose, children, maxHeight = "75vh" }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === "Escape" && onClose?.()
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="ca-app fixed inset-0 z-[100] flex justify-center" style={{ background: "transparent" }}>
      <div className="ca-fade-in absolute inset-0 bg-black/50" onClick={onClose} />
      {/* A bottom sheet on phones; a centred dialog on desktop. */}
      <div className="relative flex w-full max-w-[480px] flex-col justify-end pointer-events-none lg:max-w-[520px] lg:justify-center lg:py-10">
        <div
          role="dialog"
          aria-modal="true"
          className="ca-sheet pointer-events-auto flex flex-col overflow-hidden rounded-t-3xl lg:rounded-3xl lg:shadow-2xl"
          style={{
            maxHeight,
            background: "var(--ca-surface)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          <div className="flex justify-center pt-4 pb-1">
            <div className="h-1 w-[38px] rounded-sm bg-[#E2E8F0] dark:bg-white/25" />
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
