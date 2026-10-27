import crypto from 'crypto';
import ms from 'ms';
import { prisma } from '../../config/prisma.js';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { RateLimitError } from '../auth/errors.js';
import { evaluateOtpRateWindow } from './otp.rateWindow.js';

const generateOtpCode = () => {
    const code = crypto.randomInt(1000, 9999);
    return String(code);
};

/**
 * Sends SMS via SMS India Hub API
 * @param {string} phone - 10-digit mobile number (will be prefixed with 91)
 * @param {string} otp
 */
const sendSmsViaIndiaHub = async (phone, otp) => {
    try {
        // Normalize phone: strip non-digits, ensure 91 country code prefix
        const digits = String(phone || '').replace(/\D/g, '');
        const msisdn = digits.startsWith('91') ? digits : `91${digits}`;

        // Must match the approved DLT template ("App Login", BGADPL) character for character:
        // "Welcome to ##var##, powered by ##var##. Your OTP for registration ##var##. This OTP is valid for 10 minutes. Please do not share it with anyone.BGADPL"
        const message = `Welcome to ${config.smsAppName}, powered by ${config.smsPoweredBy}. Your OTP for registration ${otp}. This OTP is valid for 10 minutes. Please do not share it with anyone.BGADPL`;

        // SMS India Hub SendSMS API — query param names are case-sensitive
        const url = new URL('http://cloud.smsindiahub.in/api/mt/SendSMS');
        url.searchParams.append('user', config.smsIndiaHubUsername || '');
        url.searchParams.append('password', config.smsIndiaHubPassword || '');
        url.searchParams.append('senderid', config.smsSenderId || '');
        url.searchParams.append('channel', config.smsChannel);
        url.searchParams.append('DCS', '0');
        url.searchParams.append('flashsms', '0');
        url.searchParams.append('number', msisdn);
        url.searchParams.append('text', message);
        url.searchParams.append('DLTTemplateId', config.smsDltTemplateId || '');
        // An empty route= makes the provider throw (ErrorCode 25); omit it unless one is assigned
        if (config.smsRoute) {
            url.searchParams.append('route', config.smsRoute);
        }
        url.searchParams.append('PEId', config.smsPeId || '');

        logger.info(`[SMS] Sending OTP to ${msisdn} via SMS India Hub...`);
        const response = await fetch(url.toString());
        const resultText = await response.text();
        logger.info(`[SMS] Raw response for ${msisdn}: ${resultText}`);

        // SMS India Hub often returns HTTP 200 OK even for errors — check response body
        let parsed = null;
        try { parsed = JSON.parse(resultText); } catch (_) { /* plain text response is OK */ }

        if (parsed && parsed.ErrorCode && parsed.ErrorCode !== '000') {
            const errMsg = `SMS India Hub ERROR for ${phone}: [${parsed.ErrorCode}] ${parsed.ErrorMessage || resultText}`;
            logger.error(errMsg);
            // eslint-disable-next-line no-console
            logger.error(`❌ [SMS ERROR] ${errMsg}`);
            if (parsed.ErrorCode === '006') {
                // eslint-disable-next-line no-console
                logger.error('❌ [SMS ERROR] ErrorCode 006 = DLT Template mismatch. The message text must EXACTLY match your registered TRAI DLT template. Login to https://cloud.smsindiahub.in and verify the approved template text.');
            }
        } else if (!response.ok) {
            logger.error(`SMS API HTTP error for ${phone}: ${response.status} – ${resultText}`);
        } else if (/^\s*(failed|error)|^\s*failed#/i.test(resultText)) {
            // The JSON branch above only catches failures the provider chose to
            // format as JSON. It also returns plain text like
            // "Failed#Invalid Login" with HTTP 200, which fell through to the
            // success branch below -- so an expired account or an exhausted
            // balance logged "SMS sent successfully" while nobody could log in.
            // A silent authentication outage is the worst way to learn this.
            logger.error(`SMS India Hub rejected the message for ${phone}: ${resultText}`);
        } else {
            logger.info(`✅ SMS sent successfully to ${msisdn}`);
        }
    } catch (error) {
        logger.error(`Error sending SMS to ${phone}: ${error.message}`);
        // Do NOT throw — OTP is already stored in DB; SMS failure should not block the flow
    }
};

/** True for the app-review numbers in REVIEW_OTP_PHONES, in any phone format. */
export const isReviewPhone = (phone) => {
    const last10 = String(phone || '').replace(/\D/g, '').slice(-10);
    return last10.length === 10 && config.reviewOtpPhones.includes(last10);
};

export const createOrUpdateOtp = async (phone) => {
    const existing = await prisma.foodOtp.findUnique({ where: { phone } });
    const now = new Date();
    // Reviewers retry often and have no SIM to receive the code
    const review = isReviewPhone(phone);

    const windowMs = (config.otpRateWindow || 600) * 1000;
    const decision = evaluateOtpRateWindow(existing, now, {
        windowMs,
        limit: config.otpRateLimit || 3,
    });
    const windowStartedAt = decision.windowStartedAt;

    if (!decision.allowed && !review) {
        logger.warn(
            `OTP rate limit exceeded for phone ${phone} — retry in ${decision.retryAfterSeconds}s`,
        );
        throw new RateLimitError(
            `Too many OTP requests. Please try again in ${Math.ceil(decision.retryAfterSeconds / 60)} minute(s).`,
            decision.retryAfterSeconds,
        );
    }

    let otp;
    if (review) {
        otp = config.reviewOtp;
        logger.info(`Review number ${phone}: fixed OTP, no SMS`);
    } else if (config.useDefaultOtp) {
        otp = '1234';
        logger.info(`Default OTP mode enabled – OTP is ${otp} for phone ${phone}`);
    } else {
        otp = generateOtpCode();
    }

    // Expiry calculation: prioritize seconds, then minutes, then fallback to MS string
    let ttlMs;
    if (config.otpExpirySeconds) {
        ttlMs = config.otpExpirySeconds * 1000;
    } else if (config.otpExpiryMinutes) {
        ttlMs = config.otpExpiryMinutes * 60 * 1000;
    } else {
        ttlMs = ms(config.otpExpiry || '5m');
    }
    const expiresAt = new Date(now.getTime() + ttlMs);
    // The document must outlive the OTP itself so requestCount survives the whole
    // quota window — otherwise the TTL reaper resets the per-phone limit early.
    const purgeAt = new Date(now.getTime() + Math.max(ttlMs, windowMs));

    // One row per phone (unique), so this is a single upsert rather than a
    // read-then-branch. requestCount comes from the rate-window decision, which
    // already accounts for whether the window rolled over.
    await prisma.foodOtp.upsert({
        where: { phone },
        create: {
            phone,
            otp,
            expiresAt,
            purgeAt,
            requestCount: 1,
            lastRequestAt: now,
            windowStartedAt: now,
        },
        update: {
            otp,
            expiresAt,
            purgeAt,
            attempts: 0,
            requestCount: decision.requestCount,
            lastRequestAt: now,
            windowStartedAt,
        },
    });

    // Only send SMS if not in default OTP mode
    if (!config.useDefaultOtp && !review) {
        await sendSmsViaIndiaHub(phone, otp);
    }

    return otp;
};

export const verifyOtp = async (phone, otp) => {
    const record = await prisma.foodOtp.findUnique({ where: { phone } });
    if (!record) {
        return { valid: false, reason: 'OTP not found' };
    }

    if (record.expiresAt < new Date()) {
        return { valid: false, reason: 'OTP expired' };
    }

    if (record.attempts >= config.otpMaxAttempts) {
        return { valid: false, reason: 'Max attempts exceeded' };
    }

    if (record.otp !== otp) {
        // The attempt counter is incremented by the database, not by writing back
        // a value read a moment ago: parallel guesses against the same phone would
        // otherwise each save "attempts + 1" from the same starting point and burn
        // a single attempt between them.
        await prisma.foodOtp.update({
            where: { phone },
            data: { attempts: { increment: 1 } },
        });
        return { valid: false, reason: 'Invalid OTP' };
    }

    // A correct code is consumed, so it cannot be replayed.
    await prisma.foodOtp.deleteMany({ where: { phone } });
    return { valid: true };
};

