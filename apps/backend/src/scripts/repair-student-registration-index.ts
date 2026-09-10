import dotenv from 'dotenv';

dotenv.config();

import mongoose from 'mongoose';
import Student from '../models/student.model';
import ClassModel from '../models/class.model';

export async function repairStudentRegistrationIndex(): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB connection is not ready');
  }

  const collection = mongoose.connection.collection('studentregistrations');
  const indexes = await collection.indexes();
  const oldIndex = indexes.find((index) => index.name === 'school_1_registrationNumber_1');
  const newIndexName = 'school_registrationNumber_unique';

  // The old sparse index incorrectly indexed explicit null values. Before
  // replacing it, verify that real registration-number strings are already
  // unique so the new partial unique index cannot fail halfway through.
  const duplicates = await collection.aggregate([
    { $match: { registrationNumber: { $type: 'string' } } },
    { $group: { _id: { school: '$school', registrationNumber: '$registrationNumber' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();

  if (duplicates.length > 0) {
    throw new Error(`Refusing index repair: ${duplicates.length} duplicate registration-number group(s) already exist.`);
  }

  if (oldIndex?.name) await collection.dropIndex(oldIndex.name);

  const existingNew = indexes.find((index) => index.name === newIndexName);
  if (!existingNew) {
    await collection.createIndex(
      { school: 1, registrationNumber: 1 },
      {
        unique: true,
        name: newIndexName,
        partialFilterExpression: { registrationNumber: { $type: 'string' } },
      },
    );
  }

  // Older student records may have a class assigned but a null denormalized
  // grade. Backfill it from Class.gradeLevel so the Manage Students screen
  // shows the same grade level that was selected for the class.
  const students = await Student.find({ class: { $ne: null } })
    .select('_id class grade')
    .lean();
  let gradeBackfilled = 0;
  for (const student of students) {
    const cls = await ClassModel.findById(student.class).select('_id gradeLevel').lean();
    if (cls?.gradeLevel === null || cls?.gradeLevel === undefined) continue;
    const grade = String(cls.gradeLevel);
    if (student.grade === grade) continue;
    await Student.updateOne({ _id: student._id }, { $set: { grade } });
    gradeBackfilled += 1;
  }

  console.log(`StudentRegistration index repaired; backfilled grade level for ${gradeBackfilled} student(s).`);
}

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set');
  }

  await mongoose.connect(mongoUri);
  try {
    await repairStudentRegistrationIndex();
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('StudentRegistration index repair failed:', error);
    process.exitCode = 1;
  });
}
