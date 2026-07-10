/**
 * Course Content Model
 *
 * Stores the curriculum for a course: chapters containing lessons, quizzes,
 * and assignments. Supports drag-and-drop ordering.
 */
import mongoose, { Document } from 'mongoose';
export interface ILesson {
    _id?: mongoose.Types.ObjectId;
    title: string;
    type: 'lesson';
    content?: string;
    videoUrl?: string;
    videoDuration?: number;
    featuredImage?: string;
    attachments: {
        name: string;
        url: string;
        type: string;
        size?: number;
    }[];
    order: number;
    status: 'draft' | 'published';
    duration: number;
    createdAt?: Date;
    updatedAt?: Date;
}
export interface IQuizQuestion {
    question: string;
    options: string[];
    correctIndex: number;
    explanation?: string;
}
export interface IQuiz {
    _id?: mongoose.Types.ObjectId;
    title: string;
    type: 'quiz';
    description?: string;
    questions: IQuizQuestion[];
    passingScore: number;
    timeLimit?: number;
    order: number;
    status: 'draft' | 'published';
    duration: number;
    createdAt?: Date;
    updatedAt?: Date;
}
export interface IAssignmentItem {
    _id?: mongoose.Types.ObjectId;
    title: string;
    type: 'assignment';
    description?: string;
    instructions?: string;
    dueDate?: Date;
    maxScore: number;
    allowedFileTypes?: string[];
    attachments: {
        name: string;
        url: string;
        type: string;
        size?: number;
    }[];
    order: number;
    status: 'draft' | 'published';
    duration: number;
    createdAt?: Date;
    updatedAt?: Date;
}
export type ChapterItem = ILesson | IQuiz | IAssignmentItem;
export interface IChapter {
    _id?: mongoose.Types.ObjectId;
    title: string;
    description?: string;
    order: number;
    status: 'draft' | 'published';
    collapsed?: boolean;
    items: ChapterItem[];
    createdAt?: Date;
    updatedAt?: Date;
}
export interface ICourseContent extends Document {
    course: mongoose.Types.ObjectId;
    chapters: IChapter[];
    totalDuration: number;
    totalLessons: number;
    totalQuizzes: number;
    totalAssignments: number;
    lastSaved: Date;
    createdAt: Date;
    updatedAt: Date;
}
declare const CourseContent: mongoose.Model<ICourseContent, {}, {}, {}, mongoose.Document<unknown, {}, ICourseContent, {}, {}> & ICourseContent & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default CourseContent;
//# sourceMappingURL=course-content.model.d.ts.map