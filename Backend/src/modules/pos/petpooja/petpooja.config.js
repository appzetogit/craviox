import crypto from 'crypto';
import axios from 'axios';
import { prisma } from '../../../config/prisma.js';
import { ValidationError } from '../../../core/auth/errors.js';

/**
 * Petpooja partner settings (Admin → Petpooja). One row.
 *
 * Petpooja gives an integration partner an app key, app secret and access
 * token, plus the URLs of its Save Order / Update Order Status / Fetch Menu
 * APIs (they differ between sandbox and live). Those URLs are settings, not
 * constants, because Petpooja shares them only with onboarded partners.
 */

const SECRET_FIELDS = ['appSecret', 'accessToken'];

const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);

export async function loadConfig() {
    const row = await prisma.petpoojaConfig.findFirst();
    if (row) return row;
    return prisma.petpoojaConfig.create({ data: { webhookToken: crypto.randomBytes(24).toString('hex') } });
}

const mask = (v) => (v ? `${'•'.repeat(8)}${String(v).slice(-4)}` : '');

/** Admin view: secrets masked, plus whether they are set. */
export function toAdminConfig(row) {
    return {
        enabled: row.enabled,
        environment: row.environment,
        appKey: row.appKey,
        appSecret: mask(row.appSecret),
        accessToken: mask(row.accessToken),
        hasAppSecret: Boolean(row.appSecret),
        hasAccessToken: Boolean(row.accessToken),
        saveOrderUrl: row.saveOrderUrl,
        updateOrderStatusUrl: row.updateOrderStatusUrl,
        fetchMenuUrl: row.fetchMenuUrl,
        webhookToken: row.webhookToken,
        updatedAt: row.updatedAt,
    };
}

const isUrl = (v) => !v || /^https:\/\/[^\s]+$/i.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(v);

export async function updateConfig(input = {}) {
    const row = await loadConfig();
    const data = {};
    if (input.enabled !== undefined) data.enabled = Boolean(input.enabled);
    if (input.environment !== undefined) {
        if (!['sandbox', 'live'].includes(input.environment)) throw new ValidationError('Environment must be sandbox or live');
        data.environment = input.environment;
    }
    if (input.appKey !== undefined) data.appKey = str(input.appKey, 200);
    // Masked values come back unchanged from the form; only a new value replaces the secret.
    for (const key of SECRET_FIELDS) {
        const v = input[key];
        if (v !== undefined && !String(v).startsWith('•')) data[key] = str(v, 500);
    }
    for (const key of ['saveOrderUrl', 'updateOrderStatusUrl', 'fetchMenuUrl']) {
        if (input[key] === undefined) continue;
        const v = str(input[key], 500);
        if (!isUrl(v)) throw new ValidationError(`${key} must be an https:// URL`);
        data[key] = v;
    }
    const next = await prisma.petpoojaConfig.update({ where: { id: row.id }, data });
    if (next.enabled && (!next.appKey || !next.appSecret || !next.accessToken)) {
        await prisma.petpoojaConfig.update({ where: { id: row.id }, data: { enabled: false } });
        throw new ValidationError('Add the app key, app secret and access token before turning Petpooja on');
    }
    return toAdminConfig(next);
}

export async function rotateWebhookToken() {
    const row = await loadConfig();
    const next = await prisma.petpoojaConfig.update({
        where: { id: row.id },
        data: { webhookToken: crypto.randomBytes(24).toString('hex') },
    });
    return toAdminConfig(next);
}

export function tokenMatches(row, given) {
    const a = Buffer.from(String(row?.webhookToken || ''));
    const b = Buffer.from(String(given || ''));
    return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Outbound call to a Petpooja API. Never throws on HTTP errors; returns { ok, status, data, error }. */
export async function callPetpooja(url, body, { headers = {}, timeoutMs = 15000 } = {}) {
    if (!url) return { ok: false, status: 0, data: null, error: 'Petpooja URL is not set in Admin → Petpooja' };
    try {
        const res = await axios.post(url, body, {
            timeout: timeoutMs,
            headers: { 'Content-Type': 'application/json', ...headers },
            validateStatus: () => true,
        });
        const data = res.data;
        // Petpooja answers success as "1", 1 or true depending on the API.
        const flag = data?.success ?? data?.status;
        const ok = res.status >= 200 && res.status < 300 && ['1', 1, true, 'true', 'success'].includes(flag);
        const error = ok ? '' : String(data?.message || data?.error || `HTTP ${res.status}`).slice(0, 300);
        return { ok, status: res.status, data, error };
    } catch (err) {
        return { ok: false, status: 0, data: null, error: String(err?.code || err?.message || err).slice(0, 300) };
    }
}

export const credentials = (row) => ({ app_key: row.appKey, app_secret: row.appSecret, access_token: row.accessToken });
