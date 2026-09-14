/** Keep generated URL keys globally unique while retaining public slug lookup. */
export function tenantSlug(baseSlug: string, organizationId: unknown): string {
  const tenantKey = String(organizationId || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return tenantKey ? `${baseSlug}-${tenantKey}` : baseSlug;
}
