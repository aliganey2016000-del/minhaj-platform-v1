/**
 * Institution type is a tenant-level classification, not a normal profile field.
 * Changing it can invalidate academic hierarchy, progression, enrollment and
 * curriculum data. Only the platform-admin migration workflow may change it.
 */

import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/api-error';

export const preventOrgAdminInstitutionTypeChange = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (req.user?.role !== 'org_admin') {
    return next();
  }

  if (req.body && typeof req.body === 'object') {
    const hasInstitutionType = Object.prototype.hasOwnProperty.call(req.body, 'institutionType');
    const hasLegacyOrganizationType = Object.prototype.hasOwnProperty.call(req.body, 'organizationType');

    if (hasInstitutionType || hasLegacyOrganizationType) {
      throw new ForbiddenError(
        'Organization Admins cannot change the institution type. Institution type changes require a platform-admin migration workflow.',
      );
    }
  }

  next();
};
