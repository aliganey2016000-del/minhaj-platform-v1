import { Router } from 'express';
import mongoose from 'mongoose';
import Assignment from '../models/assignment.model';
import AssignmentSubmission from '../models/assignment-submission.model';
import Course from '../models/course.model';
import { authMiddleware } from '../middleware/auth.middleware';
import { roleMiddleware } from '../middleware/role.middleware';
import { asyncHandler } from '../middleware/async-handler.middleware';
import { getOwnTeacherRecord } from '../utils/tenant-scope';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';

const router = Router();

/**
 * Teacher grading endpoint used by the teacher assignment review UI.
 * The project uses Mongoose (not Prisma), so this route deliberately follows
 * the existing model/middleware stack.
 */
router.patch(
  '/assignment-submissions/:submissionId/grade',
  authMiddleware,
  roleMiddleware(['teacher', 'admin', 'org_admin']),
  asyncHandler(async (req, res) => {
    const { submissionId } = req.params;
    const { grade, feedback } = req.body ?? {};

    if (!mongoose.isValidObjectId(submissionId)) {
      throw new BadRequestError('Invalid submission id');
    }

    if (grade !== null && grade !== undefined) {
      if (typeof grade !== 'number' || !Number.isFinite(grade) || grade < 0) {
        throw new BadRequestError('Grade must be a non-negative number or null.');
      }
    }

    if (feedback !== undefined && feedback !== null && typeof feedback !== 'string') {
      throw new BadRequestError('Feedback must be text.');
    }

    const submission = await AssignmentSubmission.findById(submissionId).lean();
    if (!submission) throw new NotFoundError('Submission');

    const assignment = await Assignment.findById(submission.assignment)
      .select('totalMarks')
      .lean();
    if (!assignment) throw new NotFoundError('Assignment');

    // Teachers may grade only submissions belonging to courses they teach.
    if (req.user?.role === 'teacher') {
      const teacher = await getOwnTeacherRecord(req);
      if (!teacher) throw new ForbiddenError('Teacher record not found');

      const ownedCourse = await Course.findOne({
        _id: submission.course,
        teacher: teacher._id,
      }).select('_id').lean();

      if (!ownedCourse) {
        throw new ForbiddenError('This submission belongs to a course you do not teach.');
      }
    }

    if (grade !== null && grade !== undefined && grade > assignment.totalMarks) {
      throw new BadRequestError(`Grade cannot exceed ${assignment.totalMarks}.`);
    }

    const updated = await AssignmentSubmission.findByIdAndUpdate(
      submissionId,
      {
        score: grade ?? null,
        feedback: typeof feedback === 'string' ? feedback.trim() : '',
        gradedAt: grade == null ? null : new Date(),
        gradedBy: grade == null ? null : new mongoose.Types.ObjectId(req.user!.userId),
        status: grade == null ? 'submitted' : 'graded',
      },
      { new: true, runValidators: true }
    ).lean();

    return res.json({ data: updated });
  })
);

export default router;
