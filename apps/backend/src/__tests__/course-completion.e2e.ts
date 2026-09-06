/**
 * Course completion regression coverage.
 *
 * Verifies that the final lesson marks Progress completed and persists
 * completedAt without recursively saving the same document.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures++; }
}
function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to in-memory MongoDB:', process.env.MONGODB_URI);

  const { default: Course } = await import('../models/course.model');
  const { default: CourseContent } = await import('../models/course-content.model');
  const { default: Progress } = await import('../models/progress.model');

  const studentId = new mongoose.Types.ObjectId();
  const course = await Course.create({
    title: { en: 'Completion Course' },
    slug: `completion-course-${new mongoose.Types.ObjectId().toString().slice(-8)}`,
    category: 'general', level: 'beginner', duration: 4, maxStudents: 20,
  });
  await CourseContent.create({
    course: course._id,
    chapters: [{
      title: 'Chapter 1', order: 1, status: 'published',
      items: [
        { title: 'Lesson 1', type: 'lesson', order: 1, status: 'published', duration: 10 },
        { title: 'Lesson 2', type: 'lesson', order: 2, status: 'published', duration: 10 },
      ],
    }],
  });

  section('PARTIAL PROGRESS — course remains in progress');
  const progress = await Progress.create({ student: studentId, course: course._id, completedLessons: 1, totalItems: 2 });
  const partial: any = await Progress.collection.findOne({ _id: progress._id });
  assert(partial?.status === 'in_progress', `one of two lessons remains in progress (got ${partial?.status})`);
  assert(!partial?.completedAt, 'partial progress has no completedAt timestamp');

  section('FINAL LESSON — completion status and timestamp persist');
  progress.completedLessons = 2;
  await progress.save();
  const completed: any = await Progress.collection.findOne({ _id: progress._id });
  assert(completed?.status === 'completed', `final lesson marks progress completed (got ${completed?.status})`);
  assert(completed?.completedAt instanceof Date, `completedAt is persisted as a Date (got ${completed?.completedAt})`);
  const firstCompletedAt = completed?.completedAt?.getTime();

  section('REPEAT SAVE — completion timestamp remains stable');
  await progress.save();
  const repeated: any = await Progress.collection.findOne({ _id: progress._id });
  assert(repeated?.status === 'completed', 'repeat save keeps completed status');
  assert(repeated?.completedAt?.getTime() === firstCompletedAt, 'repeat save does not replace completedAt');

  console.log(`\n${'='.repeat(60)}`);
  if (failures === 0) console.log('ALL CHECKS PASSED (0 failures)');
  else console.log(`${failures} CHECK(S) FAILED`);
  console.log('='.repeat(60));

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('FATAL ERROR:', error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
