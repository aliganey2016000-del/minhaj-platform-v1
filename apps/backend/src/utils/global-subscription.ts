export const GLOBAL_SUBSCRIPTION_PRICE = 5;
export const GLOBAL_SUBSCRIPTION_DAYS = 365;
export function subscriptionExpiry(startsAt: Date): Date {
  return new Date(startsAt.getTime() + GLOBAL_SUBSCRIPTION_DAYS * 86400000);
}
export function subscriptionActive(subscription: { status?: string; startsAt?: Date; expiresAt?: Date }, now = new Date()): boolean {
  return subscription.status === 'approved' && !!subscription.startsAt && !!subscription.expiresAt
    && subscription.startsAt <= now && subscription.expiresAt > now;
}
