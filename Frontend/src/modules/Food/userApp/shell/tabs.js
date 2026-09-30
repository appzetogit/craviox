/** The five bottom-bar tabs, in the app's order. */
export const TABS = [
  { key: "home", label: "Home", icon: "home", to: "/home" },
  { key: "search", label: "Search", icon: "search", to: "/food/user/search" },
  { key: "orders", label: "Orders", icon: "shopping_bag", to: "/food/user/orders" },
  { key: "offers", label: "Offers", icon: "local_offer", to: "/food/user/offers" },
  { key: "account", label: "Account", icon: "person", to: "/food/user/profile" },
]

/** Which tab a path belongs to, or null when the page has no bottom bar. */
export function tabForPath(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "")
  if (p === "/home" || p === "/food/user" || p === "/food" || p === "") return "home"
  if (p === "/food/user/search") return "search"
  if (p === "/food/user/orders") return "orders"
  if (p === "/food/user/offers") return "offers"
  if (p === "/food/user/profile") return "account"
  return null
}
