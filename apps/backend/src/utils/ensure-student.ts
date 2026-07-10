/**
 * ensureStudentRecord — Guarantees a Student document exists for a given User.
 *
 * This utility is used by all student-facing endpoints to prevent the
 * "Student record not found" error.  When a User with role="student" has
 * no corresponding Student document (e.g. orphaned after a partial
 * registration or created by an admin), one is automatically created with
 * the same defaults used during self-registration (Public School / Public Class).
 */

import mongoose from 'mongoose';
import Student from '../models/student.model';
import Profile from '../models/profile.model';
import School from '../models/school.model';
import ClassModel from '../models/class.model';

// ---------------------------------------------------------------------------
// Ensure a Student record exists for the given userId.
// Returns the Student document (created if necessary).
// ---------------------------------------------------------------------------
export async function ensureStudentRecord(
  userId: string | mongoose.Types.ObjectId,
): Promise<mongoose.Document & { _id: mongoose.Types.ObjectId; enrolledCourses: mongoose.Types.ObjectId[] }> {
  // 1. Existing record → return it
  const existing = await Student.findOne({ user: userId });
  if (existing) return existing;

  // 2. Look up the user's Profile (needed for Student creation)
  const profile = await Profile.findOne({ user: userId });
  if (!profile) {
    throw new Error(
      `Cannot create Student record: no Profile exists for user ${userId}. ` +
      'Please complete your profile or contact an administrator.',
    );
  }

  // 3. Find or create "Public School"
  let publicSchool = await School.findOne({ name: 'Public School' });
  if (!publicSchool) {
    publicSchool = await School.create({
      name: 'Public School',
      address: 'Online',
      phone: '+000',
      email: 'public@school.edu',
      principalName: 'Admin',
      establishedYear: new Date().getFullYear(),
      createdBy: userId,
    });
  }

  // 4. Find or create "Public Class"
  let publicClass = await ClassModel.findOne({
    school: publicSchool._id,
    title: 'Public Class',
  });
  if (!publicClass) {
    publicClass = await ClassModel.create({
      school: publicSchool._id,
      title: 'Public Class',
      section: 'A',
      room: 'Online',
    });
  }

  // 5. Create the Student document
  const student = await Student.create({
    user: userId,
    profile: profile._id,
    enrollmentDate: new Date(),
    approvalStatus: 'approved', // auto-approved since they're already logged in
    school: publicSchool._id,
    class: publicClass._id,
  });

  return student;
}

export default ensureStudentRecord;