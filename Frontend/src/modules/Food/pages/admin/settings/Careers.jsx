import { useCallback, useEffect, useState } from "react"
import { adminAPI } from "@food/api"
import { Button } from "@food/components/ui/button"
import { Switch } from "@food/components/ui/switch"
import { Input } from "@food/components/ui/input"
import { Textarea } from "@food/components/ui/textarea"
import { Label } from "@food/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@food/components/ui/dialog"
import {
  Briefcase, Download, ExternalLink, Loader2, Mail, MapPin, Pencil, Phone, Plus, Search, Trash2, Users,
} from "lucide-react"
import { toast } from "sonner"

/**
 * Admin → Careers. Openings shown on craviox.com/careers and the
 * applications people send from it.
 */

const TYPES = [
  ["full_time", "Full-time"],
  ["part_time", "Part-time"],
  ["internship", "Internship"],
  ["contract", "Contract"],
]
const TYPE_LABEL = Object.fromEntries(TYPES)

const STATUSES = [
  ["new", "New", "bg-sky-100 text-sky-800"],
  ["reviewing", "Reviewing", "bg-violet-100 text-violet-800"],
  ["shortlisted", "Shortlisted", "bg-amber-100 text-amber-800"],
  ["hired", "Hired", "bg-emerald-100 text-emerald-800"],
  ["rejected", "Rejected", "bg-gray-200 text-gray-700"],
]
const STATUS_META = Object.fromEntries(STATUSES.map(([k, label, cls]) => [k, { label, cls }]))

const EMPTY_JOB = {
  title: "",
  department: "",
  location: "",
  employmentType: "full_time",
  experience: "",
  salary: "",
  summary: "",
  description: "",
  responsibilities: "",
  requirements: "",
  isActive: true,
  sortOrder: 0,
}

const errMsg = (e, fallback) => e?.response?.data?.message || fallback
const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })

function Field({ label, hint, children, className = "" }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-sm font-medium text-gray-800">{label}</Label>
      {children}
      {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Openings
// ---------------------------------------------------------------------------

function JobDialog({ open, onOpenChange, job, onSaved }) {
  const [form, setForm] = useState(EMPTY_JOB)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(
      job
        ? {
            ...EMPTY_JOB,
            ...job,
            responsibilities: (job.responsibilities || []).join("\n"),
            requirements: (job.requirements || []).join("\n"),
          }
        : EMPTY_JOB,
    )
  }, [open, job])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }))

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const body = { ...form, sortOrder: Number(form.sortOrder) || 0 }
      if (job?.id) await adminAPI.updateCareerJob(job.id, body)
      else await adminAPI.createCareerJob(body)
      toast.success(job?.id ? "Job updated" : "Job published")
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(errMsg(err, "Couldn't save the job."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle>{job?.id ? "Edit job" : "New job"}</DialogTitle>
          <DialogDescription>Shown on craviox.com/careers while it is open.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="mt-2 grid gap-4 sm:grid-cols-2">
          <Field label="Job title *" className="sm:col-span-2">
            <Input id="job-title" value={form.title} onChange={set("title")} maxLength={120} placeholder="Delivery Operations Lead" required />
          </Field>
          <Field label="Department">
            <Input id="job-dept" value={form.department} onChange={set("department")} maxLength={80} placeholder="Operations" />
          </Field>
          <Field label="Location">
            <Input id="job-loc" value={form.location} onChange={set("location")} maxLength={120} placeholder="Jabalpur · On-site" />
          </Field>
          <Field label="Type">
            <select
              id="job-type"
              value={form.employmentType}
              onChange={set("employmentType")}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {TYPES.map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </Field>
          <Field label="Experience">
            <Input id="job-exp" value={form.experience} onChange={set("experience")} maxLength={80} placeholder="2–4 years" />
          </Field>
          <Field label="Salary" hint="Optional. Leave empty to hide.">
            <Input id="job-salary" value={form.salary} onChange={set("salary")} maxLength={80} placeholder="₹3–4.5 LPA" />
          </Field>
          <Field label="Display order" hint="Lower numbers show first.">
            <Input id="job-order" type="number" value={form.sortOrder} onChange={set("sortOrder")} />
          </Field>
          <Field label="One-line summary" className="sm:col-span-2" hint="Shown on the jobs list.">
            <Input id="job-summary" value={form.summary} onChange={set("summary")} maxLength={300} />
          </Field>
          <Field label="About the role" className="sm:col-span-2">
            <Textarea id="job-desc" rows={4} value={form.description} onChange={set("description")} maxLength={5000} />
          </Field>
          <Field label="What you'll do" className="sm:col-span-2" hint="One point per line.">
            <Textarea id="job-resp" rows={4} value={form.responsibilities} onChange={set("responsibilities")} />
          </Field>
          <Field label="What we're looking for" className="sm:col-span-2" hint="One point per line.">
            <Textarea id="job-req" rows={4} value={form.requirements} onChange={set("requirements")} />
          </Field>
          <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2">
            <div>
              <div className="text-sm font-medium">Open for applications</div>
              <div className="text-xs text-gray-500">Turn off to hide it from the careers page without deleting it.</div>
            </div>
            <Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.title.trim()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {job?.id ? "Save changes" : "Publish job"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Openings({ onViewApplications }) {
  const [jobs, setJobs] = useState(null)
  const [editing, setEditing] = useState(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await adminAPI.getCareerJobs()
      setJobs(res?.data?.data?.jobs || [])
    } catch (err) {
      toast.error(errMsg(err, "Couldn't load jobs."))
      setJobs([])
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const toggle = async (job, isActive) => {
    setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, isActive } : j)))
    try {
      await adminAPI.updateCareerJob(job.id, { isActive })
      toast.success(isActive ? "Job is open" : "Job closed")
    } catch (err) {
      toast.error(errMsg(err, "Couldn't update the job."))
      load()
    }
  }

  const remove = async (job) => {
    if (!window.confirm(`Delete "${job.title}"? Its applications are kept.`)) return
    try {
      await adminAPI.deleteCareerJob(job.id)
      toast.success("Job deleted")
      load()
    } catch (err) {
      toast.error(errMsg(err, "Couldn't delete the job."))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {jobs ? `${jobs.filter((j) => j.isActive).length} open · ${jobs.length} total` : "Loading…"}
        </p>
        <Button
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" /> New job
        </Button>
      </div>

      {!jobs ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Briefcase className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-2 font-medium">No jobs yet</p>
          <p className="text-sm text-gray-500">The careers page invites general applications until you add one.</p>
        </div>
      ) : (
        <div className="divide-y rounded-xl border bg-white">
          {jobs.map((j) => (
            <div key={j.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-900">{j.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${j.isActive ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-600"}`}>
                    {j.isActive ? "Open" : "Closed"}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  {j.department ? <span>{j.department}</span> : null}
                  {j.location ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{j.location}</span> : null}
                  <span>{TYPE_LABEL[j.employmentType] || j.employmentType}</span>
                  <span>Posted {fmtDate(j.postedAt)}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onViewApplications(j.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  <Users className="h-4 w-4" /> {j.applicationCount} applied
                </button>
                {j.isActive ? (
                  <a
                    href={`/careers/${j.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-lg border p-2 hover:bg-gray-50"
                    aria-label="Open public page"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setEditing(j)
                    setDialogOpen(true)
                  }}
                  className="inline-flex items-center rounded-lg border p-2 hover:bg-gray-50"
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(j)}
                  className="inline-flex items-center rounded-lg border p-2 text-red-600 hover:bg-red-50"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <Switch checked={j.isActive} onCheckedChange={(v) => toggle(j, v)} aria-label="Open for applications" />
              </div>
            </div>
          ))}
        </div>
      )}

      <JobDialog open={dialogOpen} onOpenChange={setDialogOpen} job={editing} onSaved={load} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

function ApplicationRow({ app, onChange, onDelete }) {
  const [note, setNote] = useState(app.adminNote || "")
  const [open, setOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const meta = STATUS_META[app.status] || STATUS_META.new

  const download = async () => {
    setDownloading(true)
    try {
      const res = await adminAPI.downloadCareerResume(app.id)
      const url = URL.createObjectURL(res.data)
      const a = document.createElement("a")
      const ext = (app.resumeName.match(/\.\w+$/) || [".pdf"])[0]
      a.href = url
      a.download = `${app.name} - resume${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch {
      toast.error("Couldn't download the resume.")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <button type="button" onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900">{app.name}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>{meta.label}</span>
          </div>
          <div className="mt-1 text-sm text-gray-600">{app.jobTitle}</div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{app.email}</span>
            <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{app.phone}</span>
            {app.city ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{app.city}</span> : null}
            <span>{fmtDate(app.createdAt)}</span>
          </div>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {app.hasResume ? (
            <Button variant="outline" size="sm" onClick={download} disabled={downloading}>
              {downloading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
              Resume
            </Button>
          ) : null}
          <select
            value={app.status}
            onChange={(e) => onChange(app.id, { status: e.target.value })}
            className="h-9 rounded-md border bg-white px-2 text-sm"
            aria-label="Status"
          >
            {STATUSES.map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      {open ? (
        <div className="mt-4 grid gap-4 rounded-lg bg-gray-50 p-4 md:grid-cols-2">
          <div className="space-y-3 text-sm">
            {app.linkUrl ? (
              <a href={app.linkUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-blue-700 underline break-all">
                {app.linkUrl} <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : null}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Why them</div>
              <p className="mt-1 whitespace-pre-line text-gray-800">{app.coverNote || "—"}</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Team notes</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Only admins see this." />
            <div className="flex justify-between gap-2">
              <Button variant="ghost" size="sm" className="text-red-600" onClick={() => onDelete(app)}>
                <Trash2 className="mr-1.5 h-4 w-4" /> Delete
              </Button>
              <Button size="sm" disabled={note === (app.adminNote || "")} onClick={() => onChange(app.id, { adminNote: note })}>
                Save note
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Applications({ jobs, jobFilter, setJobFilter }) {
  const [status, setStatus] = useState("")
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    try {
      const res = await adminAPI.getCareerApplications({ status, jobId: jobFilter, search: query, page, limit: 20 })
      setData(res?.data?.data || { items: [], total: 0, counts: {} })
    } catch (err) {
      toast.error(errMsg(err, "Couldn't load applications."))
      setData({ items: [], total: 0, counts: {} })
    }
  }, [status, jobFilter, query, page])
  useEffect(() => {
    load()
  }, [load])

  const change = async (id, patch) => {
    try {
      const res = await adminAPI.updateCareerApplication(id, patch)
      const updated = res?.data?.data?.application
      setData((d) => ({ ...d, items: d.items.map((a) => (a.id === id ? { ...a, ...updated } : a)) }))
      toast.success(patch.status ? `Marked ${STATUS_META[patch.status]?.label.toLowerCase()}` : "Note saved")
      if (patch.status) load()
    } catch (err) {
      toast.error(errMsg(err, "Couldn't update."))
    }
  }

  const remove = async (app) => {
    if (!window.confirm(`Delete ${app.name}'s application and resume? This can't be undone.`)) return
    try {
      await adminAPI.deleteCareerApplication(app.id)
      toast.success("Application deleted")
      load()
    } catch (err) {
      toast.error(errMsg(err, "Couldn't delete."))
    }
  }

  const counts = data?.counts || {}
  const all = Object.values(counts).reduce((a, b) => a + b, 0)
  const pages = data ? Math.max(1, Math.ceil(data.total / (data.limit || 20))) : 1

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[["", "All", all], ...STATUSES.map(([k, l]) => [k, l, counts[k] || 0])].map(([k, l, n]) => (
          <button
            key={k || "all"}
            type="button"
            onClick={() => {
              setStatus(k)
              setPage(1)
            }}
            className={`rounded-full border px-3 py-1.5 text-sm ${status === k ? "border-gray-900 bg-gray-900 text-white" : "bg-white hover:border-gray-400"}`}
          >
            {l} <span className="opacity-70">{n}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone or role" className="pl-9" />
        </div>
        <select
          value={jobFilter}
          onChange={(e) => {
            setJobFilter(e.target.value)
            setPage(1)
          }}
          className="h-10 rounded-md border bg-white px-3 text-sm sm:w-64"
          aria-label="Filter by job"
        >
          <option value="">All jobs</option>
          <option value="general">General applications</option>
          {(jobs || []).map((j) => (
            <option key={j.id} value={j.id}>{j.title}</option>
          ))}
        </select>
      </div>

      {!data ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-gray-500">No applications match.</div>
      ) : (
        <div className="divide-y rounded-xl border bg-white">
          {data.items.map((a) => (
            <ApplicationRow key={a.id} app={a} onChange={change} onDelete={remove} />
          ))}
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-gray-500">Page {page} of {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      ) : null}
    </div>
  )
}

export default function Careers() {
  const [tab, setTab] = useState("openings")
  const [jobFilter, setJobFilter] = useState("")
  const [jobs, setJobs] = useState([])

  useEffect(() => {
    if (tab !== "applications") return
    adminAPI.getCareerJobs().then((r) => setJobs(r?.data?.data?.jobs || [])).catch(() => {})
  }, [tab])

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Careers</h1>
          <p className="mt-1 text-sm text-gray-500">
            Jobs on{" "}
            <a href="/careers" target="_blank" rel="noreferrer" className="text-blue-700 underline">craviox.com/careers</a>{" "}
            and the applications people send.
          </p>
        </div>
      </div>
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        {[["openings", "Openings"], ["applications", "Applications"]].map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === k ? "bg-white shadow-sm text-gray-900" : "text-gray-600"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "openings" ? (
        <Openings
          onViewApplications={(id) => {
            setJobFilter(id)
            setTab("applications")
          }}
        />
      ) : (
        <Applications jobs={jobs} jobFilter={jobFilter} setJobFilter={setJobFilter} />
      )}
    </div>
  )
}
