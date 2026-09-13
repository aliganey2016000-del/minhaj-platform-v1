import { Request, Response } from 'express';
import { WhatsAppNotificationPreference } from '../models/whatsapp-notification-preference.model';
import { WhatsAppNotificationCategory } from '../models/whatsapp-notification-preference.model';

const CATEGORIES: WhatsAppNotificationCategory[] = ['attendance', 'fees', 'results', 'assignments', 'exams', 'announcements', 'general'];

export async function listPreferences(req: Request, res: Response) {
  const organizationId = (req as any).user?.organizationId;
  const parentId = String(req.query.parentId || '');
  if (!organizationId || !parentId) return res.status(400).json({ success: false, message: 'organizationId and parentId are required' });
  const rows = await WhatsAppNotificationPreference.find({ organizationId, parentId }).sort({ category: 1 }).lean();
  const byCategory = new Map(rows.map((row) => [row.category, row]));
  const data = CATEGORIES.map((category) => byCategory.get(category) || ({ category, enabled: true, quietHoursStart: null, quietHoursEnd: null }));
  return res.json({ success: true, data });
}

export async function upsertPreference(req: Request, res: Response) {
  const organizationId = (req as any).user?.organizationId;
  const parentId = String(req.params.parentId || '');
  const category = req.body?.category as WhatsAppNotificationCategory;
  if (!organizationId || !parentId || !CATEGORIES.includes(category)) return res.status(400).json({ success: false, message: 'Invalid preference request' });
  const row = await WhatsAppNotificationPreference.findOneAndUpdate(
    { organizationId, parentId, category },
    {
      $set: {
        enabled: req.body.enabled !== false,
        quietHoursStart: req.body.quietHoursStart || null,
        quietHoursEnd: req.body.quietHoursEnd || null,
      },
      $setOnInsert: { organizationId, parentId, category },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return res.json({ success: true, data: row });
}
