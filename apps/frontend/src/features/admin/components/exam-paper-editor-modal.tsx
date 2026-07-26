/**
 * Exam Paper Editor Modal — lets a teacher write an exam's questions right
 * inside the Course Content Builder, instead of being sent away to a
 * separate page. "Submit for Review" still routes it through the normal
 * Papers & Approval moderation flow — only the authoring step moved.
 */

import { motion } from 'framer-motion';
import { ExamPaperEditor } from './exam-paper-editor';

interface ExamPaperEditorModalProps {
  examId: string;
  examTitle: string;
  onClose: () => void;
}

export function ExamPaperEditorModal({ examId, examTitle, onClose }: ExamPaperEditorModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--color-surface-primary)] p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-[var(--color-text-primary)]">🎓 {examTitle} — Exam Paper</h3>
          <button onClick={onClose} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">✕</button>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
          Add questions here — the same types as a course quiz. When you're ready, "Submit for Review" sends it to Papers &amp; Approval for admin moderation before it can be used.
        </p>
        <ExamPaperEditor examId={examId} />
      </motion.div>
    </div>
  );
}

export default ExamPaperEditorModal;
