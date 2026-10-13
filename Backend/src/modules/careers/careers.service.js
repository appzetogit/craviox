import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../../config/prisma.js';
import { config } from '../../config/env.js';
import { ValidationError, NotFoundError } from '../../core/auth/errors.js';

/**
 * Careers: job openings on craviox.com/careers and the applications sent to
 * them. Openings are managed in Admin → Careers.
 *
 * Resumes are personal documents, so they are NOT written to the uploads
 * folder (nginx serves that publicly). They go to a private folder beside it
 * and are only ever streamed back to a signed-in admin.
 */
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'internship', 'contract'];
export const APPLICATION_STATUSES = ['new', 'reviewing', 'shortlisted', 'rejected', 'hired'];
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

const RESUME_DIR = process.env.CAREERS_RESUME_DIR
    || path.join(path.dirname(path.resolve(config.uploadStorageRoot || './uploads')), 'private-uploads', 'resumes');

/** The file's own first bytes decide its type; the browser's claim is not trusted. */
const RESUME_TYPES = [
    { ext: '.pdf', mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46] },
    { ext: '.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: [0x50, 0x4b, 0x03, 0x04] },
    { ext: '.doc', mime: 'application/msword', magic: [0xd0, 0xcf, 0x11, 0xe0] },
];

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const lines = (v, maxItems = 20, maxLen = 300) => {
    const arr = Array.isArray(v) ? v : String(v ?? '').split('\n');
    return arr.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems);
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'job';
}

async function uniqueSlug(base, exceptId = null) {
    let slug = slugify(base);
    for (let i = 2; ; i += 1) {
        const hit = await prisma.careerJob.findUnique({ where: { slug }, select: { id: true } });
        if (!hit || hit.id === exceptId) return slug;
        slug = `${slugify(base)}-${i}`;
    }
}

function validateJob(input = {}) {
    const title = str(input.title, 120);
    if (!title) throw new ValidationError('Job title is required');
    const employmentType = str(input.employmentType, 20) || 'full_time';
    if (!EMPLOYMENT_TYPES.includes(employmentType)) {
        throw new ValidationError(`Employment type must be one of: ${EMPLOYMENT_TYPES.join(', ')}`);
    }
    const sortOrder = Number.parseInt(input.sortOrder ?? 0, 10);
    return {
        title,
        department: str(input.department, 80),
        location: str(input.location, 120),
        employmentType,
        experience: str(input.experience, 80),
        salary: str(input.salary, 80),
        summary: str(input.summary, 300),
        description: str(input.description, 5000),
        responsibilities: lines(input.responsibilities),
        requirements: lines(input.requirements),
        isActive: input.isActive === undefined ? true : Boolean(input.isActive),
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    };
}

const publicJob = (j) => ({
    id: j.id,
    slug: j.slug,
    title: j.title,
    department: j.department,
    location: j.location,
    employmentType: j.employmentType,
    experience: j.experience,
    salary: j.salary,
    summary: j.summary,
    description: j.description,
    responsibilities: j.responsibilities,
    requirements: j.requirements,
    postedAt: j.createdAt,
});

// ----- Public -----

export async function listOpenJobs() {
    const jobs = await prisma.careerJob.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return jobs.map(publicJob);
}

export async function getOpenJob(slug) {
    const job = await prisma.careerJob.findFirst({ where: { slug: str(slug, 120), isActive: true } });
    if (!job) throw new NotFoundError('This job is no longer open');
    return publicJob(job);
}

function detectResume(file) {
    if (!file?.buffer?.length) return null;
    if (file.buffer.length > MAX_RESUME_BYTES) throw new ValidationError('Resume must be 5 MB or smaller');
    const type = RESUME_TYPES.find((t) => t.magic.every((b, i) => file.buffer[i] === b));
    if (!type) throw new ValidationError('Resume must be a PDF or Word document');
    return type;
}

export async function submitApplication(input = {}, file = null) {
    const name = str(input.name, 100);
    const email = str(input.email, 160).toLowerCase();
    const phone = str(input.phone, 20).replace(/[^\d+]/g, '');
    if (!name) throw new ValidationError('Please enter your name');
    if (!EMAIL.test(email)) throw new ValidationError('Please enter a valid email address');
    if (phone.replace(/\D/g, '').length < 10) throw new ValidationError('Please enter a valid phone number');

    const linkUrl = str(input.linkUrl, 300);
    if (linkUrl && !/^https?:\/\//i.test(linkUrl)) throw new ValidationError('Profile link must start with http:// or https://');

    let job = null;
    const jobId = str(input.jobId, 24);
    if (jobId) {
        job = await prisma.careerJob.findFirst({ where: { id: jobId, isActive: true } });
        if (!job) throw new ValidationError('This job is no longer open');
    }

    const type = detectResume(file);
    if (!type) throw new ValidationError('Please attach your resume (PDF or Word)');

    // One application per person per opening is enough; a resend within a day
    // is almost always a double tap or a retry.
    const recent = await prisma.careerApplication.findFirst({
        where: { email, jobId: job?.id ?? null, createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
        select: { id: true },
    });
    if (recent) throw new ValidationError('We already have your application for this role. We will be in touch.');

    await fs.mkdir(RESUME_DIR, { recursive: true });
    const filename = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${type.ext}`;
    await fs.writeFile(path.join(RESUME_DIR, filename), file.buffer, { mode: 0o600 });

    const originalName = str(file.originalname, 120).replace(/[^\w.\- ]/g, '') || `resume${type.ext}`;
    const created = await prisma.careerApplication.create({
        data: {
            jobId: job?.id ?? null,
            jobTitle: job?.title || 'General application',
            name,
            email,
            phone,
            city: str(input.city, 80),
            linkUrl,
            coverNote: str(input.coverNote, 3000),
            resumePath: filename,
            resumeName: originalName,
            resumeMime: type.mime,
        },
        select: { id: true },
    });
    return { id: created.id };
}

// ----- Admin -----

export async function adminListJobs() {
    const [jobs, grouped] = await Promise.all([
        prisma.careerJob.findMany({ orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }] }),
        prisma.careerApplication.groupBy({ by: ['jobId'], _count: { _all: true } }),
    ]);
    const counts = Object.fromEntries(grouped.map((g) => [g.jobId, g._count._all]));
    return jobs.map((j) => ({
        ...publicJob(j),
        isActive: j.isActive,
        sortOrder: j.sortOrder,
        applicationCount: counts[j.id] || 0,
        updatedAt: j.updatedAt,
    }));
}

export async function adminCreateJob(input) {
    const data = validateJob(input);
    const job = await prisma.careerJob.create({ data: { ...data, slug: await uniqueSlug(data.title) } });
    return publicJob(job);
}

export async function adminUpdateJob(id, input) {
    const existing = await prisma.careerJob.findUnique({ where: { id: str(id, 24) } });
    if (!existing) throw new NotFoundError('Job not found');
    const data = validateJob({ ...existing, ...input });
    const slug = data.title === existing.title ? existing.slug : await uniqueSlug(data.title, existing.id);
    const job = await prisma.careerJob.update({ where: { id: existing.id }, data: { ...data, slug } });
    return { ...publicJob(job), isActive: job.isActive, sortOrder: job.sortOrder };
}

export async function adminDeleteJob(id) {
    // Applications keep their jobTitle and survive (jobId is set to null).
    const { count } = await prisma.careerJob.deleteMany({ where: { id: str(id, 24) } });
    if (!count) throw new NotFoundError('Job not found');
    return { deleted: true };
}

export async function adminListApplications({ status = '', jobId = '', search = '', page = 1, limit = 20 } = {}) {
    const where = {};
    if (status && APPLICATION_STATUSES.includes(status)) where.status = status;
    if (jobId === 'general') where.jobId = null;
    else if (jobId) where.jobId = str(jobId, 24);
    const q = str(search, 80);
    if (q) {
        where.OR = [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
            { jobTitle: { contains: q, mode: 'insensitive' } },
        ];
    }
    const take = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
    const skip = (Math.max(Number.parseInt(page, 10) || 1, 1) - 1) * take;
    const [items, total, grouped] = await Promise.all([
        prisma.careerApplication.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        prisma.careerApplication.count({ where }),
        prisma.careerApplication.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const counts = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0]));
    for (const g of grouped) counts[g.status] = g._count._all;
    return {
        items: items.map(({ resumePath, ...a }) => ({ ...a, hasResume: Boolean(resumePath) })),
        total,
        page: skip / take + 1,
        limit: take,
        counts,
    };
}

export async function adminUpdateApplication(id, input = {}) {
    const data = {};
    if (input.status !== undefined) {
        if (!APPLICATION_STATUSES.includes(input.status)) {
            throw new ValidationError(`Status must be one of: ${APPLICATION_STATUSES.join(', ')}`);
        }
        data.status = input.status;
    }
    if (input.adminNote !== undefined) data.adminNote = str(input.adminNote, 2000);
    const { count } = await prisma.careerApplication.updateMany({ where: { id: str(id, 24) }, data });
    if (!count) throw new NotFoundError('Application not found');
    const { resumePath, ...app } = await prisma.careerApplication.findUnique({ where: { id: str(id, 24) } });
    return { ...app, hasResume: Boolean(resumePath) };
}

export async function adminDeleteApplication(id) {
    const app = await prisma.careerApplication.findUnique({ where: { id: str(id, 24) } });
    if (!app) throw new NotFoundError('Application not found');
    await prisma.careerApplication.delete({ where: { id: app.id } });
    if (app.resumePath) await fs.rm(path.join(RESUME_DIR, path.basename(app.resumePath)), { force: true });
    return { deleted: true };
}

/** Absolute path + download name, for the admin resume download. */
export async function adminResumeFile(id) {
    const app = await prisma.careerApplication.findUnique({ where: { id: str(id, 24) } });
    if (!app?.resumePath) throw new NotFoundError('No resume on this application');
    const abs = path.join(RESUME_DIR, path.basename(app.resumePath));
    try {
        await fs.access(abs);
    } catch {
        throw new NotFoundError('The resume file is missing');
    }
    const ext = path.extname(app.resumePath);
    const safeName = `${app.name.replace(/[^\w ]/g, '').trim() || 'applicant'} - resume${ext}`;
    return { path: abs, filename: safeName, mime: app.resumeMime || 'application/octet-stream' };
}
