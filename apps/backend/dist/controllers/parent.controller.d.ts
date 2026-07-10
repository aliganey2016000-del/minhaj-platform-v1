/**
 * Parent Controller
 * Full CRUD for parents. Admin only.
 */
import { Request, Response } from 'express';
export declare const getAll: (req: Request, res: Response) => Promise<Response>;
export declare const getById: (req: Request, res: Response) => Promise<Response>;
export declare const create: (req: Request, res: Response) => Promise<Response>;
export declare const update: (req: Request, res: Response) => Promise<Response>;
export declare const remove: (req: Request, res: Response) => Promise<Response>;
export declare const updateStatus: (req: Request, res: Response) => Promise<Response>;
export declare const getChildren: (req: Request, res: Response) => Promise<Response>;
export declare const linkChild: (req: Request, res: Response) => Promise<Response>;
export declare const unlinkChild: (req: Request, res: Response) => Promise<Response>;
//# sourceMappingURL=parent.controller.d.ts.map