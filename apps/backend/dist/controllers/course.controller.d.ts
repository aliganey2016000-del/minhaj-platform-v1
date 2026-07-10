/**
 * Course Controller
 * Handles course-related HTTP requests:
 * CRUD operations, enrollment, listing.
 */
import { Request, Response } from 'express';
import '../models/teacher.model';
export declare const getAllPublic: (req: Request, res: Response) => Promise<Response>;
export declare const getAllAdmin: (req: Request, res: Response) => Promise<Response>;
export declare const getBySlug: (req: Request, res: Response) => Promise<Response>;
export declare const getByIdAdmin: (req: Request, res: Response) => Promise<Response>;
export declare const create: (req: Request, res: Response) => Promise<Response>;
export declare const update: (req: Request, res: Response) => Promise<Response>;
export declare const remove: (req: Request, res: Response) => Promise<Response>;
export declare const enrollStudent: (req: Request, res: Response) => Promise<Response>;
export declare const unenrollStudent: (req: Request, res: Response) => Promise<Response>;
export declare const getEnrolledStudents: (req: Request, res: Response) => Promise<Response>;
export declare const selfEnroll: (req: Request, res: Response) => Promise<Response>;
export declare const selfUnenroll: (req: Request, res: Response) => Promise<Response>;
export declare const getAvailableCourses: (req: Request, res: Response) => Promise<Response>;
export declare const getCategories: (_req: Request, res: Response) => Promise<Response>;
//# sourceMappingURL=course.controller.d.ts.map