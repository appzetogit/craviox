import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { authAPI } from "@food/api"
import { isModuleAuthenticated } from "@food/utils/auth"
import Icon from "../ui/Icon"
import AuthLayout, { safeRedirect } from "./AuthLayout"

/** Phone sign-in (login_screen.dart); same OTP request as before. */
export default function LoginScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [phone, setPhone] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const busy = useRef(false)
  const redirectTo = safeRedirect(location.state?.from || params.get("from"))

  useEffect(() => {
    if (isModuleAuthenticated("user")) {
      navigate(redirectTo, { replace: true })
      return
    }
    try {
      const stored = JSON.parse(sessionStorage.getItem("userAuthData") || "null")
      const digits = String(stored?.phone || "").replace(/^\+91\s*/, "").replace(/\D/g, "").slice(0, 10)
      if (digits) setPhone(digits)
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const valid = /^[6-9]\d{9}$/.test(phone)

  const submit = async (e) => {
    e.preventDefault()
    if (!valid) {
      setError(phone.length === 10 ? "Enter a valid Indian mobile number" : "Phone number must be exactly 10 digits")
      return
    }
    if (busy.current) return
    busy.current = true
    setLoading(true)
    setError("")
    try {
      const fullPhone = `+91 ${phone}`
      await authAPI.sendOTP(fullPhone, "login", null)
      const ref = String(params.get("ref") || "").trim()
      sessionStorage.setItem(
        "userAuthData",
        JSON.stringify({ method: "phone", phone: fullPhone, email: null, name: null, referralCode: ref || null, isSignUp: false, module: "user", redirectTo }),
      )
      navigate("/food/user/auth/otp")
    } catch (err) {
      setError(err?.response?.data?.message || err?.response?.data?.error || "Failed to send OTP. Please try again.")
    } finally {
      setLoading(false)
      busy.current = false
    }
  }

  return (
    <AuthLayout>
      <h2 className="text-[26px] font-extrabold tracking-[-0.4px] text-[#0F172A]">Welcome!</h2>
      <p className="mt-1.5 text-sm text-[#64748B]">Log in or sign up with your mobile number.</p>
      <form onSubmit={submit} className="mt-7">
        <label
          className="flex h-[58px] items-center rounded-[29px] border-[1.5px] bg-white pl-2 pr-5 transition-colors focus-within:border-[var(--ca-primary)]"
          style={{ borderColor: error ? "#FF6464" : "#E2E8F0", boxShadow: "0 4px 14px rgba(15,23,42,0.05)" }}
        >
          <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full" style={{ background: "var(--ca-primary-tint)" }}>
            <Icon name="phone_iphone" size={20} color="var(--ca-primary)" />
          </span>
          <span className="ml-3 text-base font-bold text-[#0F172A]">+91</span>
          <span className="mx-3 h-6 w-px bg-[#E2E8F0]" />
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            autoFocus
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
              setError("")
            }}
            placeholder="Mobile number"
            aria-label="Mobile number"
            className="min-w-0 flex-1 bg-transparent text-base font-semibold tracking-[0.5px] text-[#0F172A] outline-none placeholder:font-medium placeholder:tracking-normal placeholder:text-[#94A3B8]"
          />
        </label>
        {error && <p className="mt-2 pl-4 text-[13px] font-semibold text-[#E11D48]">{error}</p>}
        <button
          type="submit"
          disabled={loading || phone.length !== 10}
          className="mt-5 flex h-[52px] w-full items-center justify-center gap-2 rounded-[26px] text-base font-bold text-white transition-opacity disabled:opacity-50"
          style={{ background: "var(--ca-primary)", boxShadow: "0 8px 20px rgba(245,74,0,0.3)" }}
        >
          {loading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/50 border-t-white" /> : "Continue"}
        </button>
      </form>
    </AuthLayout>
  )
}
