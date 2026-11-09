/**
 * Exam seating is scoped per exam period. The original unique indexes on
 * ExamSeatingPlan did not include `period`, so they would stop a student from
 * having a seat in two periods of the same academic year and exam type.
 * Mongoose builds the new period-aware indexes itself; this drops the old
 * ones. Idempotent and safe to run on every boot.
 */
import mongoose from 'mongoose';

const LEGACY_INDEXES = [
  'school_1_academicYear_1_examType_1_student_1',
  'school_1_academicYear_1_examType_1_room_1_deskNumber_1',
];

export async function repairExamSeatingIndexes(): Promise<void> {
  if (mongoose.connection.readyState !== 1) throw new Error('MongoDB connection is not ready');
  const collection = mongoose.connection.collection('examseatingplans');
  let indexes: Array<{ name?: string }> = [];
  try {
    indexes = await collection.indexes();
  } catch {
    return; // Collection does not exist yet — nothing to repair.
  }
  for (const name of LEGACY_INDEXES) {
    if (indexes.some((index) => index.name === name)) await collection.dropIndex(name);
  }
}
