/**
 * Migration: Backfill missing school, class, and teacher on existing courses.
 *
 * Usage: npx ts-node src/scripts/migrate-course-relations.ts
 *
 * This script ensures all courses have school/class/teacher fields set
 * (even if null). For courses that have a class but no school, it infers
 * the school from the class. For courses with a teacher but no school, it
 * infers from the teacher's school.
 */
export {};
//# sourceMappingURL=migrate-course-relations.d.ts.map