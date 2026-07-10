/**
 * Course Content Controller
 *
 * Handles curriculum building: chapters, lessons, quizzes, and assignments.
 * One content document per course (upsert pattern).
 */
import { Request, Response } from 'express';
export declare const getByCourse: (req: Request, res: Response) => Promise<Response>;
export declare const saveContent: (req: Request, res: Response) => Promise<Response>;
export declare const reorderChapters: (req: Request, res: Response) => Promise<Response>;
export declare const reorderItems: (req: Request, res: Response) => Promise<Response>;
export declare const toggleChapterCollapse: (req: Request, res: Response) => Promise<Response>;
//# sourceMappingURL=course-content.controller.d.ts.map