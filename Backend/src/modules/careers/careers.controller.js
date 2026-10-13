import multer from 'multer';
import { sendResponse } from '../../utils/response.js';
import { ValidationError } from '../../core/auth/errors.js';
import * as careers from './careers.service.js';

/** One resume, 5 MB, held in memory only until it is checked and written. */
const resumeUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: careers.MAX_RESUME_BYTES, files: 1, fields: 20 },
}).single('resume');

export function parseResume(req, res, next) {
    resumeUpload(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') return next(new ValidationError('Resume must be 5 MB or smaller'));
        if (err instanceof multer.MulterError) return next(new ValidationError('Attach a single resume file'));
        return next(err);
    });
}

const wrap = (fn) => async (req, res, next) => {
    try {
        await fn(req, res);
    } catch (error) {
        next(error);
    }
};

// ----- Public -----

export const listJobs = wrap(async (req, res) => {
    sendResponse(res, 200, 'Jobs fetched successfully', { jobs: await careers.listOpenJobs() });
});

export const getJob = wrap(async (req, res) => {
    sendResponse(res, 200, 'Job fetched successfully', { job: await careers.getOpenJob(req.params.slug) });
});

export const apply = wrap(async (req, res) => {
    const result = await careers.submitApplication(req.body || {}, req.file || null);
    sendResponse(res, 201, 'Application received', result);
});

// ----- Admin -----

export const adminListJobs = wrap(async (req, res) => {
    sendResponse(res, 200, 'Jobs fetched successfully', { jobs: await careers.adminListJobs() });
});

export const adminCreateJob = wrap(async (req, res) => {
    sendResponse(res, 201, 'Job created', { job: await careers.adminCreateJob(req.body || {}) });
});

export const adminUpdateJob = wrap(async (req, res) => {
    sendResponse(res, 200, 'Job updated', { job: await careers.adminUpdateJob(req.params.id, req.body || {}) });
});

export const adminDeleteJob = wrap(async (req, res) => {
    sendResponse(res, 200, 'Job deleted', await careers.adminDeleteJob(req.params.id));
});

export const adminListApplications = wrap(async (req, res) => {
    sendResponse(res, 200, 'Applications fetched successfully', await careers.adminListApplications(req.query || {}));
});

export const adminUpdateApplication = wrap(async (req, res) => {
    sendResponse(res, 200, 'Application updated', { application: await careers.adminUpdateApplication(req.params.id, req.body || {}) });
});

export const adminDeleteApplication = wrap(async (req, res) => {
    sendResponse(res, 200, 'Application deleted', await careers.adminDeleteApplication(req.params.id));
});

export const adminDownloadResume = wrap(async (req, res) => {
    const file = await careers.adminResumeFile(req.params.id);
    res.set('Cache-Control', 'no-store');
    res.set('Content-Type', file.mime);
    res.set('X-Content-Type-Options', 'nosniff');
    res.download(file.path, file.filename);
});
