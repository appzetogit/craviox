import test from 'node:test';
import assert from 'node:assert/strict';

import { prisma } from '../../../../config/prisma.js';
import * as appStatus from './appStatus.service.js';

let snapshot = [];

test.before(async () => {
    snapshot = await prisma.foodAppStatus.findMany();
});

test.after(async () => {
    await prisma.foodAppStatus.deleteMany({});
    for (const { app, config } of snapshot) await prisma.foodAppStatus.create({ data: { app, config } });
    await prisma.$disconnect();
});

test('versions compare numerically, missing parts as zero', () => {
    assert.equal(appStatus.compareVersions('1.10.0', '1.9.9'), 1);
    assert.equal(appStatus.compareVersions('1.2', '1.2.0'), 0);
    assert.equal(appStatus.compareVersions('1.1.1', '1.2'), -1);
});

test('an app with no row is live', async () => {
    await prisma.foodAppStatus.deleteMany({ where: { app: 'delivery' } });
    const s = await appStatus.getPublicAppStatus('delivery');
    assert.equal(s.mode, 'live');
    assert.equal(s.update.required, false);
});

test('coming soon hides the access code and honours it as a bypass', async () => {
    await appStatus.updateAppStatus('user', { mode: 'coming_soon', accessCode: 'team-only', launchAt: '2999-01-01T00:00:00Z' });
    const pub = await appStatus.getPublicAppStatus('user');
    assert.equal(pub.mode, 'coming_soon');
    assert.equal(pub.bypass, false);
    assert.equal('accessCode' in pub, false);
    assert.ok(pub.title, 'a default title is filled in');
    assert.equal((await appStatus.getPublicAppStatus('user', { code: 'team-only' })).bypass, true);
    assert.equal((await appStatus.getPublicAppStatus('user', { code: 'guess' })).bypass, false);
});

test('a past launch date takes coming soon live on its own', async () => {
    await appStatus.updateAppStatus('web', { mode: 'coming_soon', launchAt: '2000-01-01T00:00:00Z', autoLiveAtLaunch: true });
    assert.equal((await appStatus.getPublicAppStatus('web')).mode, 'live');
    await appStatus.updateAppStatus('web', { mode: 'coming_soon', launchAt: '2000-01-01T00:00:00Z', autoLiveAtLaunch: false });
    assert.equal((await appStatus.getPublicAppStatus('web')).mode, 'coming_soon');
});

test('builds below the minimum version must update', async () => {
    await appStatus.updateAppStatus('restaurant', {
        mode: 'live',
        update: { minVersion: '1.2.0', latestVersion: '1.3.0', androidUrl: 'https://play.example/app' },
    });
    const old = await appStatus.getPublicAppStatus('restaurant', { version: '1.1.9', platform: 'android' });
    assert.equal(old.update.required, true);
    assert.equal(old.update.storeUrl, 'https://play.example/app');
    const mid = await appStatus.getPublicAppStatus('restaurant', { version: '1.2.5' });
    assert.deepEqual([mid.update.required, mid.update.available], [false, true]);
});

test('bad input is rejected', async () => {
    await assert.rejects(appStatus.updateAppStatus('nope', {}), /Unknown app/);
    await assert.rejects(appStatus.updateAppStatus('user', { mode: 'paused' }), /Mode must be/);
    await assert.rejects(appStatus.updateAppStatus('user', { update: { minVersion: 'v2' } }), /look like/);
    await assert.rejects(appStatus.updateAppStatus('user', { banner: { enabled: true } }), /Banner text/);
});
