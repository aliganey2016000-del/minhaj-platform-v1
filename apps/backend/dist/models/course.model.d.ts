/**
 * Course Model
 * Islamic educational courses/programs with full multilingual support.
 * Supports syllabus/modules, teacher assignment, enrollment tracking, and fees.
 */
import mongoose, { Document } from 'mongoose';
/** Represents a single module/lesson within a course syllabus. */
export interface IModule {
    week: number;
    title: {
        en: string;
        so: string;
        ar: string;
    };
    description: {
        en: string;
        so: string;
        ar: string;
    };
    resources?: string[];
}
export interface ICourse extends Document {
    _id: mongoose.Types.ObjectId;
    title: {
        en: string;
        so: string;
        ar: string;
    };
    slug: string;
    description: {
        en: string;
        so: string;
        ar: string;
    };
    category: 'quran' | 'fiqh' | 'aqeedah' | 'seerah' | 'arabic' | 'tajweed' | 'hadith' | 'akhlaq';
    level: 'beginner' | 'intermediate' | 'advanced';
    duration: number;
    fee: number;
    teacher: mongoose.Types.ObjectId;
    school?: mongoose.Types.ObjectId;
    class?: mongoose.Types.ObjectId;
    maxStudents: number;
    enrolledStudents: number;
    thumbnail?: string;
    syllabus: IModule[];
    prerequisites: string[];
    status: 'draft' | 'published' | 'archived';
    startDate?: Date;
    endDate?: Date;
    createdAt: Date;
    updatedAt: Date;
}
declare const Course: mongoose.Model<ICourse, {}, {}, {}, mongoose.Document<unknown, {}, ICourse, {}, {}> & ICourse & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default Course;
//# sourceMappingURL=course.model.d.ts.map