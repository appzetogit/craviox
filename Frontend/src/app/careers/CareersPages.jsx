import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft, ArrowRight, Briefcase, CheckCircle2, Clock, FileText, IndianRupee, Loader2, MapPin, Send, Upload, X,
} from "lucide-react"
import wordmark from "@food/userApp/assets/craviox-wordmark.png"
import { Footer } from "@food/userApp/shell/DesktopChrome"
import "@food/userApp/theme.css"

/**
 * craviox.com/careers — open roles and the apply form. Roles and
 * applications are managed in Admin → Careers.
 *
 * Deliberately outside the customer app's layout: it needs no cart, location
 * or login, and it stays reachable while the store is in coming-soon mode.
 */

const API = String(import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "")
const TYPE_LABELS = { full_time: "Full-time", part_time: "Part-time", internship: "Internship", contract: "Contract" }
const ORANGE = "#F54A00"

async function api(path, init) {
  const res = await fetch(`${API}${path}`, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.success === false) {
    const err = new Error(body?.message || "Something went wrong. Please try again.")
    err.status = res.status
    throw err
  }
  return body.data
}

function usePageTitle(title) {
  useEffect(() => {
    const prev = document.title
    document.title = title
    return () => {
      document.title = prev
    }
  }, [title])
}

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-[#F3E6DE] bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 md:px-8">
        <Link to="/careers" className="flex items-center gap-3">
          <img src={wordmark} alt="Craviox" className="h-7 w-auto" />
          <span className="hidden sm:inline rounded-full bg-[#FFE9DE] px-2.5 py-0.5 text-xs font-semibold" style={{ color: ORANGE }}>
            Careers
          </span>
        </Link>
        <Link to="/home" className="text-sm font-semibold text-[#061A19] hover:text-[#F54A00]">
          Order food
        </Link>
      </div>
    </header>
  )
}

function Frame({ children }) {
  return (
    <div className="ca-app flex flex-col bg-white text-[#061A19]" style={{ minHeight: "100dvh" }}>
      <Header />
      <main className="flex-1">{children}</main>
      <div className="hidden md:block">
        <Footer />
      </div>
      <footer className="md:hidden border-t border-[#F3E6DE] px-4 py-6 text-center text-xs text-[#6B7877]">
        © {new Date().getFullYear()} Craviox ·{" "}
        <Link to="/privacy" className="underline">Privacy</Link> · <Link to="/terms" className="underline">Terms</Link>
      </footer>
    </div>
  )
}

function Meta({ icon: Icon, children }) {
  if (!children) return null
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-[#4B5A59]">
      <Icon className="h-4 w-4 shrink-0" style={{ color: ORANGE }} />
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// /careers
// ---------------------------------------------------------------------------

const VALUES = [
  { title: "Local, and it shows", text: "Every order you help with feeds someone in your own city and keeps a neighbourhood kitchen busy." },
  { title: "Small team, real ownership", text: "You will own whole problems, not tickets. Ideas go from a chat to customers' phones in days." },
  { title: "Grow as we grow", text: "We are early. The people who join now shape how Craviox works for years." },
]

export function CareersPage() {
  usePageTitle("Careers · Craviox")
  const [jobs, setJobs] = useState(null)
  const [error, setError] = useState("")
  const [dept, setDept] = useState("All")
  const rolesRef = useRef(null)

  useEffect(() => {
    let alive = true
    api("/careers/jobs")
      .then((d) => alive && setJobs(d?.jobs || []))
      .catch((e) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [])

  const depts = useMemo(() => {
    const set = new Set((jobs || []).map((j) => j.department).filter(Boolean))
    return ["All", ...[...set].sort()]
  }, [jobs])
  const shown = (jobs || []).filter((j) => dept === "All" || j.department === dept)

  return (
    <Frame>
      <section style={{ background: "radial-gradient(900px 420px at 15% 0%, #FFE3D3 0%, #FFF6F1 50%, #FFFFFF 100%)" }}>
        <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 md:grid-cols-[1.3fr_1fr] md:px-8 md:py-20">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em]" style={{ color: ORANGE }}>Careers at Craviox</p>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.08] tracking-tight md:text-6xl" style={{ textWrap: "balance" }}>
              Help your city eat better.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#4B5A59]">
              We connect hungry people with the restaurants they love and the riders who bring it to their door.
              Come build it with us.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => rolesRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold text-white shadow-sm"
                style={{ background: ORANGE }}
              >
                See open roles <ArrowRight className="h-4 w-4" />
              </button>
              <Link
                to="/careers/apply"
                className="inline-flex items-center gap-2 rounded-xl border border-[#E8D5C9] bg-white px-5 py-3 font-semibold hover:border-[#F54A00]"
              >
                Send a general application
              </Link>
            </div>
          </div>
          <div className="grid content-center gap-3">
            {VALUES.map((v) => (
              <div key={v.title} className="rounded-2xl border border-[#F3E6DE] bg-white/80 p-5">
                <h2 className="font-bold">{v.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-[#4B5A59]">{v.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section ref={rolesRef} className="mx-auto max-w-[1200px] scroll-mt-20 px-4 py-12 md:px-8 md:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold md:text-3xl">Open roles</h2>
            {jobs ? (
              <p className="mt-1 text-[#6B7877]">
                {jobs.length ? `${jobs.length} ${jobs.length === 1 ? "opening" : "openings"}` : "No openings right now"}
              </p>
            ) : null}
          </div>
          {depts.length > 2 ? (
            <div className="flex flex-wrap gap-2">
              {depts.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDept(d)}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
                    dept === d ? "border-[#061A19] bg-[#061A19] text-white" : "border-[#E8D5C9] bg-white hover:border-[#061A19]"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-8">
          {error ? (
            <p className="rounded-2xl bg-red-50 p-5 text-red-700">{error}</p>
          ) : !jobs ? (
            <div className="grid gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl bg-[#FBF3EE]" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E8D5C9] p-10 text-center">
              <Briefcase className="mx-auto h-8 w-8" style={{ color: ORANGE }} />
              <h3 className="mt-3 text-lg font-bold">Nothing open at the moment</h3>
              <p className="mx-auto mt-1 max-w-md text-[#4B5A59]">
                We still want to hear from good people. Send your resume and we will reach out when something fits.
              </p>
              <Link to="/careers/apply" className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold text-white" style={{ background: ORANGE }}>
                Send your resume <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <ul className="grid gap-3">
              {shown.map((j) => (
                <li key={j.id}>
                  <Link
                    to={`/careers/${j.slug}`}
                    className="group flex flex-col gap-3 rounded-2xl border border-[#F0E2D9] bg-white p-5 transition hover:border-[#F54A00] hover:shadow-[0_8px_30px_-12px_rgba(245,74,0,0.35)] md:flex-row md:items-center md:justify-between md:p-6"
                  >
                    <div className="min-w-0">
                      {j.department ? <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: ORANGE }}>{j.department}</p> : null}
                      <h3 className="mt-1 text-lg font-bold md:text-xl">{j.title}</h3>
                      {j.summary ? <p className="mt-1 line-clamp-2 text-[#4B5A59]">{j.summary}</p> : null}
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                        <Meta icon={MapPin}>{j.location}</Meta>
                        <Meta icon={Clock}>{TYPE_LABELS[j.employmentType] || j.employmentType}</Meta>
                        <Meta icon={Briefcase}>{j.experience}</Meta>
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold" style={{ color: ORANGE }}>
                      View role <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </Frame>
  )
}

// ---------------------------------------------------------------------------
// /careers/:slug and /careers/apply
// ---------------------------------------------------------------------------

export function CareerJobPage() {
  const { slug } = useParams()
  const general = !slug || slug === "apply"
  const [job, setJob] = useState(general ? undefined : null)
  const [error, setError] = useState("")
  usePageTitle(job?.title ? `${job.title} · Craviox Careers` : general ? "Apply · Craviox Careers" : "Careers · Craviox")

  useEffect(() => {
    if (general) return undefined
    let alive = true
    setJob(null)
    setError("")
    api(`/careers/jobs/${encodeURIComponent(slug)}`)
      .then((d) => alive && setJob(d?.job || null))
      .catch((e) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [slug, general])

  return (
    <Frame>
      <div className="mx-auto max-w-[1200px] px-4 py-8 md:px-8 md:py-12">
        <Link to="/careers" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#4B5A59] hover:text-[#F54A00]">
          <ArrowLeft className="h-4 w-4" /> All roles
        </Link>

        {error ? (
          <div className="mt-8 rounded-2xl border border-dashed border-[#E8D5C9] p-10 text-center">
            <h1 className="text-xl font-bold">{error}</h1>
            <p className="mt-1 text-[#4B5A59]">It may have been filled. Take a look at what is open now.</p>
            <Link to="/careers" className="mt-5 inline-flex rounded-xl px-5 py-3 font-semibold text-white" style={{ background: ORANGE }}>
              See open roles
            </Link>
          </div>
        ) : job === null ? (
          <div className="mt-8 grid gap-4">
            <div className="h-10 w-2/3 animate-pulse rounded-xl bg-[#FBF3EE]" />
            <div className="h-64 animate-pulse rounded-2xl bg-[#FBF3EE]" />
          </div>
        ) : (
          <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px]">
            <article className="min-w-0">
              {general ? (
                <>
                  <h1 className="text-3xl font-extrabold tracking-tight md:text-5xl">Send us your resume</h1>
                  <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[#4B5A59]">
                    Don't see the right role? Tell us what you are great at. We read every application and get in touch
                    when something fits.
                  </p>
                </>
              ) : (
                <>
                  {job.department ? <p className="text-sm font-semibold uppercase tracking-[0.12em]" style={{ color: ORANGE }}>{job.department}</p> : null}
                  <h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-5xl" style={{ textWrap: "balance" }}>{job.title}</h1>
                  <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
                    <Meta icon={MapPin}>{job.location}</Meta>
                    <Meta icon={Clock}>{TYPE_LABELS[job.employmentType] || job.employmentType}</Meta>
                    <Meta icon={Briefcase}>{job.experience}</Meta>
                    <Meta icon={IndianRupee}>{job.salary}</Meta>
                  </div>
                  {job.summary ? <p className="mt-6 text-lg leading-relaxed text-[#2C3B39]">{job.summary}</p> : null}
                  {job.description ? <p className="mt-6 max-w-[68ch] whitespace-pre-line leading-relaxed text-[#2C3B39]">{job.description}</p> : null}
                  <BulletList title="What you'll do" items={job.responsibilities} />
                  <BulletList title="What we're looking for" items={job.requirements} />
                </>
              )}
            </article>
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <ApplyForm job={general ? null : job} />
            </aside>
          </div>
        )}
      </div>
    </Frame>
  )
}

function BulletList({ title, items }) {
  if (!items?.length) return null
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold">{title}</h2>
      <ul className="mt-3 grid max-w-[68ch] gap-2.5">
        {items.map((t, i) => (
          <li key={i} className="flex gap-3 leading-relaxed text-[#2C3B39]">
            <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ORANGE }} />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const MAX_BYTES = 5 * 1024 * 1024
const ACCEPT = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"

function Input({ id, label, required, hint, ...props }) {
  return (
    <label htmlFor={id} className="grid gap-1.5">
      <span className="text-sm font-semibold">
        {label} {required ? <span style={{ color: ORANGE }}>*</span> : <span className="font-normal text-[#8A9594]">(optional)</span>}
      </span>
      <input
        id={id}
        required={required}
        className="w-full rounded-xl border border-[#E8D5C9] bg-white px-4 py-3 outline-none transition focus:border-[#F54A00] focus:ring-2 focus:ring-[#F54A00]/15"
        {...props}
      />
      {hint ? <span className="text-xs text-[#6B7877]">{hint}</span> : null}
    </label>
  )
}

function ApplyForm({ job }) {
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const [form, setForm] = useState({ name: "", email: "", phone: "", city: "", linkUrl: "", coverNote: "" })
  const [file, setFile] = useState(null)
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const pick = (f) => {
    setError("")
    if (!f) return
    if (!/\.(pdf|docx?)$/i.test(f.name)) return setError("Attach a PDF or Word document.")
    if (f.size > MAX_BYTES) return setError("The resume must be 5 MB or smaller.")
    setFile(f)
  }

  const submit = async (e) => {
    e.preventDefault()
    setError("")
    if (!file) return setError("Attach your resume to apply.")
    const data = new FormData()
    Object.entries(form).forEach(([k, v]) => data.append(k, v))
    if (job?.id) data.append("jobId", job.id)
    data.append("resume", file)
    setBusy(true)
    try {
      await api("/careers/apply", { method: "POST", body: data })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-3xl border border-[#F0E2D9] bg-[#FFF8F4] p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <h2 className="mt-4 text-2xl font-extrabold">Application sent</h2>
        <p className="mt-2 text-[#4B5A59]">
          Thanks, {form.name.split(" ")[0] || "there"}. We will review it and email you at <strong>{form.email}</strong> if it is a match.
        </p>
        <button type="button" onClick={() => navigate("/careers")} className="mt-6 rounded-xl border border-[#E8D5C9] bg-white px-5 py-3 font-semibold hover:border-[#F54A00]">
          Back to all roles
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-3xl border border-[#F0E2D9] bg-white p-5 shadow-[0_20px_50px_-30px_rgba(6,26,25,0.35)] md:p-7" noValidate>
      <div>
        <h2 className="text-xl font-extrabold">{job ? "Apply for this role" : "Your details"}</h2>
        <p className="mt-1 text-sm text-[#6B7877]">Takes about two minutes.</p>
      </div>
      <Input id="ap-name" label="Full name" required autoComplete="name" value={form.name} onChange={set("name")} maxLength={100} />
      <Input id="ap-email" label="Email" required type="email" autoComplete="email" value={form.email} onChange={set("email")} maxLength={160} />
      <Input id="ap-phone" label="Phone" required type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={set("phone")} maxLength={20} placeholder="+91" />
      <Input id="ap-city" label="City" autoComplete="address-level2" value={form.city} onChange={set("city")} maxLength={80} />
      <Input id="ap-link" label="LinkedIn or portfolio" type="url" value={form.linkUrl} onChange={set("linkUrl")} maxLength={300} placeholder="https://" />

      <div className="grid gap-1.5">
        <span className="text-sm font-semibold">
          Resume <span style={{ color: ORANGE }}>*</span>
        </span>
        {file ? (
          <div className="flex items-center gap-3 rounded-xl border border-[#E8D5C9] bg-[#FFF8F4] px-4 py-3">
            <FileText className="h-5 w-5 shrink-0" style={{ color: ORANGE }} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</span>
            <button type="button" onClick={() => setFile(null)} aria-label="Remove file" className="text-[#6B7877] hover:text-[#061A19]">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              pick(e.dataTransfer.files?.[0])
            }}
            className={`flex flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
              drag ? "border-[#F54A00] bg-[#FFF3EC]" : "border-[#E8D5C9] hover:border-[#F54A00]"
            }`}
          >
            <Upload className="h-5 w-5" style={{ color: ORANGE }} />
            <span className="text-sm font-semibold">Upload or drop your resume</span>
            <span className="text-xs text-[#6B7877]">PDF or Word, up to 5 MB</span>
          </button>
        )}
        <input
          ref={fileRef}
          id="ap-resume"
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0])
            e.target.value = ""
          }}
        />
      </div>

      <label htmlFor="ap-note" className="grid gap-1.5">
        <span className="text-sm font-semibold">
          Why you? <span className="font-normal text-[#8A9594]">(optional)</span>
        </span>
        <textarea
          id="ap-note"
          rows={4}
          value={form.coverNote}
          onChange={set("coverNote")}
          maxLength={3000}
          className="w-full rounded-xl border border-[#E8D5C9] px-4 py-3 outline-none transition focus:border-[#F54A00] focus:ring-2 focus:ring-[#F54A00]/15"
        />
      </label>

      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 font-bold text-white transition disabled:opacity-60"
        style={{ background: ORANGE }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {busy ? "Sending…" : "Submit application"}
      </button>
      <p className="text-xs leading-relaxed text-[#8A9594]">
        Your details are only used to consider you for jobs at Craviox. See our <Link to="/privacy" className="underline">privacy policy</Link>.
      </p>
    </form>
  )
}
