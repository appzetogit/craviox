import "../theme.css"
import { useLocation } from "react-router-dom"
import { useCart } from "@food/context/CartContext"
import useActiveOrderTracking from "@food/hooks/useActiveOrderTracking"
import { isModuleAuthenticated } from "@food/utils/auth"
import BottomNav from "./BottomNav"
import FloatingViewCartBar from "./FloatingViewCartBar"
import FloatingActiveOrderCard from "./FloatingActiveOrderCard"
import { tabForPath } from "./tabs"

/**
 * Frame for the app-style customer screens (main_app_shell.dart): a
 * phone-width column (centred on wide screens), the 5-tab bottom bar, and on
 * Home the floating cart bar and live-order card.
 */
export default function AppShell({ children, showCartBar = false }) {
  const { pathname } = useLocation()
  const tab = tabForPath(pathname)
  const { itemCount } = useCart()
  const cartBarVisible = showCartBar && itemCount > 0

  return (
    // Heights inline: global.css redefines .min-h-screen as 100%.
    <div className="bg-[#E9EDF2] dark:bg-black" style={{ minHeight: "100dvh" }}>
      <div
        className="ca-app relative mx-auto w-full max-w-[480px]"
        style={{ minHeight: "100dvh", paddingBottom: tab ? "calc(84px + env(safe-area-inset-bottom, 0px))" : undefined }}
      >
        {children}
        {cartBarVisible && <FloatingViewCartBar bottom={16} />}
        {/* Orders are fetched only for a signed-in customer. */}
        {isModuleAuthenticated("user") ? (
          <OrderAwareChrome tab={tab} cartBarVisible={cartBarVisible} />
        ) : (
          tab && <BottomNav active={tab} />
        )}
      </div>
    </div>
  )
}

function OrderAwareChrome({ tab, cartBarVisible }) {
  const { activeOrder, timeRemaining } = useActiveOrderTracking()
  // Same stacking as the app: the order card rides above the cart bar.
  const orderBottom = cartBarVisible ? 16 + 56 + 12 : 16
  return (
    <>
      {tab === "home" && activeOrder && (
        <FloatingActiveOrderCard
          order={activeOrder}
          timeRemaining={timeRemaining}
          compact={cartBarVisible}
          bottom={orderBottom}
        />
      )}
      {tab && <BottomNav active={tab} hasActiveOrder={!!activeOrder} />}
    </>
  )
}
