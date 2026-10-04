import assert from 'node:assert/strict';
import dnsPromises from 'dns/promises';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { startTestDb } from './support/test-db';
import School from '../models/school.model';
import WebsiteConfig from '../models/website-config.model';
import { tenantMiddleware } from '../middleware/tenant.middleware';
import { update } from '../controllers/school.controller';
import { getRobots, getSitemap, verifyCustomDomain } from '../controllers/website-advanced.controller';
import { normalizeSite, buildDefaultSite } from '../controllers/website-management.controller';

function app(role: 'admin' | 'org_admin', organizationId?: string) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    req.user = { userId: new mongoose.Types.ObjectId().toString(), role, organizationId, permissions: [] } as any;
    next();
  });
  a.patch('/schools/:id', (req, res, next) => { Promise.resolve(update(req, res)).catch(next); });
  a.post('/domain/verify', (req, res, next) => { Promise.resolve(verifyCustomDomain(req, res)).catch(next); });
  a.get('/sitemap.xml', tenantMiddleware, (req, res, next) => { Promise.resolve(getSitemap(req, res)).catch(next); });
  a.get('/robots.txt', tenantMiddleware, (req, res, next) => { Promise.resolve(getRobots(req, res)).catch(next); });
  a.get('/whoami', tenantMiddleware, (req, res) => { res.json({ slug: req.tenant?.slug ?? null }); });
  a.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  });
  return a;
}

async function main() {
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.TENANT_PROXY_SECRET;
  process.env.BASE_DOMAIN = 'sahaledu.com';

  const db = await startTestDb('custom-domain-verification');
  try {

    const base = { status: 'active', institutionType: 'school', branding: {} };
    const legacyId = new mongoose.Types.ObjectId();
    const orgId = new mongoose.Types.ObjectId();
    await School.collection.insertMany([
      // Legacy org: customDomain set before the verification flag existed.
      { _id: legacyId, name: 'Legacy', slug: 'legacy', subdomain: 'legacy', customDomain: 'legacy.example.edu', ...base },
      { _id: orgId, name: 'Org', slug: 'org', subdomain: 'org', ...base },
    ] as any);

    // 1. Grandfathered domains keep resolving.
    assert.equal((await School.findByHost('legacy.example.edu'))?.slug, 'legacy');

    // 2. org_admin claiming a domain => unverified, does not resolve, token issued.
    let res = await request(app('org_admin', orgId.toString()))
      .patch(`/schools/${orgId}`)
      .send({ customDomain: 'Claimed.Example.com', customDomainVerified: true });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const claimed = await School.findById(orgId).select('+customDomainVerificationToken').lean();
    assert.equal(claimed?.customDomain, 'claimed.example.com');
    assert.equal(claimed?.customDomainVerified, false, 'client-supplied verified flag must be ignored');
    assert.ok(claimed?.customDomainVerificationToken);
    assert.equal(await School.findByHost('claimed.example.com'), null);
    assert.equal((await School.findByHost('org.sahaledu.com'))?.slug, 'org');

    // 3. Unverified custom domain => sitemap/robots/portal use managed host.
    await WebsiteConfig.create({
      school: orgId,
      updatedBy: new mongoose.Types.ObjectId(),
      isPublished: true,
      published: normalizeSite(buildDefaultSite({ name: 'Org', slug: 'org' } as any), { name: 'Org', slug: 'org' } as any),
      draft: buildDefaultSite({ name: 'Org', slug: 'org' } as any),
    } as any);
    res = await request(app('admin'))
      .get('/sitemap.xml')
      .set('X-Tenant-Host', 'org.sahaledu.com')
      .set('X-Forwarded-Host', 'evil.example');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('https://org.sahaledu.com'), res.text);
    assert.ok(!res.text.includes('evil.example'));
    res = await request(app('admin')).get('/robots.txt').set('X-Tenant-Host', 'org.sahaledu.com');
    assert.ok(res.text.includes('Sitemap: https://org.sahaledu.com/sitemap.xml'));

    // 4. Verify fails without the TXT record, succeeds with it.
    const originalResolveTxt = dnsPromises.resolveTxt;
    try {
      (dnsPromises as any).resolveTxt = async () => { throw new Error('ENOTFOUND'); };
      res = await request(app('org_admin', orgId.toString())).post('/domain/verify').send({});
      assert.equal(res.status, 400, JSON.stringify(res.body));
      assert.ok(res.body.message.includes('_minhaj-verify.claimed.example.com'));

      (dnsPromises as any).resolveTxt = async (name: string) => {
        assert.equal(name, '_minhaj-verify.claimed.example.com');
        return [[claimed!.customDomainVerificationToken!.slice(0, 10), claimed!.customDomainVerificationToken!.slice(10)]];
      };
      res = await request(app('org_admin', orgId.toString())).post('/domain/verify').send({});
      assert.equal(res.status, 200, JSON.stringify(res.body));
    } finally {
      (dnsPromises as any).resolveTxt = originalResolveTxt;
    }
    assert.equal((await School.findByHost('claimed.example.com'))?.slug, 'org');
    res = await request(app('admin')).get('/sitemap.xml').set('X-Tenant-Host', 'claimed.example.com');
    assert.ok(res.text.includes('https://claimed.example.com'), res.text);

    // 5. Platform admin setting a domain is verified immediately.
    res = await request(app('admin'))
      .patch(`/schools/${legacyId}`)
      .send({ customDomain: 'admin-set.example.edu' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal((await School.findByHost('admin-set.example.edu'))?.slug, 'legacy');

    // 6. Clearing the domain removes verification state.
    res = await request(app('admin')).patch(`/schools/${legacyId}`).send({ customDomain: '' });
    assert.equal(res.status, 200);
    const cleared = await School.findById(legacyId).lean();
    assert.equal(cleared?.customDomainVerified, undefined);

    // 7. Forwarded host headers are ignored unless the proxy secret matches.
    process.env.TENANT_PROXY_SECRET = 's3cret';
    try {
      res = await request(app('admin')).get('/whoami').set('Host', 'org.sahaledu.com').set('X-Tenant-Host', 'legacy.sahaledu.com');
      assert.equal(res.body.slug, 'org', 'spoofed X-Tenant-Host must be ignored without the secret');
      res = await request(app('admin'))
        .get('/whoami')
        .set('Host', 'api.internal')
        .set('X-Tenant-Host', 'legacy.sahaledu.com')
        .set('X-Tenant-Proxy-Secret', 's3cret');
      assert.equal(res.body.slug, 'legacy');
    } finally {
      delete process.env.TENANT_PROXY_SECRET;
    }

    console.log('PASS: custom domain verification, canonical sitemap host and tenant header trust');
  } finally {
    await db.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
