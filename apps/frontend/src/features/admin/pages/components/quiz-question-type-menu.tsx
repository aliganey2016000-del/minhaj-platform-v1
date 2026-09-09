import type { QuestionType } from '../course-builder.types';

interface QuestionTypeOption { type: QuestionType; icon: string; title: string; description: string; accent: string; }

const QUESTION_TYPES: QuestionTypeOption[] = [
  ['mcq','📝','Multiple Choice','Pick the one right answer from a list.','bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'],
  ['true_false','✅','True or False','A quick yes-or-no challenge.','bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'],
  ['matching','🔗','Matching Pairs','Match each item with its partner.','bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'],
  ['ordering','🔢','Put in Order','Arrange the steps into the correct sequence.','bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'],
  ['picture_choice','🖼️','Picture Choice','Tap the picture that answers the question.','bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300'],
  ['swipe_sort','👉','Swipe Sort','Sort cards into the two correct buckets.','bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'],
  ['listen_write','🎧','Listen & Write','Play audio, then type what you heard.','bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300'],
  ['fill_blank','🕳️','Fill in the Blank','Fill each gap from the word bank.','bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'],
  ['word_scramble','🔀','Word Scramble','Unscramble the letters to form the answer.','bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'],
  ['sentence_build','🧩','Sentence Build','Arrange word chips into the right sentence.','bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300'],
  ['short_answer','✍️','Short Answer','Type a brief answer; teachers can provide multiple accepted answers.','bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'],
].map(([type, icon, title, description, accent]) => ({ type: type as QuestionType, icon, title, description, accent }));

interface QuestionTypeMenuProps { isOpen: boolean; onClose: () => void; onSelect: (type: QuestionType) => void; }
export function QuestionTypeMenu({ isOpen, onClose, onSelect }: QuestionTypeMenuProps) {
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
    <div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl max-h-[85vh] rounded-2xl bg-[var(--color-surface-primary)] shadow-2xl overflow-hidden flex flex-col">
      <div className="flex items-center justify-between border-b border-[var(--color-border-default)] px-5 py-4"><h3 className="flex items-center gap-2 text-base font-bold"><span className="text-xl">🎮</span> Choose a Question Type</h3><button type="button" onClick={onClose} className="h-8 w-8 rounded-lg">✕</button></div>
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto">{QUESTION_TYPES.map((opt) => <button key={opt.type} type="button" onClick={() => onSelect(opt.type)} className="group flex items-start gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4 text-left hover:border-primary-400 hover:shadow-md transition-all"><span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-xl ${opt.accent}`}>{opt.icon}</span><span><span className="block text-sm font-bold">{opt.title}</span><span className="block text-xs opacity-70 mt-0.5">{opt.description}</span></span></button>)}</div>
    </div>
  </div>;
}
export default QuestionTypeMenu;
