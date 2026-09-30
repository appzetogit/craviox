import "../theme.css"
import { Link } from "react-router-dom"
import Icon from "../ui/Icon"
import { TABS } from "./tabs"
import { clearHomeScrollState } from "@food/utils/homeScrollRestore"

/** The app's 5-tab bar: Home, Search, Orders, Offers, Account (custom_bottom_nav.dart). */
export default function BottomNav({ active, hasActiveOrder = false }) {
  return (
    <nav
      className="ca-app fixed bottom-0 left-1/2 z-50 w-full max-w-[480px] -translate-x-1/2 border-t border-[#E2E8F0] dark:border-[#303030]"
      style={{
        background: "var(--ca-surface)",
        boxShadow: "0 -4px 12px rgba(0,0,0,0.06)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="flex h-[84px]">
        {TABS.map((tab) => {
          const selected = tab.key === active
          const color = selected ? "var(--ca-primary)" : "var(--ca-muted)"
          return (
            <Link
              key={tab.key}
              to={tab.to}
              onClick={() => {
                if (tab.key === "home") clearHomeScrollState()
                if (selected) window.scrollTo({ top: 0, behavior: "smooth" })
              }}
              className="flex flex-1 flex-col items-center justify-center"
              aria-current={selected ? "page" : undefined}
            >
              <span className="relative">
                <Icon name={tab.icon} size={24} color={color} outlined={!selected && tab.key !== "search"} />
                {tab.key === "orders" && hasActiveOrder && (
                  <span
                    className="absolute -right-1.5 -top-1 min-w-4 rounded-lg px-1 text-center text-[9px] font-black leading-[1.25] text-white"
                    style={{ background: "#EF4444", border: "1.5px solid var(--ca-surface)" }}
                  >
                    1
                  </span>
                )}
              </span>
              <span className="mt-[3px] text-[11px]" style={{ color, fontWeight: selected ? 900 : 600 }}>
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
