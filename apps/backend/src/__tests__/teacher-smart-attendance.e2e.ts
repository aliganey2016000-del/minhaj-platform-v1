import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../models/user.model';
import Settings from '../models/staff-attendance-settings.model';
import Attendance from '../models/staff-attendance.model';
import Biometric from '../models/teacher-biometric.model';
import * as controller from '../controllers/teacher-smart-attendance.controller';
import * as admin from '../controllers/staff-attendance.controller';
import { createLivenessChallenge, dateLabelInTimezone, validateDescriptor } from '../utils/teacher-biometric';

async function main() {
  process.env.JWT_ACCESS_SECRET = 'attendance-regression-only';
  assert.throws(() => validateDescriptor(Array(128).fill(null)), /invalid/);
  assert.equal(dateLabelInTimezone(new Date('2026-09-30T21:15:00Z'), 'Africa/Mogadishu'), '2026-10-01');
  const mongo = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongo.getUri());
    await Attendance.init(); await Biometric.init(); await Settings.init();
    const organizationId = new mongoose.Types.ObjectId();
    const otherOrg = new mongoose.Types.ObjectId();
    const teacher = await User.create({ email: 'smart@test.local', password: 'test', role: 'teacher', organizationId });
    const manager = await User.create({ email: 'manager@test.local', password: 'test', role: 'org_admin', organizationId });
    const app = express(); app.use(express.json());
    const wrap = (fn: any) => (req: any, res: any, next: any) => Promise.resolve(fn(req, res)).catch(next);
    app.use((req, _res, next) => {
      req.user = { userId: (req.path === '/settings' ? manager : teacher)._id.toString(), role: req.path === '/settings' ? 'org_admin' : 'teacher', organizationId: otherOrg.toString() } as any;
      next();
    });
    app.put('/settings', wrap(admin.updateSettings));
    app.get('/status', wrap(controller.getStatus));
    app.post('/enroll', wrap(controller.enrollFace));
    app.post('/in', wrap(controller.checkIn)); app.post('/out', wrap(controller.checkOut));
    app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || 500).json({ message: err.message }));
    let result = await request(app).put('/settings').send({ latitude: null, longitude: '' });
    assert.equal(result.status, 400);
    result = await request(app).put('/settings').send({ latitude: 2.04, longitude: 45.34, locationAccuracyMeters: 22 });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.data.organizationId, organizationId.toString());
    result = await request(app).put('/settings').send({ enabled: 'false' });
    assert.equal(result.status, 400);
    result = await request(app).put('/settings').send({ radiusMeters: 100 });
    assert.equal(result.status, 200); assert.equal(result.body.data.latitude, 2.04);
    assert.equal(result.body.data.locationAccuracyMeters, 22);
    const proof = () => ({
      consent: true, descriptor: Array(128).fill(0.1), location: { latitude: 2.04, longitude: 45.34, accuracy: 20 },
      challengeToken: createLivenessChallenge(teacher.id, organizationId.toString()).token,
      liveness: { sampleCount: 3, durationMs: 900, blinkScore: 0, turnScore: 0, facePresenceRatio: 1 },
    });
    result = await request(app).post('/enroll').send(proof()); assert.equal(result.status, 200, JSON.stringify(result.body));
    for (const location of [{ latitude: null, longitude: 45.34, accuracy: 20 }, { latitude: 2.04, longitude: 45.34, accuracy: 500 }, { latitude: 3, longitude: 45, accuracy: 10 }]) {
      result = await request(app).post('/in').send({ ...proof(), location }); assert.equal(result.status, 400);
    }
    result = await request(app).post('/in').send({ ...proof(), descriptor: Array(128).fill(0.8) }); assert.equal(result.status, 400);
    result = await request(app).post('/in').send({ ...proof(), challengeToken: createLivenessChallenge(teacher.id, otherOrg.toString()).token }); assert.equal(result.status, 400);
    assert.equal(await Attendance.countDocuments(), 0);
    const ins = await Promise.all([request(app).post('/in').send(proof()), request(app).post('/in').send(proof())]);
    assert.deepEqual(ins.map(r => r.status).sort(), [200, 409]);
    assert.equal(await Attendance.countDocuments(), 1);
    const first = await Attendance.findOne().lean();
    result = await request(app).post('/in').send(proof()); assert.equal(result.status, 409);
    assert.equal((await Attendance.findOne().lean())?.checkInAt?.getTime(), first?.checkInAt?.getTime());
    const outs = await Promise.all([request(app).post('/out').send(proof()), request(app).post('/out').send(proof())]);
    assert.deepEqual(outs.map(r => r.status).sort(), [200, 409]);
    result = await request(app).get('/status'); assert.equal(result.body.data.canCheckOut, false);
    await Attendance.deleteMany({});
    await request(app).put('/settings').send({ enabled: false });
    result = await request(app).post('/in').send(proof()); assert.equal(result.status, 400);
    await request(app).put('/settings').send({ enabled: true, requireLiveness: false });
    result = await request(app).post('/in').send({ ...proof(), challengeToken: undefined, liveness: undefined });
    assert.equal(result.status, 200); assert.equal(result.body.data.verification.livenessVerified, false);
    console.log('PASS: settings, tenant isolation, enrollment, GPS, face mismatch, concurrent check-in/out, disabled settings and timezone');
  } finally { await mongoose.disconnect(); await mongo.stop(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
