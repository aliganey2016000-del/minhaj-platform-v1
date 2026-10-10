export const GLOBAL_SUBSCRIPTION_PRICE = 5;
export const GLOBAL_SUBSCRIPTION_DAYS = 365;
export function subscriptionExpiry(startsAt: Date): Date {
  return new Date(startsAt.getTime() + GLOBAL_SUBSCRIPTION_DAYS * 86400000);
}
export function subscriptionActive(subscription: { status?: string; startsAt?: Date | null; expiresAt?: Date | null }, now = new Date()): boolean {
  return subscription.status === 'approved' && !!subscription.startsAt && !!subscription.expiresAt
    && subscription.startsAt <= now && subscription.expiresAt > now;
}

/** Default share (percent) of each verified subscription a school earns. */
export const DEFAULT_SCHOOL_BONUS_RATE = 33;
export const MAX_SCHOOL_BONUS_RATE = 60;
export function effectiveBonusRate(rate?: number | null): number {
  return typeof rate === 'number' && Number.isFinite(rate) ? rate : DEFAULT_SCHOOL_BONUS_RATE;
}
export function bonusAmount(verifiedSubscriptions: number, rate?: number | null): number {
  return Math.round(verifiedSubscriptions * GLOBAL_SUBSCRIPTION_PRICE * effectiveBonusRate(rate)) / 100;
}
