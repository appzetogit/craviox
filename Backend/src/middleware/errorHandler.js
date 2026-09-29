import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { MAX_UPLOAD_MB } from './upload.js';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Prisma errors carry the query, the table and the offending values in their
 * message — useful in the log, never something to show a customer. Known
 * request errors get a plain sentence and a fitting status; anything else
 * from the database becomes the generic message.
 */
const PRISMA_KNOWN = {
    P2002: [409, 'This already exists.'],
    P2003: [409, 'This cannot be changed because other records depend on it.'],
    P2025: [404, 'The requested record was not found.'],
};

const isPrismaError = (err) =>
    String(err?.name || '').startsWith('PrismaClient') ||
    /^P\d{4}$/.test(String(err?.code || '')) ||
    /prisma\.\w+\.\w+\(\)`? invocation/.test(String(err?.message || ''));

// Programming errors: their text names variables and properties, not problems
// the user can act on.
const INTERNAL_ERROR_NAMES = new Set(['TypeError', 'ReferenceError', 'SyntaxError', 'RangeError']);

const errorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Server Error';
    // What the log records; the client may get a cleaner message.
    const logMessage = message;

    if (err.name === 'MulterError') {
        statusCode = 400;
        if (err.code === 'LIMIT_FILE_SIZE') {
            // Names the actual limit. "Image is too large" left an admin with a
            // 30MB GIF no way to know whether to shrink it a little or a lot.
            statusCode = 413;
            message = `File is too large. Maximum size is ${MAX_UPLOAD_MB}MB.`;
        } else if (err.code === 'LIMIT_FILE_COUNT') {
            message = 'Only one file can be uploaded at a time';
        } else {
            message = err.message || 'Invalid upload';
        }
    } else if (isPrismaError(err)) {
        const known = PRISMA_KNOWN[err.code];
        [statusCode, message] = known || [500, GENERIC_MESSAGE];
    } else if (!err.statusCode && INTERNAL_ERROR_NAMES.has(err.name)) {
        statusCode = 500;
        message = GENERIC_MESSAGE;
    }

    // Business-layer rate limits (RateLimitError) must advertise when to retry,
    // the same way the HTTP limiter's handler does. Without this a 429 from the
    // per-phone OTP quota is indistinguishable from a permanent failure.
    if (err.retryAfterSeconds) {
        res.setHeader('Retry-After', String(err.retryAfterSeconds));
    }

    const requestId = req.requestId || '-';

    logger.error(
        `[${requestId}] ${req.method} ${req.originalUrl} ${statusCode} - ${err.name || 'Error'} - ${logMessage}`
    );
    // Unexpected failures always keep their stack, in production too: the
    // client now only sees the generic message, so the log is the only trace.
    if ((config.nodeEnv === 'development' || statusCode >= 500) && err.stack) {
        logger.error(`[${requestId}] ${err.stack}`);
    }

    res.status(statusCode).json({
        success: false,
        // `message` matches sendError() and every success response, so clients reading
        // data.message see thrown-error text (ValidationError, NotFoundError, ...) too.
        message,
        error: message, // retained for clients already reading this key
        // Lets support find the logged detail behind a generic message.
        ...(statusCode >= 500 ? { requestId } : {}),
        ...(err.retryAfterSeconds ? { retryAfterSeconds: err.retryAfterSeconds } : {})
    });
};

export default errorHandler;
