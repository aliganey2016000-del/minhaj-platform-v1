import dotenv from 'dotenv';

dotenv.config();

import mongoose from 'mongoose';
import Student from '../models/student.model';
import ClassModel from '../models/class.model';

export interface RepairOptions {
  // When true (the standalone CLI entry point below), a duplicate
  // registration-number group is a fatal error — the operator is running
  // this deliberately and wants to know. When false (the default; used by
  // the boot-time fire-and-forget call in server.ts), a duplicate group
  // must never crash/restart-loop the whole API — log a warning and skip
  // the index swap instead.
  strict?: boolean;
}

export async function repairStudentRegistrationIndex(options: RepairOptions = {}): Promise<void> {
  const { strict = false } = options;

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
    const message = `${duplicates.length} duplicate registration-number group(s) already exist; refusing to swap the index.`;
    if (strict) {
      throw new Error(`Refusing index repair: ${message}`);
    }
    console.warn(`⚠️  StudentRegistration index repair skipped: ${message}`);
  } else {
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
  }

  // Older student records may have a class assigned but a null denormalized
  // grade. Backfill it from Class.gradeLevel so the Manage Students screen
  // shows the same grade level that was selected for the class.
  // Batched to avoid an N+1 ClassModel.findById per student: fetch every
  // referenced class once, then issue a single bulkWrite for the updates.
  const students = await Student.find({ class: { $ne: null } })
    .select('_id class grade')
    .lean();

  const classIds = Array.from(
    new Set(students.map((student) => String(student.class)).filter(Boolean)),
  );
  const classes = await ClassModel.find({ _id: { $in: classIds } })
    .select('_id gradeLevel')
    .lean();
  const gradeByClassId = new Map(
    classes
      .filter((cls) => cls.gradeLevel !== null && cls.gradeLevel !== undefined)
      .map((cls) => [String(cls._id), String(cls.gradeLevel)]),
  );

  const bulkOps = students
    .map((student) => {
      const grade = gradeByClassId.get(String(student.class));
      if (grade === undefined || student.grade === grade) return null;
      return {
        updateOne: {
          filter: { _id: student._id },
          update: { $set: { grade } },
        },
      };
    })
    .filter((op): op is NonNullable<typeof op> => op !== null);

  let gradeBackfilled = 0;
  if (bulkOps.length > 0) {
    const result = await Student.bulkWrite(bulkOps, { ordered: false });
    gradeBackfilled = result.modifiedCount ?? bulkOps.length;
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
    // Standalone CLI run: be strict so an operator running this by hand is
    // told about duplicates instead of them being silently skipped.
    await repairStudentRegistrationIndex({ strict: true });
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
