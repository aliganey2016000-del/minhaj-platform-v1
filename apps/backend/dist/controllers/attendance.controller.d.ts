/**
 * Attendance Controller
 * Mark attendance, get records by course/student, generate reports
 */
import { Request, Response } from 'express';
export declare const markBulk: (req: Request, res: Response) => Promise<Response>;
export declare const getByCourseAndDate: (req: Request, res: Response) => Promise<Response>;
export declare const getStudentSummary: (req: Request, res: Response) => Promise<Response>;
export declare const getMyAttendance: (req: Request, res: Response) => Promise<Response>;
export declare const getCourseReport: (req: Request, res: Response) => Promise<Response>;
//# sourceMappingURL=attendance.controller.d.ts.map