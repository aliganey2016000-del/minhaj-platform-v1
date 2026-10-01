import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import School from '../models/school.model';
import WebsiteConfig from '../models/website-config.model';
import { isAllowedOrigin } from '../utils/cors-origins';
import { normalizeSite } from '../controllers/website-management.controller';
import { errorHandler } from '../middleware/error.middleware';

async function main() {
  process.env.JWT_ACCESS_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.JWT_REFRESH_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.BASE_DOMAIN = 'sahaledu.com';
  process.env.NODE_ENV = 'production';
  const { default: routes } = await import('../routes/v1/website-management.routes');
  const { generateAccessToken } = await import('../utils/jwt');
  const mongo = await MongoMemoryServer.create();
  const a = new mongoose.Types.ObjectId();
  const b = new mongoose.Types.ObjectId();
  try {
    await mongoose.connect(mongo.getUri());
    await WebsiteConfig.init();
    await School.collection.insertMany([
      { _id: a, name: 'Balcad School', slug: 'balcad', subdomain: 'balcad', customDomain: 'school.example.edu', status: 'active', branding: {} },
      { _id: b, name: 'Second School', slug: 'second', subdomain: 'second', status: 'active', branding: {} },
    ] as any[]);
    const token = (role = 'org_admin', organizationId = String(a)) => `Bearer ${generateAccessToken({ userId: String(new mongoose.Types.ObjectId()), role, organizationId, permissions: [] })}`;
    const auth = token();
    const app = express();
    app.use(express.json());
    app.use('/website', routes);
    app.use(errorHandler);
    await request(app).get('/website').expect(401);
    await request(app).get('/website').set('Authorization', token('teacher')).expect(403);
    const configs = await Promise.all([1, 2].map(() => request(app).get('/website').set('Authorization', auth).expect(200)));
    assert.equal(await WebsiteConfig.countDocuments({ school: a }), 1);
    const site = configs[0].body.data.draft;
    assert.equal(site.pages[0].sections[0].title, 'Balcad School');
    for (const type of ['news', 'staff', 'partners', 'gallery', 'video']) assert.ok(site.pages[0].sections.some((s: any) => s.type === type));
    await request(app).get(`/website?schoolId=${b}`).set('Authorization', auth).expect(403);
    await request(app).put('/website').set('Authorization', auth).send({ schoolId: b, site }).expect(403);
    await request(app).post('/website/publish').set('Authorization', auth).send({ schoolId: b }).expect(403);
    const publicSite = (host: string) => request(app).get('/website/public/current').set('Host', host);
    assert.equal((await publicSite('balcad.sahaledu.com').expect(200)).body.data.site, null);
    site.header.displayName = 'Balcad Learning Community';
    site.pages[0].sections.find((s: any) => s.type === 'news').visible = true;
    site.pages[0].sections.find((s: any) => s.type === 'news').cards = [{ id: 'event', title: 'Open Day', text: 'Visit us', date: '2026-10-04' }];
    await request(app).put('/website').set('Authorization', auth).send({ site }).expect(200);
    const firstPublish = (await request(app).post('/website/publish').set('Authorization', auth).send({}).expect(200)).body.data.version;
    const live = (await publicSite('balcad.sahaledu.com').expect(200)).body.data.site;
    assert.equal(live.header.displayName, site.header.displayName);
    assert.deepEqual((await publicSite('school.example.edu').expect(200)).body.data.site, live);
    assert.equal((await publicSite('second.sahaledu.com').expect(200)).body.data.site, null);
    site.pages[0].sections[0].title = 'Private new draft';
    await request(app).put('/website').set('Authorization', auth).send({ site }).expect(200);
    assert.equal((await publicSite('balcad.sahaledu.com').expect(200)).body.data.site.pages[0].sections[0].title, 'Balcad School');
    await request(app).post('/website/publish').set('Authorization', auth).send({}).expect(200);
    await request(app).post(`/website/versions/${firstPublish}/rollback`).set('Authorization', token('org_admin', String(b))).send({}).expect(404);
    await request(app).post(`/website/versions/${firstPublish}/rollback`).set('Authorization', auth).send({}).expect(200);
    assert.equal((await publicSite('balcad.sahaledu.com')).body.data.site.pages[0].sections[0].title, 'Balcad School');
    const uploaded = (await request(app).post('/website/media').set('Authorization', auth).attach('file', Buffer.from('test image'), { filename: 'photo.png', contentType: 'image/png' }).expect(200)).body.data;
    assert.ok((await WebsiteConfig.findOne({ school: a }).lean())?.draft.media.some((m) => m.id === uploaded.id));
    assert.equal(normalizeSite({ ...site, header: { ...site.header, ctaUrl: 'javascript:alert(1)' } }, { name: 'School' }).header.ctaUrl, '');
    for (const origin of ['https://balcad.sahaledu.com', 'https://school.example.edu', 'https://second.sahaledu.com']) assert.equal(await isAllowedOrigin(origin), true);
    for (const origin of ['https://unknown.sahaledu.com', 'https://balcad.attacker.example', 'http://balcad.sahaledu.com', 'https://school.example.edu:444', 'null']) assert.equal(await isAllowedOrigin(origin), false);
    await request(app).post('/website/unpublish').set('Authorization', auth).send({}).expect(200);
    assert.equal((await publicSite('balcad.sahaledu.com')).body.data.site, null);
    console.log('PASS: organization authorization, tenant domains, draft isolation, publish, rollback, media persistence and CORS');
  } finally {
    fs.rmSync(`uploads/organization-websites/${a}`, { recursive: true, force: true });
    await mongoose.disconnect();
    await mongo.stop();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
