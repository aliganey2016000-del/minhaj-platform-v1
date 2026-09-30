/** Regression: User has no profile path; names are joined via Profile.user. */
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import School from '../models/school.model';
import '../models/department.model';
import StaffAttendance from '../models/staff-attendance.model';
import routes from '../routes/v1/staff-attendance.routes';
import {
  adjustedGeofenceDistance,
  createLivenessChallenge,
  livenessFailure,
  verifyLivenessChallenge,
} from '../utils/teacher-biometric';

async function main() {
  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'smart-attendance-test-secret';

  assert.equal(adjustedGeofenceDistance(117, 20, 25), 72);
  assert.equal(adjustedGeofenceDistance(117, 100, 100), 67);
  assert.equal(adjustedGeofenceDistance(40, 10, 5), 25);

  const challenge = createLivenessChallenge('teacher-test', 'org-test');
  assert.deepEqual(challenge.actions, ['look_straight']);
  const parsedChallenge = verifyLivenessChallenge(challenge.token, 'teacher-test', 'org-test');
  assert.deepEqual(parsedChallenge.actions, ['look_straight']);
  assert.equal(livenessFailure(['look_straight'], {
    sampleCount: 2,
    durationMs: 1200,
    blinkScore: 0,
    turnScore: 0,
    facePresenceRatio: 0.5,
  }), null);
  assert.match(
    livenessFailure(['look_straight'], {
      sampleCount: 0,
      durationMs: 1200,
      blinkScore: 0,
      turnScore: 0,
      facePresenceRatio: 0,
    }) || '',
    /camera/i
  );

  const mongo = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongo.getUri());
    const org = new mongoose.Types.ObjectId();
    const otherOrg = new mongoose.Types.ObjectId();
    await School.collection.insertMany([{ _id: org, name: 'School A' }, { _id: otherOrg, name: 'School B' }]);
    const admin = await User.create({ email: 'admin@test.local', password: 'test', role: 'org_admin', organizationId: org });
    const teacher = await User.create({ email: 'teacher@test.local', password: 'test', role: 'teacher', organizationId: org });
    const staff = await User.create({ email: 'staff@test.local', password: 'test', role: 'staff', organizationId: org });
    const outsider = await User.create({ email: 'other@test.local', password: 'test', role: 'teacher', organizationId: otherOrg });
    await Profile.create({ user: teacher._id, firstName: 'Teacher', lastName: 'One', gender: 'male' });
    await Profile.create({ user: outsider._id, firstName: 'Other', lastName: 'School', gender: 'male' });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      // A stale token must still resolve the current DB organization.
      req.user = { userId: admin._id.toString(), role: 'org_admin', organizationId: otherOrg.toString(), permissions: [] } as any;
      next();
    });
    app.use('/attendance', routes);
    app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || 500).json({ message: err.message }));

    const settings = await request(app).get('/attendance/settings');
    assert.equal(settings.status, 200, JSON.stringify(settings.body));
    assert.equal(settings.body.data.organizationId, org.toString());
    assert.equal(settings.body.data.configured, false);

    const list = await request(app).get('/attendance?date=2026-09-30&organizationId=' + otherOrg);
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.equal(list.body.data.rows.length, 2);
    const teacherRow = list.body.data.rows.find((row: any) => row.staff._id === teacher._id.toString());
    assert.deepEqual(teacherRow.staff.profile, { firstName: 'Teacher', lastName: 'One' });
    const staffRow = list.body.data.rows.find((row: any) => row.staff._id === staff._id.toString());
    assert.equal(staffRow.staff.profile, null);

    const marked = await request(app).post('/attendance').send({ userId: teacher._id.toString(), date: '2026-09-30', status: 'present' });
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    await StaffAttendance.create({ user: outsider._id, organizationId: otherOrg, date: new Date('2026-09-30'), markedBy: admin._id });
    const history = await request(app).get('/attendance/history');
    assert.equal(history.status, 200, JSON.stringify(history.body));
    assert.equal(history.body.data.length, 1);
    assert.deepEqual(history.body.data[0].user.profile, { firstName: 'Teacher', lastName: 'One' });

    const saved = await request(app).put('/attendance/settings').send({
      latitude: 2.04,
      longitude: 45.34,
      locationAccuracyMeters: 18,
      organizationId: otherOrg.toString(),
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.data.organizationId, org.toString());
    assert.equal(saved.body.data.configured, true);
    assert.equal(saved.body.data.locationAccuracyMeters, 18);
    const reloadedSettings = await request(app).get('/attendance/settings');
    assert.equal(reloadedSettings.status, 200, JSON.stringify(reloadedSettings.body));
    assert.equal(reloadedSettings.body.data.locationAccuracyMeters, 18);
    console.log('PASS: settings load/save, GPS accuracy, face presence, geofence math, roster names, history and tenant isolation');
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
