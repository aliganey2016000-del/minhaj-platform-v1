/** Global courses have unlimited capacity, including legacy records storing 50. */
export function courseReservationFilter(course: { _id: unknown; scope?: string; maxStudents: number }): Record<string, unknown> {
  return course.scope === 'global'
    ? { _id: course._id, scope: 'global' }
    : { _id: course._id, enrolledStudents: { $lt: course.maxStudents } };
}
