/**
 * Corrupt student enrollment dates: import parsing + one-time repair script.
 *
 * The legacy student import did `new Date(String(cell))`, turning the Excel
 * serial 46037 (15 Jan 2026) into 1 January of the YEAR 46037, which crashed
 * /students/stats and the dashboard trends. This covers both the parser that
 * now prevents it and src/scripts/repair-corrupt-student-dates.ts that cleans up
 * records already stored that way.
 *
 * Runs against an ephemeral in-memory MongoDB. `npm run test:student-corrupt-dates`.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { parseSpreadsheetDate } from '../utils/spreadsheet-date';

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures++; }
}
const day = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : String(value));

async function main() {
  console.log('\n=== parseSpreadsheetDate ===');
  assert(day(parseSpreadsheetDate(46037)) === '2026-01-15', 'numeric Excel serial becomes the real date');
  assert(day(parseSpreadsheetDate('46037')) === '2026-01-15', 'serial arriving as text (CSV) becomes the real date');
  assert(day(parseSpreadsheetDate('2026-01-15')) === '2026-01-15', 'ISO text still parses');
  assert(parseSpreadsheetDate(new Date('46037')) === undefined, 'a year-46037 Date is rejected instead of stored');
  assert(parseSpreadsheetDate('not a date') === undefined, 'garbage text is rejected');
  assert(parseSpreadsheetDate('') === undefined, 'empty cell is undefined');

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const { default: Student } = await import('../models/student.model');
  const { repairCorruptStudentDates } = await import('../scripts/repair-corrupt-student-dates');

  const now = new Date(Date.UTC(2026, 9, 2));
  const id = () => new mongoose.Types.ObjectId();
  const base = () => ({ user: id(), profile: id(), status: 'active', enrollmentHistory: [] });
  // Write raw documents: these are exactly what the buggy import left behind.
  await Student.collection.insertMany([
    { ...base(), studentId: 'UTC-SERVER', enrollmentDate: new Date(Date.UTC(46037, 0, 1)), createdAt: new Date(Date.UTC(2026, 0, 20)) },
    { ...base(), studentId: 'MOGADISHU-SERVER', enrollmentDate: new Date(Date.UTC(46037, 0, 1) - 3 * 3600_000), createdAt: new Date(Date.UTC(2026, 0, 20)) },
    { ...base(), studentId: 'FUTURE-MIDYEAR', enrollmentDate: new Date(Date.UTC(3000, 5, 15)), createdAt: new Date(Date.UTC(2025, 8, 1)) },
    { ...base(), studentId: 'NO-CREATED-AT', enrollmentDate: new Date(Date.UTC(1800, 5, 15)) },
    { ...base(), studentId: 'HEALTHY', enrollmentDate: new Date(Date.UTC(2025, 8, 1)), createdAt: new Date(Date.UTC(2025, 8, 1)) },
  ]);
  const enrollment = async (studentId: string) => (await Student.collection.findOne({ studentId }))?.enrollmentDate as Date;

  console.log('\n=== dry run ===');
  const dry = await repairCorruptStudentDates(false, now);
  const byId = Object.fromEntries(dry.map((item) => [item.studentId, item]));
  assert(dry.length === 4, `finds the 4 corrupt students, not the healthy one (got ${dry.length})`);
  assert(byId['UTC-SERVER']?.method === 'serial' && day(byId['UTC-SERVER'].fixedValue) === '2026-01-15', 'serial recovered from a UTC server');
  assert(byId['MOGADISHU-SERVER']?.method === 'serial' && day(byId['MOGADISHU-SERVER'].fixedValue) === '2026-01-15', 'serial recovered from a UTC+3 server');
  assert(byId['FUTURE-MIDYEAR']?.method === 'createdAt' && day(byId['FUTURE-MIDYEAR'].fixedValue) === '2025-09-01', 'non-serial value falls back to createdAt');
  assert(byId['NO-CREATED-AT']?.method === 'manual' && byId['NO-CREATED-AT'].fixedValue === null, 'unrecoverable value is left for manual review');
  assert((await enrollment('UTC-SERVER')).getUTCFullYear() === 46037, 'dry run writes nothing');

  console.log('\n=== apply ===');
  await repairCorruptStudentDates(true, now);
  assert(day(await enrollment('UTC-SERVER')) === '2026-01-15', 'UTC-SERVER repaired');
  assert(day(await enrollment('MOGADISHU-SERVER')) === '2026-01-15', 'MOGADISHU-SERVER repaired');
  assert(day(await enrollment('FUTURE-MIDYEAR')) === '2025-09-01', 'FUTURE-MIDYEAR repaired');
  assert((await enrollment('NO-CREATED-AT')).getUTCFullYear() === 1800, 'NO-CREATED-AT untouched');
  assert(day(await enrollment('HEALTHY')) === '2025-09-01', 'HEALTHY untouched');

  const again = await repairCorruptStudentDates(true, now);
  assert(again.length === 1 && again[0].studentId === 'NO-CREATED-AT', 're-running only reports the manual case');

  const stats = await Student.aggregate([{ $group: { _id: { $dateToString: { format: '%Y-%m', date: '$enrollmentDate' } }, count: { $sum: 1 } } }]).catch((error) => error);
  assert(Array.isArray(stats), 'the $dateToString aggregation used by /students/stats no longer fails');

  await mongoose.disconnect();
  await mongod.stop();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CORRUPT-DATE CHECKS PASSED (0 failures)');
  process.exit(failures ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
