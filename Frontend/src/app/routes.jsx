import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Suspense, lazy, useEffect, useState } from 'react'
import { AppShellSkeleton } from '@food/components/ui/loading-skeletons'

const NATIVE_LAST_ROUTE_KEY = 'native_last_route'

// Lazy load the Food service module (Quick-spicy app)
const FoodApp = lazy(() => import('../modules/Food/routes'))
const AuthApp = lazy(() => import('../modules/auth/routes'))
import ProtectedRoute from '@food/components/ProtectedRoute'

const PageLoader = () => <AppShellSkeleton />

/**
 * FoodAppWrapper — Quick-spicy App. को /food prefix के साथ render करता है.
 * 
 * Quick-spicy की App.jsx में routes /restaurant, /usermain, /admin, /delivery
 * जैसे hain (bina /food prefix ke). Yahan hum useLocation se /food ke baad wala
 * path nikalne ke baad FoodApp render karte hain. FoodApp internally BrowserRouter
 * nahi use karta (sirf Routes use karta hai), isliye ye directly kaam karta hai.
 */
const FoodAppWrapper = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <FoodApp />
    </Suspense>
  )
}

const RedirectToFood = () => {
  const location = useLocation();
  // We safely replace the exact current pathname with a /food prefixed pathname
  // This effectively catches programmatic navigation to absolute paths like '/restaurant/login'
  // and turns them into '/food/restaurant/login'
  return <Navigate to={`/food${location.pathname}${location.search}`} replace />;
};

const AdminRouter = lazy(() => import('../modules/Food/components/admin/AdminRouter'))
const PublicCMSPage = lazy(() => import('./PublicCMSPage'))

const publicPage = (page, module) => (
  <Suspense fallback={<PageLoader />}>
    <PublicCMSPage page={page} module={module} />
  </Suspense>
)

const AppRoutes = () => {
  const location = useLocation()

  useEffect(() => {
    if (typeof window === 'undefined') return

    const protocol = String(window.location?.protocol || '').toLowerCase()
    const userAgent = String(window.navigator?.userAgent || '').toLowerCase()
    const isNativeLikeShell =
      Boolean(window.flutter_inappwebview) ||
      Boolean(window.ReactNativeWebView) ||
      protocol === 'file:' ||
      userAgent.includes(' wv') ||
      userAgent.includes('; wv')

    if (!isNativeLikeShell) return

    const route = `${location.pathname || ''}${location.search || ''}`
    if (route.startsWith('/food/') || route.startsWith('/admin')) {
      localStorage.setItem(NATIVE_LAST_ROUTE_KEY, route)
    }
  }, [location.pathname, location.search])

  return (
    <Routes>
      {/* The customer app's Home lives at /home (see Food/routes.jsx). */}
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/home/*" element={<FoodAppWrapper />} />

      {/* Public support + legal pages: no login, content managed in admin */}
      <Route path="/support" element={publicPage('support')} />
      <Route path="/privacy" element={publicPage('privacy')} />
      <Route path="/terms" element={publicPage('terms')} />
      {/* Exact paths outrank the /restaurant/* and /delivery/* redirects below */}
      <Route path="/restaurant/support" element={publicPage('support', 'RESTAURANT')} />
      <Route path="/restaurant/privacy" element={publicPage('privacy', 'RESTAURANT')} />
      <Route path="/restaurant/terms" element={publicPage('terms', 'RESTAURANT')} />
      <Route path="/delivery/support" element={publicPage('support', 'DELIVERY')} />
      <Route path="/delivery/privacy" element={publicPage('privacy', 'DELIVERY')} />
      <Route path="/delivery/terms" element={publicPage('terms', 'DELIVERY')} />

      {/* Auth Module */}


      {/* Food Module */}
      <Route path="/food/*" element={<FoodAppWrapper />} />

      {/* Global Admin Portal - AdminRouter handles its own protection for sub-routes */}
      <Route path="/admin/*" element={<AdminRouter />} />

      {/* NEW Delivery V2 (Parallel testing) */}
      {/* Global Admin Portal - wrap lazy router in Suspense to avoid blank/crash on direct admin URLs */}
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={<PageLoader />}>
            <AdminRouter />
          </Suspense>
        }
      />
      
      {/* Dynamic intercept redirects for bare paths (accessed programmatically) */}
      <Route path="/user/*" element={<RedirectToFood />} />
      <Route path="/restaurant/*" element={<RedirectToFood />} />
      <Route path="/delivery/*" element={<RedirectToFood />} />
      <Route path="/usermain/*" element={<RedirectToFood />} />
      <Route path="/profile/*" element={<RedirectToFood />} />
      <Route path="/cart/*" element={<Navigate to="/food/user/cart" replace />} />
      <Route path="/orders/*" element={<RedirectToFood />} />

      {/* Fallback 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default AppRoutes
