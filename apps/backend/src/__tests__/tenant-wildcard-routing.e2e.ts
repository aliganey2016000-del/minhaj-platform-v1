import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import School from '../models/school.model';
import { tenantMiddleware } from '../middleware/tenant.middleware';
import {
  managedHostnameForSchool,
  managedWildcardEnabled,
  managedWildcardHostname,
} from '../utils/cloudflare-dns';

async function main() {
  const previousBaseDomain = process.env.BASE_DOMAIN;
  const previousMode = process.env.CLOUDFLARE_MANAGED_SUBDOMAIN_MODE;
  process.env.BASE_DOMAIN = 'sahaledu.com';
  process.env.CLOUDFLARE_MANAGED_SUBDOMAIN_MODE = 'wildcard';

  const mongo = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongo.getUri());

    const schoolId = new mongoose.Types.ObjectId();
    await School.collection.insertOne({
      _id: schoolId,
      name: 'Balcad Test School',
      slug: 'balcad-school',
      subdomain: 'balcad',
      customDomain: 'balcad-example.edu',
      status: 'active',
      institutionType: 'school',
      branding: { themeColor: '#0d9488' },
    } as any);

    assert.equal((await School.findByHost('balcad-example.edu'))?.slug, 'balcad-school');
    assert.equal((await School.findByHost('balcad.sahaledu.com'))?.slug, 'balcad-school');
    assert.equal((await School.findByHost('balcad-school.sahaledu.com'))?.slug, 'balcad-school');

    // Explicit subdomain must win over another organization's slug when the
    // same label exists in both fields.
    await School.collection.insertMany([
      {
        _id: new mongoose.Types.ObjectId(),
        name: 'Explicit Subdomain School',
        slug: 'explicit-subdomain-school',
        subdomain: 'priority-host',
        status: 'active',
        institutionType: 'school',
        branding: {},
      },
      {
        _id: new mongoose.Types.ObjectId(),
        name: 'Legacy Slug School',
        slug: 'priority-host',
        subdomain: 'legacy-slug-school',
        status: 'active',
        institutionType: 'school',
        branding: {},
      },
    ] as any[]);
    assert.equal(
      (await School.findByHost('priority-host.sahaledu.com'))?.slug,
      'explicit-subdomain-school',
    );

    // Managed slugs must never resolve on an unrelated or nested hostname.
    assert.equal(await School.findByHost('balcad.attacker.example'), null);
    assert.equal(await School.findByHost('x.balcad.sahaledu.com'), null);
    assert.equal(await School.findByHost('sahaledu.com'), null);
    assert.equal(await School.findByHost('www.sahaledu.com'), null);

    // Wildcard DNS is the default managed-subdomain strategy.
    assert.equal(managedWildcardEnabled(), true);
    assert.equal(managedWildcardHostname(), '*.sahaledu.com');
    assert.equal(managedHostnameForSchool({ subdomain: 'balcad' }), 'balcad.sahaledu.com');

    process.env.CLOUDFLARE_MANAGED_SUBDOMAIN_MODE = 'per_school';
    assert.equal(managedWildcardEnabled(), false);
    process.env.CLOUDFLARE_MANAGED_SUBDOMAIN_MODE = 'wildcard';

    const app = express();
    app.use(tenantMiddleware);
    app.get('/who', (req, res) => {
      res.json({
        slug: req.tenant?.slug || null,
        subdomain: req.tenant?.subdomain || null,
        customDomain: req.tenant?.customDomain || null,
      });
    });

    const managed = await request(app)
      .get('/who')
      .set('Host', 'api.sahaledu.com')
      .set('X-Tenant-Host', 'balcad.sahaledu.com');
    assert.equal(managed.status, 200, JSON.stringify(managed.body));
    assert.equal(managed.body.slug, 'balcad-school');
    assert.equal(managed.body.subdomain, 'balcad');

    const custom = await request(app)
      .get('/who')
      .set('Host', 'api.sahaledu.com')
      .set('X-Tenant-Host', 'balcad-example.edu');
    assert.equal(custom.status, 200, JSON.stringify(custom.body));
    assert.equal(custom.body.customDomain, 'balcad-example.edu');

    const spoofed = await request(app)
      .get('/who')
      .set('Host', 'api.sahaledu.com')
      .set('X-Tenant-Host', 'balcad.attacker.example');
    assert.equal(spoofed.status, 404, JSON.stringify(spoofed.body));

    const root = await request(app).get('/who').set('Host', 'sahaledu.com');
    assert.equal(root.status, 200, JSON.stringify(root.body));
    assert.equal(root.body.slug, null);

    console.log('PASS: wildcard tenant routing, customDomain -> subdomain -> slug precedence, host isolation and DNS mode');
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
    if (previousBaseDomain === undefined) delete process.env.BASE_DOMAIN;
    else process.env.BASE_DOMAIN = previousBaseDomain;
    if (previousMode === undefined) delete process.env.CLOUDFLARE_MANAGED_SUBDOMAIN_MODE;
    else process.env.CLOUDFLARE_MANAGED_SUBDOMAIN_MODE = previousMode;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
