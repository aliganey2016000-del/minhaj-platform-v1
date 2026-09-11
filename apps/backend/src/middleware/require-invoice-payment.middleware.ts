import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../utils/api-error';

/** Student payments must always be attached to an existing invoice. */
export function requireInvoicePayment(req: Request, _res: Response, next: NextFunction): void {
  const invoiceId = req.body?.invoiceId;
  if (!invoiceId || typeof invoiceId !== 'string' || !invoiceId.trim()) {
    throw new BadRequestError('An invoice must be selected before collecting a student payment. Create an invoice first if none exists.');
  }
  next();
}
