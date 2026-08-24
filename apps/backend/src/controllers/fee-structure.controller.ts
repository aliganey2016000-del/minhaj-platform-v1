import { Request, Response } from 'express';
import FeeStructure from '../models/fee-structure.model';
import Invoice from '../models/invoice.model';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { applyOrgFilter, assertOwnsOrg, resolveOrgIdForCreate } from '../utils/tenant-scope';

const FEE_TYPES = ['tuition', 'registration', 'exam', 'material', 'transport', 'library', 'activity', 'uniform', 'other'];
const SCOPE_TYPES = ['school', 'department', 'class'];
const BILLING_CYCLES = ['one_time', 'monthly', 'termly', 'annual'];

// ---------------------------------------------------------------------------
// GET /fee-structures — List fee structures (admin/org_admin, org-scoped)
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { page = '1', limit = '20', school, scopeType, feeType, isActive, search } = req.query;

  const filter: Record<string, unknown> = {};
  if (school) filter.school = school;
  if (scopeType && SCOPE_TYPES.includes(scopeType as string)) filter.scopeType = scopeType;
  if (feeType && FEE_TYPES.includes(feeType as string)) filter.feeType = feeType;
  if (isActive === 'true') filter.isActive = true;
  else if (isActive === 'false') filter.isActive = false;
  if (search) filter.title = { $regex: search, $options: 'i' };

  const scopedFilter = applyOrgFilter(req, filter, 'school');

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 20));

  const [structures, total] = await Promise.all([
    FeeStructure.find(scopedFilter)
      .populate('school', 'name')
      .populate('scopeRef')
      .populate('createdBy', 'email')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    FeeStructure.countDocuments(scopedFilter),
  ]);

  return ApiResponse.paginated(res, structures, { page: pageNum, limit: limitNum, total });
};

// ---------------------------------------------------------------------------
// GET /fee-structures/:id
// ---------------------------------------------------------------------------

export const getOne = async (req: Request, res: Response): Promise<Response> => {
  const structure = await FeeStructure.findById(req.params.id)
    .populate('school', 'name')
    .populate('scopeRef')
    .populate('createdBy', 'email');
  if (!structure) throw new NotFoundError('Fee structure');
  assertOwnsOrg(req, structure, 'school');

  return ApiResponse.success(res, structure);
};

// ---------------------------------------------------------------------------
// POST /fee-structures
// ---------------------------------------------------------------------------

// Normalize/validate an optional `components` array (multi-component fees,
// e.g. Tuition + Transport + Library). Returns the cleaned list, or throws.
function normalizeComponents(raw: unknown): { description: string; amount: number }[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new BadRequestError('components must be an array');
  const out: { description: string; amount: number }[] = [];
  for (const c of raw) {
    const description = String(c?.description ?? '').trim();
    const amount = Number(c?.amount);
    if (!description) throw new BadRequestError('Each component needs a description');
    if (!Number.isFinite(amount) || amount < 0) throw new BadRequestError('Each component needs a valid amount');
    out.push({ description, amount });
  }
  return out;
}

export const create = async (req: Request, res: Response): Promise<Response> => {
  const { title, description, feeType, scopeType, scopeRef, amount, components, billingCycle, academicYear, dueDayOffset } = req.body;

  if (!title || !String(title).trim()) throw new BadRequestError('Title is required');
  if (amount === undefined || !Number.isFinite(Number(amount)) || Number(amount) < 0) throw new BadRequestError('A valid amount is required');
  if (!scopeType || !SCOPE_TYPES.includes(scopeType)) throw new BadRequestError('scopeType must be school, department, or class');
  if (scopeType !== 'school' && !scopeRef) throw new BadRequestError(`scopeRef is required when scopeType is "${scopeType}"`);
  if (billingCycle && !BILLING_CYCLES.includes(billingCycle)) throw new BadRequestError('Invalid billingCycle');
  if (feeType && !FEE_TYPES.includes(feeType)) throw new BadRequestError('Invalid feeType');

  const school = resolveOrgIdForCreate(req, req.body.school);
  if (!school) throw new BadRequestError('school is required');

  const cleanedComponents = normalizeComponents(components);

  const structure = await FeeStructure.create({
    school,
    title: String(title).trim(),
    description: description ? String(description).trim() : '',
    feeType: feeType || 'tuition',
    scopeType,
    scopeRef: scopeType === 'school' ? undefined : scopeRef,
    amount: cleanedComponents.length ? cleanedComponents.reduce((s, c) => s + c.amount, 0) : Number(amount),
    components: cleanedComponents,
    billingCycle: billingCycle || 'one_time',
    academicYear: academicYear ? String(academicYear).trim() : '',
    dueDayOffset: dueDayOffset !== undefined ? dueDayOffset : 14,
    createdBy: req.user!.userId,
  });

  return ApiResponse.created(res, structure, 'Fee structure created successfully');
};

// ---------------------------------------------------------------------------
// PATCH /fee-structures/:id
// Editing a structure only changes the template going forward — it never
// retroactively touches invoices already generated from it.
// ---------------------------------------------------------------------------

export const update = async (req: Request, res: Response): Promise<Response> => {
  const structure = await FeeStructure.findById(req.params.id);
  if (!structure) throw new NotFoundError('Fee structure');
  assertOwnsOrg(req, structure, 'school');

  const { title, description, feeType, scopeType, scopeRef, amount, components, billingCycle, academicYear, dueDayOffset, isActive } = req.body;

  if (title !== undefined) {
    if (!String(title).trim()) throw new BadRequestError('Title cannot be empty');
    structure.title = String(title).trim();
  }
  if (description !== undefined) structure.description = String(description).trim();
  if (feeType !== undefined) {
    if (!FEE_TYPES.includes(feeType)) throw new BadRequestError('Invalid feeType');
    structure.feeType = feeType;
  }
  if (scopeType !== undefined) {
    if (!SCOPE_TYPES.includes(scopeType)) throw new BadRequestError('scopeType must be school, department, or class');
    if (scopeType !== 'school' && !scopeRef && !structure.scopeRef) {
      throw new BadRequestError(`scopeRef is required when scopeType is "${scopeType}"`);
    }
    structure.scopeType = scopeType;
  }
  if (scopeRef !== undefined) structure.scopeRef = scopeRef;
  if (components !== undefined) structure.components = normalizeComponents(components);
  if (components !== undefined && structure.components.length > 0) {
    structure.amount = structure.components.reduce((s, c) => s + c.amount, 0);
  } else if (amount !== undefined) {
    if (!Number.isFinite(Number(amount)) || Number(amount) < 0) throw new BadRequestError('amount must be a valid number >= 0');
    structure.amount = amount;
  }
  if (billingCycle !== undefined) {
    if (!BILLING_CYCLES.includes(billingCycle)) throw new BadRequestError('Invalid billingCycle');
    structure.billingCycle = billingCycle;
  }
  if (academicYear !== undefined) structure.academicYear = String(academicYear).trim();
  if (dueDayOffset !== undefined) structure.dueDayOffset = dueDayOffset;
  if (isActive !== undefined) structure.isActive = !!isActive;

  await structure.save();

  return ApiResponse.success(res, structure, 'Fee structure updated successfully');
};

// ---------------------------------------------------------------------------
// DELETE /fee-structures/:id — blocked once any invoice has been generated
// from it (same guard shape as department.controller.ts blocking a
// Department delete while classes still reference it).
// ---------------------------------------------------------------------------

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const structure = await FeeStructure.findById(req.params.id);
  if (!structure) throw new NotFoundError('Fee structure');
  assertOwnsOrg(req, structure, 'school');

  const linkedInvoice = await Invoice.exists({ feeStructure: structure._id });
  if (linkedInvoice) {
    throw new BadRequestError('Cannot delete a fee structure that already has invoices — deactivate it instead.');
  }

  await FeeStructure.findByIdAndDelete(req.params.id);
  return ApiResponse.noContent(res, 'Fee structure deleted successfully');
};
