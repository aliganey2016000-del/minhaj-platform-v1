"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const course_model_1 = __importDefault(require("../models/course.model"));
const class_model_1 = __importDefault(require("../models/class.model"));
const teacher_model_1 = __importDefault(require("../models/teacher.model"));
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/masjid-al-rahma';
async function migrate() {
    console.log('Connecting to MongoDB...');
    await mongoose_1.default.connect(MONGO_URI);
    console.log('Connected.');
    // -----------------------------------------------------------------------
    // Find all courses
    // -----------------------------------------------------------------------
    const courses = await course_model_1.default.find({}).lean();
    console.log(`Found ${courses.length} courses total.`);
    let updatedCount = 0;
    let skippedCount = 0;
    for (const course of courses) {
        const updates = {};
        let needsUpdate = false;
        // --- school ---
        if (course.school === undefined || course.school === null) {
            // Try to infer school from class
            if (course.class) {
                const classDoc = await class_model_1.default.findById(course.class).select('school').lean();
                if (classDoc?.school) {
                    updates.school = classDoc.school;
                    needsUpdate = true;
                    console.log(`  Course "${course.title?.en || course._id}": inferred school from class`);
                }
            }
            // If still no school, try from teacher
            if (!updates.school && course.teacher) {
                const teacherDoc = await teacher_model_1.default.findById(course.teacher).select('school').lean();
                if (teacherDoc?.school) {
                    updates.school = teacherDoc.school;
                    needsUpdate = true;
                    console.log(`  Course "${course.title?.en || course._id}": inferred school from teacher`);
                }
            }
            // If still no school, explicitly set to null so the field exists
            if (!updates.school) {
                updates.school = null;
                needsUpdate = true;
            }
        }
        // --- class ---
        if (course.class === undefined) {
            updates.class = null;
            needsUpdate = true;
        }
        // --- teacher ---
        if (course.teacher === undefined) {
            updates.teacher = null;
            needsUpdate = true;
        }
        if (needsUpdate) {
            await course_model_1.default.updateOne({ _id: course._id }, { $set: updates });
            updatedCount++;
            console.log(`  Updated course ${course._id}`);
        }
        else {
            skippedCount++;
        }
    }
    console.log('\n--- Migration Complete ---');
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped (already OK): ${skippedCount}`);
    await mongoose_1.default.disconnect();
    console.log('Disconnected.');
    process.exit(0);
}
migrate().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
//# sourceMappingURL=migrate-course-relations.js.map