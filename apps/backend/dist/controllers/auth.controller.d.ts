/**
 * Auth Controller
 * Handles authentication-related HTTP requests:
 * register, login, logout, refresh-token, verify-email,
 * forgot-password, reset-password, change-password.
 */
import { Request, Response } from 'express';
export declare const register: (req: Request, res: Response) => Promise<Response>;
export declare const login: (req: Request, res: Response) => Promise<Response>;
export declare const logout: (req: Request, res: Response) => Promise<Response>;
export declare const refreshToken: (req: Request, res: Response) => Promise<Response>;
export declare const getMe: (req: Request, res: Response) => Promise<Response>;
export declare const updatePreferences: (req: Request, res: Response) => Promise<Response>;
export declare const forgotPassword: (req: Request, res: Response) => Promise<Response>;
export declare const resetPassword: (req: Request, res: Response) => Promise<Response>;
export declare const verifyEmail: (req: Request, res: Response) => Promise<Response>;
export declare const changePassword: (req: Request, res: Response) => Promise<Response>;
//# sourceMappingURL=auth.controller.d.ts.map