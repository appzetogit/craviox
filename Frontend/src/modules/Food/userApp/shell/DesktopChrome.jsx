import "../theme.css"
import { useEffect } from "react"
import { Link } from "react-router-dom"
import { useCart } from "@food/context/CartContext"
import { useProfile } from "@food/context/ProfileContext"
import { isModuleAuthenticated } from "@food/utils/auth"
import Icon from "../ui/Icon"
import wordmark from "../assets/craviox-wordmark.png"

/** Content width for desktop pages. */
export const CONTENT = "mx-auto w-full max-w-[1200px] px-8"

function NavLink({ to, icon, children, badge }) {
  return (
    <Link to={to} className="flex items-center gap-2 text-[15px] font-semibold text-[var(--ca-ink)] transition-colors hover:text-[var(--ca-primary)]">
      <span className="relative flex">
        <Icon name={icon} outlined size={22} />
        {badge > 0 && (
          <span className="absolute -right-2 -top-1.5 min-w-[18px] rounded-full bg-[var(--ca-primary)] px-1 text-center text-[11px] font-bold leading-[18px] text-white">
            {badge}
          </span>
        )}
      </span>
      {children}
    </Link>
  )
}

export function TopBar() {
  const { itemCount } = useCart()
  const { userProfile } = useProfile()
  const authed = isModuleAuthenticated("user")
  const firstName = String(userProfile?.name || "").trim().split(/\s+/)[0]
  return (
    <header className="sticky top-0 z-40 border-b border-[#F1F5F9] bg-white/95 backdrop-blur">
      <div className={`${CONTENT} flex h-20 items-center gap-10`}>
        <Link to="/home" aria-label="Craviox home" className="mr-auto flex">
          <img src={wordmark} alt="Craviox" className="h-10 w-auto" />
        </Link>
        <NavLink to="/food/restaurant/welcome" icon="restaurant">Partner with us</NavLink>
        <NavLink to="/food/delivery/welcome" icon="two_wheeler">Ride with us</NavLink>
        <NavLink to="/food/user/offers" icon="local_offer">Offers</NavLink>
        <NavLink to="/food/user/help" icon="help">Help</NavLink>
        <NavLink to={authed ? "/food/user/profile" : "/food/user/auth/login"} icon="person">
          {authed ? firstName || "Account" : "Sign in"}
        </NavLink>
        <NavLink to="/food/user/cart" icon="shopping_bag" badge={itemCount}>Cart</NavLink>
      </div>
    </header>
  )
}

export function Footer() {
  const cols = [
    ["Company", [["About Craviox", "/food/user/profile/about"], ["Terms & Conditions", "/terms"], ["Privacy Policy", "/privacy"]]],
    ["Contact us", [["Help & Support", "/food/user/help"], ["Partner with us", "/food/restaurant/welcome"], ["Ride with us", "/food/delivery/welcome"]]],
    ["For you", [["Offers", "/food/user/offers"], ["Your orders", "/food/user/orders"]]],
  ]
  return (
    <footer className="mt-20 bg-[var(--ca-ink)] text-white">
      <div className={`${CONTENT} grid grid-cols-4 gap-10 py-14`}>
        <div>
          <span className="inline-flex rounded-xl bg-white px-3 py-2">
            <img src={wordmark} alt="Craviox" className="h-8 w-auto" />
          </span>
          <p className="mt-4 text-sm text-white/60">© {new Date().getFullYear()} Craviox. All rights reserved.</p>
        </div>
        {cols.map(([title, links]) => (
          <div key={title}>
            <h3 className="text-base font-bold">{title}</h3>
            <ul className="mt-4 space-y-3">
              {links.map(([label, to]) => (
                <li key={label}>
                  <Link to={to} className="text-[15px] text-white/70 hover:text-white">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  )
}

/**
 * Frame for desktop customer pages: the top bar, the page, the footer.
 * Phones get AppShell instead.
 */
export function DesktopPage({ children, footer = true }) {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  return (
    <div className="ca-app min-h-[100dvh] bg-white">
      <TopBar />
      <main>{children}</main>
      {footer && <Footer />}
    </div>
  )
}
