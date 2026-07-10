/**
 * Student Controller
 * Handles student-related HTTP requests:
 * CRUD operations, profile access, parent tracking,
 * attendance, results, and payment lookups.
 */
import { Request, Response } from 'express';
export declare const getAll: (req: Request, res: Response) => Promise<Response>;
export declare const getById: (req: Request, res: Response) => Promise<Response>;
export declare const create: (req: Request, res: Response) => Promise<Response>;
export declare const update: (req: Request, res: Response) => Promise<Response>;
export declare const updateStatus: (req: Request, res: Response) => Promise<Response>;
export declare const remove: (req: Request, res: Response) => Promise<Response>;
export declare const getMyDashboard: (req: Request, res: Response) => Promise<Response>;
export declare const getCourses: (req: Request, res: Response) => Promise<Response>;
export declare const getMyCourses: (req: Request, res: Response) => Promise<Response>;
export declare const getAttendance: (req: Request, res: Response) => Promise<Response>;
export declare const getResults: (req: Request, res: Response) => Promise<Response>;
export declare const getPayments: (req: Request, res: Response) => Promise<Response>;
export declare const getCertificates: (_req: Request, res: Response) => Promise<Response>;
export declare const bulkImport: (_req: Request, _res: Response) => Promise<Response>;
export declare const exportStudents: (_req: Request, _res: Response) => Promise<Response>;
export declare const approve: (req: Request, res: Response) => Promise<Response>;
export declare const reject: (req: Request, res: Response) => Promise<Response>;
//# sourceMappingURL=student.controller.d.ts.map