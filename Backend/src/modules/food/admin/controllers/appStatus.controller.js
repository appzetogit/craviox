import { sendResponse } from '../../../../utils/response.js';
import * as appStatusService from '../services/appStatus.service.js';

export async function listAppStatus(req, res, next) {
    try {
        const apps = await appStatusService.listAppStatus();
        return sendResponse(res, 200, 'App status fetched successfully', { apps });
    } catch (error) {
        next(error);
    }
}

export async function updateAppStatus(req, res, next) {
    try {
        const result = await appStatusService.updateAppStatus(String(req.params.app || ''), req.body || {});
        return sendResponse(res, 200, 'App status updated successfully', result);
    } catch (error) {
        next(error);
    }
}

/** Public: read by every app at startup, before sign-in. */
export async function getPublicAppStatus(req, res, next) {
    try {
        const status = await appStatusService.getPublicAppStatus(String(req.params.app || ''), {
            code: req.query.code,
            version: req.query.version,
            platform: req.query.platform,
        });
        // A switch to maintenance must reach apps at once, not after a cache expires.
        res.set('Cache-Control', 'no-store');
        return sendResponse(res, 200, 'App status fetched successfully', status);
    } catch (error) {
        next(error);
    }
}
