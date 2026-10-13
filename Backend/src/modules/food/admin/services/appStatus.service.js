import { prisma } from '../../../../config/prisma.js';
import { ValidationError } from '../../../../core/auth/errors.js';

/**
 * Launch state for each client app, set from the admin panel and read by the
 * apps before they show anything else.
 *
 *   user        customer Flutter app
 *   web         customer website (craviox.com)
 *   restaurant  restaurant partner app
 *   delivery    delivery partner app
 *
 * mode: live | coming_soon | maintenance. A coming-soon app with
 * autoLiveAtLaunch goes live by itself once launchAt passes, so a launch does
 * not depend on someone flipping a switch at midnight.
 *
 * accessCode lets the team use an app that is still gated. It is never sent
 * in the public response; the app sends the code and gets back `bypass`.
 */
export const APPS = ['user', 'web', 'restaurant', 'delivery'];
export const MODES = ['live', 'coming_soon', 'maintenance'];
const TONES = ['info', 'success', 'warning'];

const DEFAULTS = {
    mode: 'live',
    title: '',
    message: '',
    imageUrl: '',
    launchAt: null,
    showCountdown: true,
    autoLiveAtLaunch: true,
    accessCode: '',
    contactEmail: '',
    contactPhone: '',
    update: {
        minVersion: '',
        latestVersion: '',
        message: '',
        androidUrl: '',
        iosUrl: '',
    },
    banner: {
        enabled: false,
        text: '',
        link: '',
        tone: 'info',
    },
};

const DEFAULT_TITLES = {
    coming_soon: 'Something delicious is coming soon',
    maintenance: "We'll be right back",
};

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const isVersion = (v) => /^\d+(\.\d+){0,3}$/.test(v);

/** -1, 0 or 1. Missing parts count as 0, so "1.2" equals "1.2.0". */
export function compareVersions(a, b) {
    const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d) return d > 0 ? 1 : -1;
    }
    return 0;
}

function assertApp(app) {
    if (!APPS.includes(app)) throw new ValidationError(`Unknown app "${app}". Use one of: ${APPS.join(', ')}`);
}

/** Stored JSON merged over the defaults, so older rows gain new fields. */
function withDefaults(config) {
    const c = config && typeof config === 'object' ? config : {};
    return {
        ...DEFAULTS,
        ...c,
        update: { ...DEFAULTS.update, ...(c.update || {}) },
        banner: { ...DEFAULTS.banner, ...(c.banner || {}) },
    };
}

function validate(input = {}) {
    const c = withDefaults(input);
    const mode = str(c.mode, 20);
    if (!MODES.includes(mode)) throw new ValidationError(`Mode must be one of: ${MODES.join(', ')}`);

    let launchAt = null;
    if (c.launchAt) {
        const d = new Date(c.launchAt);
        if (Number.isNaN(d.getTime())) throw new ValidationError('Launch date is not a valid date');
        launchAt = d.toISOString();
    }

    const update = {
        minVersion: str(c.update.minVersion, 20),
        latestVersion: str(c.update.latestVersion, 20),
        message: str(c.update.message, 300),
        androidUrl: str(c.update.androidUrl, 500),
        iosUrl: str(c.update.iosUrl, 500),
    };
    for (const key of ['minVersion', 'latestVersion']) {
        if (update[key] && !isVersion(update[key])) {
            throw new ValidationError(`${key === 'minVersion' ? 'Minimum' : 'Latest'} version must look like 1.2.3`);
        }
    }
    if (update.minVersion && update.latestVersion && compareVersions(update.minVersion, update.latestVersion) > 0) {
        throw new ValidationError('Minimum version cannot be newer than the latest version');
    }

    const tone = str(c.banner.tone, 20);
    const banner = {
        enabled: Boolean(c.banner.enabled),
        text: str(c.banner.text, 200),
        link: str(c.banner.link, 500),
        tone: TONES.includes(tone) ? tone : 'info',
    };
    if (banner.enabled && !banner.text) throw new ValidationError('Banner text is required when the banner is on');

    return {
        mode,
        title: str(c.title, 120),
        message: str(c.message, 1000),
        imageUrl: str(c.imageUrl, 500),
        launchAt,
        showCountdown: Boolean(c.showCountdown),
        autoLiveAtLaunch: Boolean(c.autoLiveAtLaunch),
        accessCode: str(c.accessCode, 64),
        contactEmail: str(c.contactEmail, 120),
        contactPhone: str(c.contactPhone, 30),
        update,
        banner,
    };
}

async function loadAll() {
    const rows = await prisma.foodAppStatus.findMany();
    const byApp = Object.fromEntries(rows.map((r) => [r.app, r]));
    return APPS.map((app) => ({
        app,
        config: withDefaults(byApp[app]?.config),
        updatedAt: byApp[app]?.updatedAt || null,
    }));
}

/** Admin view: every app, including the access codes. */
export async function listAppStatus() {
    return loadAll();
}

export async function updateAppStatus(app, input) {
    assertApp(app);
    const config = validate(input);
    const row = await prisma.foodAppStatus.upsert({
        where: { app },
        create: { app, config },
        update: { config },
    });
    return { app, config: withDefaults(row.config), updatedAt: row.updatedAt };
}

/**
 * What an app needs at startup. `version` and `platform` (android/ios) are
 * optional; with them the answer says whether this build must update.
 */
export async function getPublicAppStatus(app, { code = '', version = '', platform = '' } = {}) {
    assertApp(app);
    const row = await prisma.foodAppStatus.findUnique({ where: { app } });
    const c = withDefaults(row?.config);
    const now = new Date();

    let mode = c.mode;
    const launched = c.launchAt && new Date(c.launchAt) <= now;
    if (mode === 'coming_soon' && c.autoLiveAtLaunch && launched) mode = 'live';

    const bypass = mode !== 'live' && Boolean(c.accessCode) && str(code, 64) === c.accessCode;

    const v = str(version, 20);
    const known = isVersion(v);
    const p = str(platform, 10).toLowerCase();
    const storeUrl = p === 'ios' ? c.update.iosUrl : p === 'android' ? c.update.androidUrl : '';

    return {
        app,
        mode,
        bypass,
        title: c.title || DEFAULT_TITLES[mode] || '',
        message: c.message,
        imageUrl: c.imageUrl,
        launchAt: mode === 'coming_soon' ? c.launchAt : null,
        showCountdown: c.showCountdown,
        contactEmail: c.contactEmail,
        contactPhone: c.contactPhone,
        update: {
            minVersion: c.update.minVersion,
            latestVersion: c.update.latestVersion,
            message: c.update.message,
            androidUrl: c.update.androidUrl,
            iosUrl: c.update.iosUrl,
            storeUrl,
            required: Boolean(known && c.update.minVersion && compareVersions(v, c.update.minVersion) < 0),
            available: Boolean(known && c.update.latestVersion && compareVersions(v, c.update.latestVersion) < 0),
        },
        banner: c.banner.enabled ? c.banner : { ...c.banner, enabled: false },
        serverTime: now.toISOString(),
    };
}
