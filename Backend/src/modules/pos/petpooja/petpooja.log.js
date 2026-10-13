import { prisma } from '../../../config/prisma.js';
import { logger } from '../../../utils/logger.js';

// Compared with dashes and underscores removed, so app_key, app-key and appKey all match.
const SECRET_KEYS = new Set(['appkey', 'appsecret', 'accesstoken', 'token']);
const isSecretKey = (k) => SECRET_KEYS.has(String(k).toLowerCase().replace(/[-_]/g, ''));
const MAX_PAYLOAD_CHARS = 20000;

/** Deep copy with credentials blanked, so the activity log never stores them. */
function redact(value, depth = 0) {
    if (depth > 8 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
    const out = {};
    for (const [k, v] of Object.entries(value)) {
        out[k] = isSecretKey(k) ? '[hidden]' : redact(v, depth + 1);
    }
    return out;
}

/** One row in Admin → Petpooja → Activity. Never throws. */
export async function logPosEvent({ restaurantId = null, orderId = null, direction, type, ok, message = '', payload = null }) {
    try {
        let stored = payload == null ? null : redact(payload);
        if (stored != null) {
            const text = JSON.stringify(stored);
            if (text.length > MAX_PAYLOAD_CHARS) stored = { truncated: true, preview: text.slice(0, MAX_PAYLOAD_CHARS) };
        }
        await prisma.posEventLog.create({
            data: {
                restaurantId: restaurantId || null,
                orderId: orderId || null,
                direction,
                type,
                ok: Boolean(ok),
                message: String(message || '').slice(0, 500),
                payload: stored ?? undefined,
            },
        });
    } catch (err) {
        logger.warn(`[Petpooja] could not write activity log: ${err?.message || err}`);
    }
}
