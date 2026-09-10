import { Request, Response } from 'express';
import mongoose from 'mongoose';
import WhatsAppTemplate from '../models/whatsapp-template.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';

function organizationId(req: Request) {
  return String((req.user as any)?.organizationId || '').trim();
}

export const list = async (req: Request, res: Response): Promise<Response> => {
  const org = organizationId(req);
  if (!mongoose.isValidObjectId(org)) throw new BadRequestError('A valid organization is required');
  const items = await WhatsAppTemplate.find({ organization: org }).sort({ name: 1 }).lean();
  return ApiResponse.success(res, items);
};

export const create = async (req: Request, res: Response): Promise<Response> => {
  const org = organizationId(req);
  if (!mongoose.isValidObjectId(org)) throw new BadRequestError('A valid organization is required');
  const name = String(req.body?.name || '').trim();
  const body = String(req.body?.body || '').trim();
  if (!name || !body) throw new BadRequestError('name and body are required');
  const variables = Array.isArray(req.body?.variables) ? req.body.variables.map((value: unknown) => String(value).trim()).filter(Boolean) : [];
  const item = await WhatsAppTemplate.create({ organization: org, name, body, variables, languageCode: String(req.body?.languageCode || 'en_US').trim(), active: req.body?.active !== false, createdBy: req.user?.userId });
  return ApiResponse.created(res, item, 'WhatsApp template created');
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const org = organizationId(req);
  if (!mongoose.isValidObjectId(org)) throw new BadRequestError('A valid organization is required');
  const item = await WhatsAppTemplate.findOne({ _id: req.params.templateId, organization: org });
  if (!item) throw new NotFoundError('WhatsApp template');
  if (req.body?.name !== undefined) item.name = String(req.body.name).trim();
  if (req.body?.body !== undefined) item.body = String(req.body.body).trim();
  if (req.body?.languageCode !== undefined) item.languageCode = String(req.body.languageCode).trim();
  if (req.body?.active !== undefined) item.active = Boolean(req.body.active);
  if (Array.isArray(req.body?.variables)) item.variables = req.body.variables.map((value: unknown) => String(value).trim()).filter(Boolean);
  await item.save();
  return ApiResponse.success(res, item, 'WhatsApp template updated');
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const org = organizationId(req);
  if (!mongoose.isValidObjectId(org)) throw new BadRequestError('A valid organization is required');
  const item = await WhatsAppTemplate.findOneAndDelete({ _id: req.params.templateId, organization: org });
  if (!item) throw new NotFoundError('WhatsApp template');
  return ApiResponse.success(res, { deleted: true });
};
