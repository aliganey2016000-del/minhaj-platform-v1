/**
 * Guuldoon school bonus.
 *
 * Every verified (approved) Guuldoon subscription already records the school
 * the student belongs to, so a school's bonus is derived from those rows:
 * verified subscriptions x the fixed subscription price x the school's rate.
 * Payouts are recorded separately by the Super Admin and never alter a
 * subscription.
 */
import mongoose from 'mongoose';
import School from '../models/school.model';
import Student from '../models/student.model';
import Subscription from '../models/global-subscription.model';
import Payout from '../models/guuldoon-school-payout.model';
import { GLOBAL_SUBSCRIPTION_PRICE, bonusAmount, effectiveBonusRate } from '../utils/global-subscription';

export interface SchoolBonusSummary {
  schoolId: string;
  name: string;
  city: string;
  rate: number;
  usesDefaultRate: boolean;
  students: number;
  subscribers: number;
  verifiedSubscriptions: number;
  grossUsd: number;
  bonusUsd: number;
  paidOutUsd: number;
  pendingUsd: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export async function summarizeSchools(filter: Record<string, unknown> = {}): Promise<SchoolBonusSummary[]> {
  const schools = await School.find(filter).select('name city guuldoonBonusRate').sort({ name: 1 }).limit(1000).lean();
  if (!schools.length) return [];
  const ids = schools.map(school => school._id);
  const approved = { status: 'approved', school: { $in: ids } };
  const [verifiedRows, subscriberRows, students, payouts] = await Promise.all([
    Subscription.aggregate([
      { $match: approved },
      { $group: { _id: '$school', total: { $sum: 1 } } },
    ]),
    // Distinct subscribed students per school: one group per (school, student), then count them.
    Subscription.aggregate([
      { $match: approved },
      { $group: { _id: { school: '$school', user: '$user' } } },
      { $group: { _id: '$_id.school', total: { $sum: 1 } } },
    ]),
    Student.aggregate([
      { $match: { school: { $in: ids }, approvalStatus: 'approved' } },
      { $group: { _id: '$school', count: { $sum: 1 } } },
    ]),
    Payout.aggregate([
      { $match: { school: { $in: ids } } },
      { $group: { _id: '$school', total: { $sum: '$amount' } } },
    ]),
  ]);
  const verifiedMap = new Map(verifiedRows.map(row => [String(row._id), row.total as number]));
  const subscriberMap = new Map(subscriberRows.map(row => [String(row._id), row.total as number]));
  const studentMap = new Map(students.map(row => [String(row._id), row.count as number]));
  const payoutMap = new Map(payouts.map(row => [String(row._id), row.total as number]));
  return schools.map(school => {
    const key = String(school._id);
    const verified = verifiedMap.get(key) || 0;
    const rate = effectiveBonusRate((school as any).guuldoonBonusRate);
    const bonus = bonusAmount(verified, (school as any).guuldoonBonusRate);
    const paidOut = round2(payoutMap.get(key) || 0);
    return {
      schoolId: key,
      name: school.name,
      city: (school as any).city || '',
      rate,
      usesDefaultRate: typeof (school as any).guuldoonBonusRate !== 'number',
      students: studentMap.get(key) || 0,
      subscribers: subscriberMap.get(key) || 0,
      verifiedSubscriptions: verified,
      grossUsd: round2(verified * GLOBAL_SUBSCRIPTION_PRICE),
      bonusUsd: bonus,
      paidOutUsd: paidOut,
      pendingUsd: round2(Math.max(0, bonus - paidOut)),
    };
  });
}

export async function summarizeSchool(schoolId: string): Promise<SchoolBonusSummary | null> {
  return (await summarizeSchools({ _id: new mongoose.Types.ObjectId(schoolId) }))[0] || null;
}
