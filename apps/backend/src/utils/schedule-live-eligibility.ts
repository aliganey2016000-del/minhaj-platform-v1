export type ScheduleStaleReason =
  | 'missing_class'
  | 'inactive_class'
  | 'missing_course'
  | 'unpublished_course'
  | 'inactive_teacher';

export interface ScheduleLiveEligibility {
  eligible: boolean;
  reason?: ScheduleStaleReason;
}

/**
 * A ClassSchedule can remain stored for history/audit after one of its
 * referenced resources becomes non-schedulable. Live timetable/portal reads
 * must fail closed in that situation instead of continuing to expose a stale
 * lesson. An intentionally unassigned teacher (null) remains valid.
 *
 * Callers must populate:
 *   class.status
 *   course.status
 *   teacher.status (when teacher is assigned)
 */
export function getScheduleLiveEligibility(schedule: any): ScheduleLiveEligibility {
  if (!schedule?.class) return { eligible: false, reason: 'missing_class' };
  if (schedule.class.status !== undefined && schedule.class.status !== 'active') {
    return { eligible: false, reason: 'inactive_class' };
  }

  if (!schedule?.course) return { eligible: false, reason: 'missing_course' };
  if (schedule.course.status !== undefined && schedule.course.status !== 'published') {
    return { eligible: false, reason: 'unpublished_course' };
  }

  if (schedule.teacher && schedule.teacher.status !== undefined && schedule.teacher.status !== 'active') {
    return { eligible: false, reason: 'inactive_teacher' };
  }

  return { eligible: true };
}

export function isLiveEligibleSchedule(schedule: any): boolean {
  return getScheduleLiveEligibility(schedule).eligible;
}
