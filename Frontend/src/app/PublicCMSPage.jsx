import CMSPage from "@food/components/user/CMSPage"
import { API_ENDPOINTS } from "@food/api/config"

/**
 * Support and legal pages at the site root (/support, /privacy, /terms).
 *
 * Rendered outside FoodApp on purpose: the user app's wrapper runs signed-in
 * listeners that complain when nobody is logged in, and these pages must open
 * for anyone — app-store listings and payment gateways link to them.
 */
const PAGES = {
  support: { endpoint: API_ENDPOINTS.ADMIN.SUPPORT_PUBLIC, title: "Help & Support" },
  privacy: { endpoint: API_ENDPOINTS.ADMIN.PRIVACY_PUBLIC, title: "Privacy Policy" },
  terms: { endpoint: API_ENDPOINTS.ADMIN.TERMS_PUBLIC, title: "Terms & Conditions" },
}

export default function PublicCMSPage({ page }) {
  const { endpoint, title } = PAGES[page]
  return <CMSPage endpoint={endpoint} title={title} module="USER" homePath="/" />
}
