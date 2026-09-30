import { useEffect, useRef, useState } from "react"

/** True once the element has come within `margin` of the viewport (stays true). */
export function useInView(margin = "200px") {
  const ref = useRef(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return undefined
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true)
      return undefined
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          io.disconnect()
        }
      },
      { rootMargin: margin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [margin, seen])
  return [ref, seen]
}

/**
 * Index that advances every `interval` ms through `count` items; pauses while
 * the tab is hidden or `paused` is set. For the app's rotating tickers.
 */
export function useRotatingIndex(count, interval, paused = false) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (index >= count) setIndex(0)
  }, [count, index])
  useEffect(() => {
    if (count <= 1 || paused) return undefined
    const id = setInterval(() => {
      if (document.hidden) return
      setIndex((i) => (i + 1) % count)
    }, interval)
    return () => clearInterval(id)
  }, [count, interval, paused])
  return [count ? index % count : 0, setIndex]
}
