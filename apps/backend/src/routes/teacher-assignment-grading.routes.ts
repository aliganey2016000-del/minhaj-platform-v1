import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.patch('/assignment-submissions/:submissionId/grade', requireAuth, async (req, res) => {
  const { submissionId } = req.params;
  const { grade, feedback } = req.body ?? {};

  if (grade !== null && grade !== undefined && (typeof grade !== 'number' || Number.isNaN(grade) || grade < 0)) {
    return res.status(400).json({ message: 'Grade must be a non-negative number or null.' });
  }

  const submission = await prisma.assignmentSubmission.findUnique({
    where: { id: submissionId },
    include: { assignment: true },
  });

  if (!submission) return res.status(404).json({ message: 'Submission not found.' });

  if (grade !== null && grade !== undefined && submission.assignment.maxPoints != null && grade > submission.assignment.maxPoints) {
    return res.status(400).json({ message: `Grade cannot exceed ${submission.assignment.maxPoints}.` });
  }

  const updated = await prisma.assignmentSubmission.update({
    where: { id: submissionId },
    data: {
      grade: grade ?? null,
      feedback: typeof feedback === 'string' ? feedback.trim() || null : null,
      gradedAt: grade == null ? null : new Date(),
      status: grade == null ? 'SUBMITTED' : 'GRADED',
    },
  });

  return res.json({ data: updated });
});

export default router;
