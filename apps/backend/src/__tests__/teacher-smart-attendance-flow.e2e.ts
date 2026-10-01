import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../models/user.model';
import School from '../models/school.model';
import StaffAttendanceSettings from '../models/staff-attendance-settings.model';
import StaffAttendance from '../models/staff-attendance.model';
import TeacherBiometric from '../models/teacher-biometric.model';
import * as controller from '../controllers/teacher-smart-attendance.controller';
import { createLivenessChallenge, encryptDescriptor } from '../utils/teacher-biometric';

function mountTeacherApp(userId: string, organizationId: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      userId,
      role: 'teacher',
      organizationId,
      permissions: [],
    } as any;
    next();
  });

  const wrap =
    (handler: any) =>
    (req: any, res: any, next: any) =>
      Promise.resolve(handler(req, res)).catch(next);

  app.get('/challenge', wrap(controller.getChallenge));
  app.post('/enroll', wrap(controller.enrollFace));
  app.post('/check-in', wrap(controller.checkIn));
  app.post('/check-out', wrap(controller.checkOut));
  app.get('/status', wrap(controller.getStatus));
  app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.statusCode || 500).json({ message: err.message })
  );
  return app;
}

async function challenge(app: express.Express) {
  const response = await request(app).get('/challenge');
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data.token as string;
}

async function main() {
  process.env.JWT_ACCESS_SECRET =
    process.env.JWT_ACCESS_SECRET || 'teacher-smart-attendance-flow-secret';
  process.env.BIOMETRIC_ENCRYPTION_KEY =
    process.env.BIOMETRIC_ENCRYPTION_KEY || 'teacher-smart-attendance-encryption-secret';

  const mongo = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongo.getUri());

    const organizationId = new mongoose.Types.ObjectId();
    await School.collection.insertOne({
      _id: organizationId,
      name: 'Smart Attendance School',
      status: 'active',
    });

    const teacher = await User.create({
      email: 'smart.teacher@test.local',
      password: 'test',
      role: 'teacher',
      organizationId,
    });

    await StaffAttendanceSettings.create({
      organizationId,
      enabled: true,
      latitude: 2.0357,
      longitude: 45.3103,
      locationAccuracyMeters: 15,
      radiusMeters: 100,
      maxAccuracyMeters: 100,
      faceMatchThreshold: 0.6,
      requireLiveness: true,
      enrollmentRequiresGeofence: true,
      checkOutEnabled: true,
      timezone: 'Africa/Mogadishu',
    });

    const descriptor = Array.from({ length: 128 }, (_, index) => 0.01 + index * 0.00001);
    await TeacherBiometric.create({
      user: teacher._id,
      organizationId,
      ...encryptDescriptor(descriptor),
      modelVersion: 'test-128d',
      enrolledAt: new Date(),
      enrolledBy: teacher._id,
      consentedAt: new Date(),
      verificationCount: 0,
    });

    const app = mountTeacherApp(teacher._id.toString(), organizationId.toString());
    const payloadBase = {
      location: { latitude: 2.0357, longitude: 45.3103, accuracy: 10 },
      liveness: {
        sampleCount: 2,
        durationMs: 1000,
        blinkScore: 0,
        turnScore: 0,
        facePresenceRatio: 0.5,
      },
      descriptor,
      device: 'regression-test',
    };

    const checkInToken = await challenge(app);
    const checkIn = await request(app)
      .post('/check-in')
      .send({ ...payloadBase, challengeToken: checkInToken });
    assert.equal(checkIn.status, 200, JSON.stringify(checkIn.body));
    assert.ok(checkIn.body.data.checkInAt);

    let biometric = await TeacherBiometric.findOne({ user: teacher._id, organizationId }).lean();
    assert.equal(biometric?.verificationCount, 1);

    const duplicateCheckIn = await request(app)
      .post('/check-in')
      .send({ ...payloadBase, challengeToken: checkInToken });
    assert.equal(duplicateCheckIn.status, 409, JSON.stringify(duplicateCheckIn.body));
    biometric = await TeacherBiometric.findOne({ user: teacher._id, organizationId }).lean();
    assert.equal(biometric?.verificationCount, 1);

    const originalBiometricUpdate = (TeacherBiometric as any).updateOne;
    (TeacherBiometric as any).updateOne = async () => {
      throw new Error('simulated metadata write failure');
    };
    const checkOutToken = await challenge(app);
    const checkOut = await request(app)
      .post('/check-out')
      .send({ ...payloadBase, challengeToken: checkOutToken });
    (TeacherBiometric as any).updateOne = originalBiometricUpdate;
    assert.equal(checkOut.status, 200, JSON.stringify(checkOut.body));
    assert.ok(checkOut.body.data.checkOutAt);

    biometric = await TeacherBiometric.findOne({ user: teacher._id, organizationId }).lean();
    assert.equal(biometric?.verificationCount, 1);

    const duplicateCheckOut = await request(app)
      .post('/check-out')
      .send({ ...payloadBase, challengeToken: checkOutToken });
    assert.equal(duplicateCheckOut.status, 409, JSON.stringify(duplicateCheckOut.body));
    biometric = await TeacherBiometric.findOne({ user: teacher._id, organizationId }).lean();
    assert.equal(biometric?.verificationCount, 1);

    const attendanceRows = await StaffAttendance.find({
      user: teacher._id,
      organizationId,
    }).lean();
    assert.equal(attendanceRows.length, 1);

    // When the admin disables enrollment geofencing, the backend must allow
    // enrollment without a GPS payload. The frontend now mirrors this rule.
    await StaffAttendanceSettings.updateOne(
      { organizationId },
      { $set: { enrollmentRequiresGeofence: false } }
    );
    const secondTeacher = await User.create({
      email: 'offsite.enroll@test.local',
      password: 'test',
      role: 'teacher',
      organizationId,
    });
    const secondApp = mountTeacherApp(secondTeacher._id.toString(), organizationId.toString());
    const enrollToken = await challenge(secondApp);
    const enroll = await request(secondApp).post('/enroll').send({
      consent: true,
      challengeToken: enrollToken,
      liveness: payloadBase.liveness,
      descriptor,
      device: 'regression-test',
    });
    assert.equal(enroll.status, 200, JSON.stringify(enroll.body));
    assert.equal(enroll.body.data.enrolled, true);
    assert.equal(enroll.body.data.geofenceVerified, false);

    const thirdTeacher = await User.create({
      email: 'concurrent.enroll@test.local',
      password: 'test',
      role: 'teacher',
      organizationId,
    });
    const thirdApp = mountTeacherApp(thirdTeacher._id.toString(), organizationId.toString());
    const concurrentEnrollment = () => request(thirdApp).post('/enroll').send({
      consent: true,
      challengeToken: createLivenessChallenge(thirdTeacher.id, organizationId.toString()).token,
      liveness: payloadBase.liveness,
      descriptor,
      device: 'regression-test',
    });
    const enrollmentResponses = await Promise.all([concurrentEnrollment(), concurrentEnrollment()]);
    assert.deepEqual(enrollmentResponses.map((response) => response.status).sort(), [200, 409]);
    assert.equal(await TeacherBiometric.countDocuments({ user: thirdTeacher._id, organizationId }), 1);

    console.log(
      'PASS: smart teacher dedupe, metadata failure safety, concurrent enrollment and off-site enrollment setting'
    );
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
