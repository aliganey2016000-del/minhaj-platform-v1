import { Request, Response } from 'express';
export declare const getMyNotifications: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const markAsRead: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const markAllRead: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const remove: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const create: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=notification.controller.d.ts.map