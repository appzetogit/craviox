export const sendResponse = (res, statusCode, message, data = null) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data
    });
};

// Prisma messages embed the query and the values; they belong in the log only.
const INTERNAL_TEXT = /prisma\.\w+\.\w+\(\)|invocation:|constraint|violates|Unique constraint|P\d{4}/i;

export const sendError = (res, statusCode, message) => {
    const safe = statusCode >= 500 && INTERNAL_TEXT.test(String(message || ''))
        ? 'Something went wrong. Please try again.'
        : message;
    return res.status(statusCode).json({
        success: false,
        message: safe
    });
};
