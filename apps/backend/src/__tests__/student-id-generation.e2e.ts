import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Student from '../models/student.model';

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    await Student.deleteMany({});

    const school = new mongoose.Types.ObjectId();
    const year = new Date().getFullYear();

    // Reproduce the production failure: there are 18 existing students, but
    // the highest ID is 0019. The old count + 1 algorithm therefore tried to
    // reuse 0019 and hit the unique (school, studentId) index.
    for (let sequence = 1; sequence <= 17; sequence += 1) {
      await Student.create({
        user: new mongoose.Types.ObjectId(),
        profile: new mongoose.Types.ObjectId(),
        school,
        studentId: `STU-${year}-${String(sequence).padStart(4, '0')}`,
      });
    }

    await Student.create({
      user: new mongoose.Types.ObjectId(),
      profile: new mongoose.Types.ObjectId(),
      school,
      studentId: `STU-${year}-0019`,
    });

    const generated = await Student.create({
      user: new mongoose.Types.ObjectId(),
      profile: new mongoose.Types.ObjectId(),
      school,
    });

    assert.equal(generated.studentId, `STU-${year}-0020`);
    console.log('PASS: automatic student ID skips an existing high sequence value.');
  } finally {
    await mongoose.disconnect();
    await mongod.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
