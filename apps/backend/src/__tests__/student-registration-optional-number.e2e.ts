import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import StudentRegistration from '../models/student-registration.model';

async function main() {
  const mongod = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongod.getUri());
    const school = new mongoose.Types.ObjectId();
    const user = new mongoose.Types.ObjectId();

    // The Add Student flow saves a draft registration even when no
    // registration number was supplied. Multiple students in one school
    // must therefore be allowed to have an absent registration number.
    const first = await StudentRegistration.create({
      student: new mongoose.Types.ObjectId(), school, organizationType: 'school', createdBy: user,
    });
    const second = await StudentRegistration.create({
      student: new mongoose.Types.ObjectId(), school, organizationType: 'school', createdBy: user,
    });

    assert.equal(first.registrationNumber, undefined);
    assert.equal(second.registrationNumber, undefined);

    await assert.rejects(
      StudentRegistration.create({
        student: new mongoose.Types.ObjectId(), school, organizationType: 'school', createdBy: user,
        registrationNumber: 'REG-001',
      }),
    );
    await StudentRegistration.create({
      student: new mongoose.Types.ObjectId(), school, organizationType: 'school', createdBy: user,
      registrationNumber: 'REG-002',
    });

    console.log('PASS: multiple draft registrations may omit registrationNumber while real numbers remain unique.');
  } finally {
    await mongoose.disconnect();
    await mongod.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
