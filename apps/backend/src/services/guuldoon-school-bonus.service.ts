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
import ClassModel from '../models/class.model';
import Subscription from '../models/global-subscription.model';
import Payout from '../models/guuldoon-school-payout.model';
import { GLOBAL_SUBSCRIPTION_PRICE, bonusAmount, effectiveBonusRate, effectiveGrades } from '../utils/global-subscription';

export interface SchoolBonusSummary {
  schoolId: string;
  name: string;
  city: string;
  rate: number;
  usesDefaultRate: boolean;
  /** Grades this school covers; only these count toward students and the bonus. */
  grades: number[];
  /** Active, approved students in the grades this school covers (the sum of the selected grades below). */
  students: number;
  /** Active students per grade, regardless of which grades the school covers. */
  grade8Students: number;
  grade12Students: number;
  subscribers: number;
  verifiedSubscriptions: number;
  grossUsd: number;
  bonusUsd: number;
  paidOutUsd: number;
  pendingUsd: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export async function summarizeSchools(filter: Record<string, unknown> = {}): Promise<SchoolBonusSummary[]> {
  const schools = await School.find(filter).select('name city guuldoonBonusRate guuldoonGrades').sort({ name: 1 }).limit(1000).lean();
  if (!schools.length) return [];
  const ids = schools.map(school => school._id);
  const gradesOf = new Map(schools.map(school => [String(school._id), effectiveGrades((school as any).guuldoonGrades)]));
  // Schools covering both grades match on school alone; a school limited to one grade also matches that grade.
  const bothGrades = schools.filter(school => gradesOf.get(String(school._id))!.length === 2).map(school => school._id);
  const oneGrade = schools.filter(school => gradesOf.get(String(school._id))!.length === 1);
  const approved = {
    status: 'approved',
    $or: [{ school: { $in: bothGrades } }, ...oneGrade.map(school => ({ school: school._id, grade: gradesOf.get(String(school._id))![0] }))],
  };
  const targetClasses = await ClassModel.find({ school: { $in: ids }, gradeLevel: { $in: [8, 12] } }).select('_id gradeLevel').lean();
  const gradeOfClass = new Map(targetClasses.map(row => [String(row._id), row.gradeLevel as number]));
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
    // Guuldoon's target group: active, approved students whose class is Grade 8 or 12
    // (the same rule that decides who can open a Guuldoon course).
    Student.aggregate([
      { $match: { school: { $in: ids }, approvalStatus: 'approved', status: 'active', class: { $in: targetClasses.map(row => row._id) } } },
      { $group: { _id: { school: '$school', class: '$class' }, count: { $sum: 1 } } },
    ]),
    Payout.aggregate([
      { $match: { school: { $in: ids } } },
      { $group: { _id: '$school', total: { $sum: '$amount' } } },
    ]),
  ]);
  const verifiedMap = new Map(verifiedRows.map(row => [String(row._id), row.total as number]));
  const subscriberMap = new Map(subscriberRows.map(row => [String(row._id), row.total as number]));
  // Active students per grade for every school, whether or not the grade is selected,
  // so the Super Admin can see the numbers before choosing which grades to include.
  const studentMap = new Map<string, { 8: number; 12: number }>();
  for (const row of students) {
    const grade = gradeOfClass.get(String(row._id.class));
    if (grade !== 8 && grade !== 12) continue;
    const entry = studentMap.get(String(row._id.school)) || { 8: 0, 12: 0 };
    entry[grade] += row.count as number;
    studentMap.set(String(row._id.school), entry);
  }
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
      grades: gradesOf.get(key)!,
      students: gradesOf.get(key)!.reduce((total, grade) => total + (studentMap.get(key)?.[grade as 8 | 12] || 0), 0),
      grade8Students: studentMap.get(key)?.[8] || 0,
      grade12Students: studentMap.get(key)?.[12] || 0,
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
