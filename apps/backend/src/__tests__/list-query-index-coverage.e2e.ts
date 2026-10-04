/**
 * Round 10 audit: index coverage for tenant-scoped list/pagination queries.
 *
 * Several admin "list" endpoints filter by {school/tenant, status} and
 * always sort by createdAt desc for pagination, but the schema had no
 * compound index covering that filter+sort combination — only single-field
 * or filter-only indexes. At scale this forces either a full collection
 * scan or a blocking in-memory sort on every page:
 *
 *   - GET /teachers              (teacher.controller.ts)        -> Teacher.find({school, status}).sort({createdAt:-1})
 *   - GET /classes               (class.controller.ts)          -> ClassModel.find({school, status}).sort({createdAt:-1})
 *   - GET /fee-structures        (fee-structure.controller.ts)  -> FeeStructure.find({school, isActive}).sort({createdAt:-1})
 *   - GET /announcements|news|events|gallery (content.controller.ts, shared)
 *                                                                -> Model.find({school, status}).sort({createdAt:-1})
 *
 * This does not try to prove query-plan improvement via explain() (FerretDB
 * does not support that the way real MongoDB does) — it proves each index
 * is declared on the schema AND actually gets created in the database.
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

import { startTestDb } from './support/test-db';

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures += 1; }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }

/** True if `model`'s schema declares an index whose key is exactly `key` (field order matters). */
function hasDeclaredIndex(model: any, key: Record<string, 1 | -1>): boolean {
  const wanted = JSON.stringify(key);
  return model.schema.indexes().some(([spec]: any) => JSON.stringify(spec) === wanted);
}

/** True if the live collection has an index whose key matches `key` (field order matters). */
async function hasBuiltIndex(model: any, key: Record<string, 1 | -1>): Promise<boolean> {
  const wanted = JSON.stringify(key);
  const indexes = await model.collection.getIndexes({ full: true } as any) as any[];
  return (indexes as any[]).some((index: any) => JSON.stringify(index.key) === wanted);
}

async function main() {
  const db = await startTestDb('list-query-index-coverage');
  try {
    const { default: Teacher } = await import('../models/teacher.model');
    const { default: ClassModel } = await import('../models/class.model');
    const { default: FeeStructure } = await import('../models/fee-structure.model');
    const { default: Announcement } = await import('../models/announcement.model');
    const { default: News } = await import('../models/news.model');
    const { default: Event } = await import('../models/event.model');
    const { default: Gallery } = await import('../models/gallery.model');

    const cases: Array<{ label: string; model: any; key: Record<string, 1 | -1> }> = [
      { label: 'Teacher {school,status,createdAt}', model: Teacher, key: { school: 1, status: 1, createdAt: -1 } },
      { label: 'Class {school,status,createdAt}', model: ClassModel, key: { school: 1, status: 1, createdAt: -1 } },
      { label: 'FeeStructure {school,isActive,createdAt}', model: FeeStructure, key: { school: 1, isActive: 1, createdAt: -1 } },
      { label: 'Announcement {school,status,createdAt}', model: Announcement, key: { school: 1, status: 1, createdAt: -1 } },
      { label: 'News {school,status,createdAt}', model: News, key: { school: 1, status: 1, createdAt: -1 } },
      { label: 'Event {school,status,createdAt}', model: Event, key: { school: 1, status: 1, createdAt: -1 } },
      { label: 'Gallery {school,status,createdAt}', model: Gallery, key: { school: 1, status: 1, createdAt: -1 } },
    ];

    section('Compound index is declared on the schema');
    for (const { label, model, key } of cases) {
      assert(hasDeclaredIndex(model, key), `${label} is declared`);
    }

    section('Compound index is actually created in the database');
    for (const { label, model } of cases) {
      await model.syncIndexes();
    }
    for (const { label, model, key } of cases) {
      assert(await hasBuiltIndex(model, key), `${label} exists on the live collection`);
    }
  } finally {
    await db.stop();
  }

  if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll list-query index coverage checks passed');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
