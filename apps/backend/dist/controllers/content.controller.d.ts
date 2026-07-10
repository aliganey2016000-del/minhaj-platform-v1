import { Request, Response } from 'express';
type ModelName = 'Announcement' | 'News' | 'Event' | 'Gallery';
export declare const getAll: (modelName: ModelName) => (req: Request, res: Response) => Promise<Response>;
export declare const create: (modelName: ModelName) => (req: Request, res: Response) => Promise<Response>;
export declare const update: (modelName: ModelName) => (req: Request, res: Response) => Promise<Response>;
export declare const updateStatus: (modelName: ModelName) => (req: Request, res: Response) => Promise<Response>;
export declare const togglePin: (req: Request, res: Response) => Promise<Response>;
export declare const remove: (modelName: ModelName) => (req: Request, res: Response) => Promise<Response>;
export {};
//# sourceMappingURL=content.controller.d.ts.map