import "../theme.css"
import { Link } from "react-router-dom"
import Icon from "../ui/Icon"
import wordmark from "../assets/craviox-wordmark.png"

/** Where to go once signed in: the page that sent them here, else Home. */
export function safeRedirect(target) {
  const t = String(target || "")
  return t.startsWith("/") && !t.startsWith("//") && !t.includes("/auth/") ? t : "/home"
}

const PERKS = [
  ["two_wheeler", "Fast delivery", "Hot food from restaurants near you"],
  ["local_offer", "Real offers", "Coupons that apply at checkout"],
  ["verified_user", "Safe payments", "UPI, cards, wallet or cash"],
]

/**
 * Sign-in frame (login_screen.dart): the brand mark and tagline over a soft
 * background on phones; a brand panel beside the form on desktop.
 */
export default function AuthLayout({ children }) {
  return (
    <div className="ca-app min-h-[100dvh] lg:grid lg:grid-cols-[1.05fr_1fr]" style={{ background: "#FAFDFF" }}>
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-14" style={{ background: "var(--ca-primary)" }}>
        <span className="pointer-events-none absolute -left-28 -top-28 h-96 w-96 rounded-full border-[56px] border-white/10" />
        <span className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full border-[64px] border-white/10" />
        <Link to="/home" className="relative inline-flex w-fit rounded-2xl bg-white px-4 py-2.5">
          <img src={wordmark} alt="Craviox" className="h-9 w-auto" />
        </Link>
        <div className="relative max-w-[520px]">
          <h1 className="text-[46px] font-extrabold leading-[1.1] tracking-[-0.8px] text-white">Food you crave, delivered in minutes.</h1>
          <p className="mt-4 text-lg font-medium text-white/90">Sign in to order from the best restaurants around you.</p>
          <div className="mt-10 space-y-4">
            {PERKS.map(([icon, title, sub]) => (
              <div key={title} className="flex items-center gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                  <Icon name={icon} size={24} color="#fff" />
                </span>
                <span>
                  <span className="block text-base font-bold text-white">{title}</span>
                  <span className="block text-sm text-white/80">{sub}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-sm text-white/70">© {new Date().getFullYear()} Craviox</p>
      </aside>

      <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 py-10">
        {/* Soft brand circles, as on the app's login screen. */}
        <span className="pointer-events-none absolute -left-16 -top-16 h-[220px] w-[220px] rounded-full lg:hidden" style={{ background: "rgba(245,74,0,0.07)" }} />
        <span className="pointer-events-none absolute -bottom-20 -right-20 h-[260px] w-[260px] rounded-full lg:hidden" style={{ background: "rgba(245,74,0,0.06)" }} />
        <div className="relative w-full max-w-[400px]">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <img src={wordmark} alt="Craviox" className="h-[54px] w-auto" />
            <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#64748B]">
              <span className="h-px w-6" style={{ background: "var(--ca-primary)" }} />
              Food Delivered in <b style={{ color: "var(--ca-primary)" }}>Minutes</b>
              <span className="h-px w-6" style={{ background: "var(--ca-primary)" }} />
            </p>
          </div>
          {children}
          <div className="mt-10 flex flex-col items-center gap-2 text-center">
            <span className="flex items-center gap-1.5 rounded-full bg-[#F0FDF4] px-3 py-1.5 text-xs font-semibold text-[#15803D]">
              <Icon name="verified_user" size={14} />
              Your data is safe with us.
            </span>
            <p className="text-[11.5px] text-[#94A3B8]">
              By continuing you agree to our{" "}
              <Link to="/terms" className="font-semibold text-[#64748B] underline-offset-2 hover:underline">Terms</Link> and{" "}
              <Link to="/privacy" className="font-semibold text-[#64748B] underline-offset-2 hover:underline">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
