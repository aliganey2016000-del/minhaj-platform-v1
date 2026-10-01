import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import School from '../models/school.model';
import { update } from '../controllers/school.controller';

async function main() {
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ZONE_ID;

  const mongo = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongo.getUri());

    const schoolId = new mongoose.Types.ObjectId();
    await School.collection.insertOne({
      _id: schoolId,
      name: 'Domain Clear School',
      slug: 'domain-clear-school',
      subdomain: 'domain-clear',
      customDomain: 'domain-clear.example.com',
      status: 'active',
      institutionType: 'school',
      organizationType: 'school',
      branding: {},
    } as any);

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = {
        userId: new mongoose.Types.ObjectId().toString(),
        role: 'admin',
        permissions: [],
      } as any;
      next();
    });
    app.patch('/schools/:id', (req, res, next) => {
      Promise.resolve(update(req, res)).catch(next);
    });
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    });

    const response = await request(app)
      .patch('/schools/' + schoolId.toString())
      .send({ customDomain: '', name: 'Domain Clear School Updated' });

    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.success, true, JSON.stringify(response.body));
    assert.equal(response.body.data.name, 'Domain Clear School Updated');
    assert.equal(response.body.data.customDomain, undefined);

    const saved = await School.findById(schoolId).lean();
    assert.equal(saved?.customDomain, undefined);
    assert.equal(saved?.subdomain, 'domain-clear');

    console.log('PASS: clearing Custom Domain unsets the field and preserves managed subdomain routing');
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
