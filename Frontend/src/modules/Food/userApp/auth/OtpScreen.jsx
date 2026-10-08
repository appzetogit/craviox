import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import apiClient, { authAPI } from "@food/api"
import { setAuthData as setUserAuthData } from "@food/utils/auth"
import { registerWebPushForCurrentModule, resolveDeviceFcmToken } from "@food/utils/firebaseMessaging"
import Icon from "../ui/Icon"
import AuthLayout, { safeRedirect } from "./AuthLayout"

const NAME_RE = /^[A-Za-z ]+$/

/**
 * 4-digit code, then a name for new customers (otp_screen.dart and
 * profile_setup_screen.dart). Same verify call and session handling as before.
 */
export default function OtpScreen() {
  const navigate = useNavigate()
  const [auth, setAuth] = useState(null)
  const [digits, setDigits] = useState(["", "", "", ""])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [timer, setTimer] = useState(60)
  const [verified, setVerified] = useState(null)
  const [name, setName] = useState("")
  const inputs = useRef([])
  const busy = useRef(false)

  useEffect(() => {
    if (localStorage.getItem("user_authenticated") === "true") {
      navigate("/home", { replace: true })
      return
    }
    try {
      const data = JSON.parse(sessionStorage.getItem("userAuthData") || "null")
      if (!data) throw new Error("missing")
      setAuth(data)
    } catch {
      navigate("/food/user/auth/login", { replace: true })
    }
  }, [navigate])

  useEffect(() => {
    if (timer <= 0) return undefined
    const t = setTimeout(() => setTimer((v) => v - 1), 1000)
    return () => clearTimeout(t)
  }, [timer])

  useEffect(() => {
    if (auth && !verified) inputs.current[0]?.focus()
  }, [auth, verified])

  const finish = async (data, user) => {
    sessionStorage.removeItem("userAuthData")
    setUserAuthData("user", data.accessToken, user, data.refreshToken)
    window.dispatchEvent(new Event("userAuthChanged"))
    await registerWebPushForCurrentModule("/food/user", { force: true }).catch(() => {})
    navigate(safeRedirect(auth?.redirectTo), { replace: true })
  }

  const verify = async (code) => {
    if (busy.current || code.length !== 4) return
    busy.current = true
    setLoading(true)
    setError("")
    try {
      let fcmToken = null
      let platform = "web"
      try {
        const r = await resolveDeviceFcmToken("user", { allowPrompt: true })
        fcmToken = r?.token || null
        platform = r?.platform || "web"
      } catch {
        // Notifications are optional for signing in.
      }
      const res = await authAPI.verifyOTP(
        auth.phone,
        code,
        auth.isSignUp ? "register" : "login",
        auth.isSignUp ? auth.name || null : null,
        null,
        "user",
        null,
        auth.referralCode || null,
        fcmToken,
        platform,
      )
      const data = res?.data?.data || res?.data || {}
      if (!data.accessToken || !data.user || !data.refreshToken) throw new Error("Invalid response from server")
      const hasName = data.user.name && String(data.user.name).trim() && String(data.user.name).toLowerCase() !== "null"
      if (data.isNewUser === true || !hasName) {
        setVerified(data)
        return
      }
      await finish(data, data.user)
    } catch (err) {
      setError(err?.response?.status === 401 ? "Invalid or expired code." : err?.response?.data?.message || err?.message || "Verification failed.")
      setDigits(["", "", "", ""])
      inputs.current[0]?.focus()
    } finally {
      setLoading(false)
      busy.current = false
    }
  }

  const setDigit = (i, v) => {
    const clean = v.replace(/\D/g, "")
    if (clean.length > 1) {
      // Pasted or autofilled code.
      const next = clean.slice(0, 4).split("")
      while (next.length < 4) next.push("")
      setDigits(next)
      inputs.current[Math.min(clean.length, 4) - 1]?.focus()
      if (clean.length >= 4) verify(clean.slice(0, 4))
      return
    }
    const next = [...digits]
    next[i] = clean
    setDigits(next)
    setError("")
    if (clean && i < 3) inputs.current[i + 1]?.focus()
    if (next.every(Boolean)) verify(next.join(""))
  }

  const resend = async () => {
    if (timer > 0 || loading) return
    setLoading(true)
    setError("")
    try {
      await authAPI.sendOTP(auth.phone, auth.isSignUp ? "register" : "login", null)
      setTimer(60)
      setDigits(["", "", "", ""])
    } catch {
      setError("Failed to resend OTP.")
    } finally {
      setLoading(false)
    }
  }

  const saveName = async (e) => {
    e.preventDefault()
    const clean = name.replace(/\s+/g, " ").trim()
    if (clean.length < 2) return setError("Please enter your name")
    if (!NAME_RE.test(clean)) return setError("Name can contain only letters and spaces")
    setLoading(true)
    setError("")
    try {
      await apiClient
        .patch("/food/user/profile", { name: clean }, { headers: { Authorization: `Bearer ${verified.accessToken}` } })
        .catch(() => {})
      await finish(verified, { ...verified.user, name: clean })
    } catch {
      setError("Failed to complete sign-up. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (!auth) return null
  const shown = String(auth.phone || "").replace(/^\+91\s*/, "+91 ")

  if (verified) {
    return (
      <AuthLayout>
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "var(--ca-primary-tint)" }}>
          <Icon name="person" size={28} color="var(--ca-primary)" />
        </span>
        <h2 className="mt-5 text-[26px] font-extrabold tracking-[-0.4px] text-[#0F172A]">What should we call you?</h2>
        <p className="mt-1.5 text-sm text-[#64748B]">Your name appears on your orders and receipts.</p>
        <form onSubmit={saveName} className="mt-7">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value.slice(0, 50))
              setError("")
            }}
            autoFocus
            placeholder="Your full name"
            aria-label="Your full name"
            className="h-[58px] w-full rounded-[29px] border-[1.5px] border-[#E2E8F0] bg-white px-6 text-base font-semibold text-[#0F172A] outline-none focus:border-[var(--ca-primary)]"
          />
          {error && <p className="mt-2 pl-4 text-[13px] font-semibold text-[#E11D48]">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-5 flex h-[52px] w-full items-center justify-center rounded-[26px] text-base font-bold text-white disabled:opacity-60"
            style={{ background: "var(--ca-primary)", boxShadow: "0 8px 20px rgba(245,74,0,0.3)" }}
          >
            {loading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/50 border-t-white" /> : "Get started"}
          </button>
        </form>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <button type="button" onClick={() => navigate("/food/user/auth/login")} className="mb-5 flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "rgba(245,74,0,0.12)" }} aria-label="Back">
        <Icon name="arrow_back" size={20} color="var(--ca-primary)" />
      </button>
      <h2 className="text-[26px] font-extrabold tracking-[-0.4px] text-[#0F172A]">Verify your number</h2>
      <p className="mt-1.5 text-sm text-[#64748B]">
        Enter the 4-digit code sent to <b className="text-[#0F172A]">{shown}</b>
      </p>
      <div className="mt-7 flex justify-between gap-3">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => (inputs.current[i] = el)}
            value={d}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={i === 0 ? 4 : 1}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus()
            }}
            aria-label={`Digit ${i + 1}`}
            className="h-16 w-full rounded-2xl border-[1.5px] bg-white text-center text-2xl font-extrabold text-[#0F172A] outline-none transition-colors focus:border-[var(--ca-primary)]"
            style={{ borderColor: error ? "#FF6464" : d ? "var(--ca-primary)" : "#E2E8F0", boxShadow: "0 4px 14px rgba(15,23,42,0.05)" }}
          />
        ))}
      </div>
      {error && <p className="mt-3 text-[13px] font-semibold text-[#E11D48]">{error}</p>}
      <button
        type="button"
        onClick={() => verify(digits.join(""))}
        disabled={loading || digits.join("").length !== 4}
        className="mt-6 flex h-[52px] w-full items-center justify-center rounded-[26px] text-base font-bold text-white disabled:opacity-50"
        style={{ background: "var(--ca-primary)", boxShadow: "0 8px 20px rgba(245,74,0,0.3)" }}
      >
        {loading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/50 border-t-white" /> : "Verify"}
      </button>
      <p className="mt-5 text-center text-sm text-[#64748B]">
        Didn&apos;t get the code?{" "}
        {timer > 0 ? (
          <span>Resend in <b className="text-[#0F172A]">{timer}s</b></span>
        ) : (
          <button type="button" onClick={resend} className="font-bold" style={{ color: "var(--ca-primary)" }}>
            Resend code
          </button>
        )}
      </p>
    </AuthLayout>
  )
}
