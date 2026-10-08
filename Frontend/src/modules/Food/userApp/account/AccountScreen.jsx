import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { orderAPI, userAPI } from "@food/api"
import { useProfile } from "@food/context/ProfileContext"
import { clearModuleAuth } from "@food/utils/auth"
import { logoutUserSession } from "@food/utils/moduleLogout"
import { resolveMediaUrl } from "../../../../shared/utils/mediaUrl.js"
import AppShell from "../shell/AppShell"
import { CONTENT, DesktopPage } from "../shell/DesktopChrome"
import Icon from "../ui/Icon"
import { useIsDesktop } from "../ui/hooks"

const rupees = (n) => `₹${Math.round(Number(n) || 0)}`

function Stat({ icon, color, value, label, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-1 flex-col items-center">
      <span className="flex items-center gap-1">
        <Icon name={icon} outlined size={16} color={color} />
        <span className="text-sm font-black text-[#0F172A]">{value}</span>
      </span>
      <span className="mt-0.5 text-[10px] text-[#64748B]">{label}</span>
    </button>
  )
}

function Row({ icon, label, badge, saved, onClick, last }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-[#F8FAFC]">
      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full" style={{ background: "var(--ca-primary-tint)" }}>
        <Icon name={icon} outlined size={18} color="var(--ca-primary)" />
      </span>
      <span className="flex-1 text-[13.5px] font-bold text-[#0F172A]">{label}</span>
      {badge && (
        <span
          className="rounded-lg px-2 py-[3px] text-[10.5px] font-extrabold"
          style={saved ? { background: "#DCFCE7", color: "#16A34A" } : { background: "var(--ca-primary-tint)", color: "var(--ca-primary)" }}
        >
          {badge}
        </span>
      )}
      <Icon name="chevron_right" size={18} color="#94A3B8" />
      {!last && <span className="sr-only" />}
    </button>
  )
}

function Section({ title, rows }) {
  return (
    <div>
      <h2 className="mb-3 text-[15px] font-black text-[#0F172A]">{title}</h2>
      <div className="divide-y divide-[#F1F5F9] overflow-hidden rounded-[20px] border border-[#E2E8F0] bg-white" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
        {rows.map((r) => (
          <Row key={r.label} {...r} />
        ))}
      </div>
    </div>
  )
}

function DeleteDialog({ open, onClose, onConfirm, busy }) {
  const [text, setText] = useState("")
  useEffect(() => {
    if (open) setText("")
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-6">
      <div className="w-full max-w-[400px] rounded-2xl bg-white p-6">
        <h3 className="text-lg font-extrabold text-[#0F172A]">Delete your account?</h3>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[#475569]">
          Your profile, addresses and saved details will be removed and you will be signed out everywhere. Past orders stay in our records for
          billing. You can sign up again later with the same number.
        </p>
        <label className="mt-4 block text-[13px] font-semibold text-[#0F172A]">
          Type DELETE to confirm
          <input
            value={text}
            onChange={(e) => setText(e.target.value.toUpperCase())}
            autoFocus
            placeholder="DELETE"
            className="mt-2 h-11 w-full rounded-xl border border-[#E2E8F0] px-3 font-bold tracking-wider outline-none focus:border-[#EF4444]"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold text-[#475569] hover:bg-[#F1F5F9]">
            Cancel
          </button>
          <button
            type="button"
            disabled={text !== "DELETE" || busy}
            onClick={onConfirm}
            className="rounded-xl bg-[#EF4444] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Account tab (profile_screen.dart). */
export default function AccountScreen() {
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()
  const { userProfile, addresses, favorites, dishFavorites } = useProfile()
  const [wallet, setWallet] = useState(null)
  const [rewards, setRewards] = useState(null)
  const [referralReward, setReferralReward] = useState(0)
  const [orderCount, setOrderCount] = useState(null)
  const [membership, setMembership] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [askDelete, setAskDelete] = useState(false)

  useEffect(() => {
    userAPI
      .getWallet()
      .then((res) => setWallet((res?.data?.data?.wallet || res?.data?.wallet || {}).balance ?? null))
      .catch(() => {})
    userAPI
      .getReferralDetails()
      .then((res) => {
        const s = res?.data?.data?.stats || {}
        setRewards(Number(s.totalReferralEarnings) || 0)
        setReferralReward(Number(s.rewardAmount) || 0)
      })
      .catch(() => {})
    orderAPI
      .getOrders({ page: 1, limit: 1 })
      .then((res) => setOrderCount(Number(res?.data?.data?.pagination?.total) || 0))
      .catch(() => {})
    userAPI
      .getMyMembership()
      .then((res) => setMembership(res?.data?.data || null))
      .catch(() => {})
  }, [])

  const name = String(userProfile?.name || "").trim() || "Guest"
  const avatar = userProfile?.profileImage ? resolveMediaUrl(userProfile.profileImage?.url || userProfile.profileImage) : ""
  const email = String(userProfile?.email || "").includes("@") ? userProfile.email : ""
  const favCount = (favorites?.length || 0) + (dishFavorites?.length || 0)
  const addrCount = addresses?.length || 0
  const isMember = Boolean(membership?.isMember)

  const logout = async () => {
    try {
      await logoutUserSession({ navigate })
      toast.success("Logged out successfully")
    } catch {
      clearModuleAuth("user")
      window.dispatchEvent(new Event("userAuthChanged"))
      navigate("/food/user/auth/login", { replace: true })
    }
  }

  const deleteAccount = async () => {
    setDeleting(true)
    try {
      await userAPI.deleteCurrentUserAccount()
      clearModuleAuth("user")
      for (const k of ["accessToken", "user_authenticated", "user_user", "user", "cart", "userVegMode", "food-under-250-filters"]) localStorage.removeItem(k)
      window.dispatchEvent(new Event("userAuthChanged"))
      toast.success("Your account has been deleted")
      navigate("/food/user/auth/login", { replace: true })
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not delete the account. Please try again.")
    } finally {
      setDeleting(false)
      setAskDelete(false)
    }
  }

  const userCard = (
    <div className="rounded-[20px] border border-[#E2E8F0] bg-white p-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
      <div className="flex items-center gap-3.5">
        <button type="button" onClick={() => navigate("/food/user/profile/edit")} className="relative shrink-0" aria-label="Edit profile">
          <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#E2E8F0]">
            {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : <Icon name="person" size={40} color="#64748B" />}
          </span>
          <span className="absolute -right-0.5 bottom-0 flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] border-white" style={{ background: "var(--ca-primary)" }}>
            <Icon name="photo_camera" size={12} color="#fff" />
          </span>
        </button>
        <div className="min-w-0">
          <p className="truncate text-base font-black text-[#0F172A]">{name}</p>
          {userProfile?.phone && <p className="text-[11.5px] font-medium text-[#64748B]">{userProfile.phone}</p>}
          {email && <p className="truncate text-[11.5px] font-medium text-[#64748B]">{email}</p>}
        </div>
      </div>
      <div className="my-3.5 h-px bg-[#E2E8F0]" />
      <div className="flex items-center">
        <Stat icon="shopping_bag" color="#16A34A" value={orderCount ?? "—"} label="Orders" onClick={() => navigate("/food/user/orders")} />
        <span className="h-7 w-px bg-[#E2E8F0]" />
        <Stat icon="favorite" color="#EF4444" value={favCount} label="Favourites" onClick={() => navigate("/food/user/profile/favorites")} />
        <span className="h-7 w-px bg-[#E2E8F0]" />
        <Stat icon="card_giftcard" color="#8B5CF6" value={rewards == null ? "—" : rupees(rewards)} label="Rewards" onClick={() => navigate("/food/user/profile/refer-earn")} />
        <span className="h-7 w-px bg-[#E2E8F0]" />
        <Stat icon="account_balance_wallet" color="#0284C7" value={wallet == null ? "—" : rupees(wallet)} label="Wallet" onClick={() => navigate("/food/user/wallet")} />
      </div>
    </div>
  )

  const goldCard = (
    <button
      type="button"
      onClick={() => navigate("/food/user/membership")}
      className="flex w-full items-center gap-3 rounded-[20px] border border-[#F59E0B] bg-[#FFFBEB] p-4 text-left"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FEF3C7]">
        <Icon name="workspace_premium" size={22} color="#CA8A04" />
      </span>
      <span className="flex-1">
        <span className="block text-[14px] font-black text-[#854D0E]">{isMember ? `${membership?.current?.planName || "Gold"} member` : "Join Craviox Gold"}</span>
        <span className="block text-[11.5px] text-[#A16207]">
          {isMember
            ? membership?.totalSavings
              ? `You've saved ${rupees(membership.totalSavings)} so far`
              : "Free delivery and extra savings on your orders"
            : "Free delivery and extra savings on every order"}
        </span>
      </span>
      <Icon name="chevron_right" size={20} color="#A16207" />
    </button>
  )

  const accountRows = [
    { icon: "person", label: "Personal Information", onClick: () => navigate("/food/user/profile/edit") },
    { icon: "location_on", label: "Addresses", badge: addrCount ? `${addrCount} Saved` : "", saved: true, onClick: () => navigate("/food/user/cart/address-selector", { state: { backTo: "/food/user/profile" } }) },
    { icon: "account_balance_wallet", label: "My Wallet", badge: wallet == null ? "" : rupees(wallet), onClick: () => navigate("/food/user/wallet") },
    { icon: "card_giftcard", label: "Refer & Earn", badge: referralReward > 0 ? `Earn ${rupees(referralReward)}` : "", onClick: () => navigate("/food/user/profile/refer-earn") },
    { icon: "notifications", label: "Notifications", onClick: () => navigate("/food/user/notifications") },
  ]
  const moreRows = [
    { icon: "local_offer", label: "Your Coupons", onClick: () => navigate("/food/user/profile/coupons") },
    { icon: "favorite", label: "Favourites", onClick: () => navigate("/food/user/profile/favorites") },
    { icon: "headset_mic", label: "Help & Support", onClick: () => navigate("/food/user/profile/support") },
    { icon: "info", label: "About Craviox", onClick: () => navigate("/food/user/profile/about") },
    { icon: "health_and_safety", label: "Report a safety emergency", onClick: () => navigate("/food/user/profile/report-safety-emergency") },
  ]

  const actions = (
    <div className="space-y-3">
      <button
        type="button"
        onClick={logout}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-black text-[#EF4444]"
        style={{ border: "1.2px solid rgba(239,68,68,0.4)" }}
      >
        <Icon name="logout" size={18} />
        Logout
      </button>
      <button type="button" onClick={() => setAskDelete(true)} className="mx-auto flex items-center gap-1.5 text-[13px] font-bold text-[#9CA3AF]">
        <Icon name="delete_forever" size={18} />
        Delete account
      </button>
    </div>
  )

  const dialog = <DeleteDialog open={askDelete} busy={deleting} onClose={() => setAskDelete(false)} onConfirm={deleteAccount} />

  if (isDesktop) {
    return (
      <DesktopPage>
        <div className={`${CONTENT} pb-20 pt-8`}>
          <h1 className="mb-6 text-[28px] font-black tracking-[-0.5px] text-[var(--ca-ink)]">My Account</h1>
          <div className="grid grid-cols-[380px_1fr] items-start gap-8">
            <div className="sticky top-24 space-y-4">
              {userCard}
              {goldCard}
              {actions}
            </div>
            <div className="grid grid-cols-2 items-start gap-6">
              <Section title="My Account" rows={accountRows} />
              <Section title="More" rows={moreRows} />
            </div>
          </div>
        </div>
        {dialog}
      </DesktopPage>
    )
  }

  return (
    <AppShell>
      <div className="min-h-[100dvh]" style={{ background: "var(--ca-bg)" }}>
        <header className="px-4 py-3 pt-[calc(12px+env(safe-area-inset-top,0px))] text-center">
          <h1 className="text-lg font-black tracking-[-0.3px] text-[#0F172A]">My Profile</h1>
        </header>
        <div className="space-y-5 px-4 pb-8">
          {userCard}
          {goldCard}
          <Section title="My Account" rows={accountRows} />
          <Section title="More" rows={moreRows} />
          {actions}
        </div>
      </div>
      {dialog}
    </AppShell>
  )
}
