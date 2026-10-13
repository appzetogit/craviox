import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';

import { prisma } from '../../config/prisma.js';
import * as careers from './careers.service.js';

const TAG = `t${Date.now()}`;
const pdf = (size = 200) => {
    const buffer = Buffer.alloc(size, 0x20);
    buffer.write('%PDF-1.4');
    return { buffer, originalname: 'cv.pdf', mimetype: 'application/pdf' };
};
const person = (n) => ({ name: 'Test Applicant', email: `${TAG}-${n}@example.com`, phone: '9876543210' });

test.after(async () => {
    const apps = await prisma.careerApplication.findMany({ where: { email: { startsWith: TAG } } });
    for (const a of apps) await careers.adminDeleteApplication(a.id);
    await prisma.careerJob.deleteMany({ where: { title: { startsWith: TAG } } });
    await prisma.$disconnect();
});

test('jobs get unique slugs and only open ones are public', async () => {
    const a = await careers.adminCreateJob({ title: `${TAG} Delivery Ops Lead`, requirements: 'Two wheeler\n\nHindi' });
    const b = await careers.adminCreateJob({ title: `${TAG} Delivery Ops Lead` });
    assert.notEqual(a.slug, b.slug);
    assert.deepEqual(a.requirements, ['Two wheeler', 'Hindi']);

    await careers.adminUpdateJob(b.id, { isActive: false });
    const open = (await careers.listOpenJobs()).map((j) => j.id);
    assert.ok(open.includes(a.id));
    assert.ok(!open.includes(b.id));
    await assert.rejects(careers.getOpenJob(b.slug), /no longer open/);
});

test('an application needs real contact details and a real resume', async () => {
    await assert.rejects(careers.submitApplication({ ...person(1), email: 'nope' }, pdf()), /valid email/);
    await assert.rejects(careers.submitApplication({ ...person(1), phone: '12' }, pdf()), /phone/);
    await assert.rejects(careers.submitApplication(person(1), null), /attach your resume/);
    const fake = { buffer: Buffer.from('MZ not a pdf'), originalname: 'cv.pdf', mimetype: 'application/pdf' };
    await assert.rejects(careers.submitApplication(person(1), fake), /PDF or Word/);
    await assert.rejects(careers.submitApplication(person(1), pdf(careers.MAX_RESUME_BYTES + 1)), /5 MB/);
});

test('a valid application is stored privately and can be downloaded by an admin', async () => {
    const job = await careers.adminCreateJob({ title: `${TAG} Kitchen Partner Manager` });
    const { id } = await careers.submitApplication({ ...person(2), jobId: job.id }, pdf());

    const list = await careers.adminListApplications({ search: `${TAG}-2` });
    assert.equal(list.total, 1);
    assert.equal(list.items[0].jobTitle, job.title);
    assert.equal(list.items[0].hasResume, true);
    assert.equal('resumePath' in list.items[0], false, 'the storage path is never sent to the client');

    const file = await careers.adminResumeFile(id);
    assert.ok((await fs.readFile(file.path)).subarray(0, 4).equals(Buffer.from('%PDF')));

    await assert.rejects(careers.submitApplication({ ...person(2), jobId: job.id }, pdf()), /already have your application/);

    const updated = await careers.adminUpdateApplication(id, { status: 'shortlisted', adminNote: 'Call Monday' });
    assert.equal(updated.status, 'shortlisted');
    await assert.rejects(careers.adminUpdateApplication(id, { status: 'maybe' }), /Status must be/);
});

test('deleting a job keeps its applications as history', async () => {
    const job = await careers.adminCreateJob({ title: `${TAG} Temp Role` });
    const { id } = await careers.submitApplication({ ...person(3), jobId: job.id }, pdf());
    await careers.adminDeleteJob(job.id);
    const app = await prisma.careerApplication.findUnique({ where: { id } });
    assert.equal(app.jobId, null);
    assert.equal(app.jobTitle, job.title);
});
