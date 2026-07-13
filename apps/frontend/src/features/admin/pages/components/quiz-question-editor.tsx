/**
 * QuestionEditor — dispatches to a type-specific authoring UI for one quiz
 * question (MCQ, True/False, Matching Pairs, Ordering, Picture Choice).
 */

import { useState } from 'react';
import type {
  QuizQuestion,
  McqQuestion,
  TrueFalseQuestion,
  MatchingQuestion,
  OrderingQuestion,
  PictureChoiceQuestion,
  SwipeSortQuestion,
  ListenWriteQuestion,
  FillBlankQuestion,
  WordScrambleQuestion,
  SentenceBuildQuestion,
} from '../course-builder.types';
import { QUESTION_TYPE_META as TYPE_META } from '../quiz-question-meta';

const inputClass = 'w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2.5 py-1.5 text-xs';

interface QuestionEditorProps {
  question: QuizQuestion;
  index: number;
  onChange: (question: QuizQuestion) => void;
  onRemove: () => void;
}

export function QuestionEditor({ question, index, onChange, onRemove }: QuestionEditorProps) {
  const meta = TYPE_META[question.type] || TYPE_META.mcq;

  const updatePrompt = (value: string) => onChange({ ...question, question: value });
  const updateExplanation = (value: string) => onChange({ ...question, explanation: value });

  return (
    <div className="p-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[var(--color-text-primary)]">Q{index + 1}.</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.color}`}>{meta.icon} {meta.label}</span>
        </div>
        <button type="button" onClick={onRemove} className="text-xs text-red-500 hover:text-red-700">✕</button>
      </div>

      <input
        className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-sm mb-2"
        placeholder="Enter question..."
        value={question.question}
        onChange={(e) => updatePrompt(e.target.value)}
      />

      {question.type === 'mcq' && <McqEditor question={question} onChange={onChange} />}
      {question.type === 'true_false' && <TrueFalseEditor question={question} onChange={onChange} />}
      {question.type === 'matching' && <MatchingEditor question={question} onChange={onChange} />}
      {question.type === 'ordering' && <OrderingEditor question={question} onChange={onChange} />}
      {question.type === 'picture_choice' && <PictureChoiceEditor question={question} onChange={onChange} />}
      {question.type === 'swipe_sort' && <SwipeSortEditor question={question} onChange={onChange} />}
      {question.type === 'listen_write' && <ListenWriteEditor question={question} onChange={onChange} />}
      {question.type === 'fill_blank' && <FillBlankEditor question={question} onChange={onChange} />}
      {question.type === 'word_scramble' && <WordScrambleEditor question={question} onChange={onChange} />}
      {question.type === 'sentence_build' && <SentenceBuildEditor question={question} onChange={onChange} />}

      <input
        className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-xs mt-2"
        placeholder="Explanation (optional)"
        value={question.explanation || ''}
        onChange={(e) => updateExplanation(e.target.value)}
      />
    </div>
  );
}

// ===========================================================================
// Multiple Choice
// ===========================================================================
function McqEditor({ question, onChange }: { question: McqQuestion; onChange: (q: QuizQuestion) => void }) {
  const updateOption = (idx: number, value: string) => {
    const options = [...question.options];
    options[idx] = value;
    onChange({ ...question, options });
  };
  const addOption = () => onChange({ ...question, options: [...question.options, ''] });
  const removeOption = (idx: number) => {
    const options = question.options.filter((_, i) => i !== idx);
    let correctIndex = question.correctIndex;
    if (idx < correctIndex) correctIndex--;
    else if (idx === correctIndex) correctIndex = 0;
    onChange({ ...question, options, correctIndex: Math.max(0, Math.min(correctIndex, options.length - 1)) });
  };

  return (
    <div className="space-y-1.5 mb-2">
      {question.options.map((opt, oIdx) => (
        <div key={oIdx} className="flex items-center gap-2">
          <input
            type="radio"
            checked={question.correctIndex === oIdx}
            onChange={() => onChange({ ...question, correctIndex: oIdx })}
            className="accent-primary-600"
          />
          <input className={`flex-1 ${inputClass}`} placeholder={`Option ${oIdx + 1}`} value={opt} onChange={(e) => updateOption(oIdx, e.target.value)} />
          {question.options.length > 2 && (
            <button type="button" onClick={() => removeOption(oIdx)} className="text-xs text-red-400 hover:text-red-600">✕</button>
          )}
        </div>
      ))}
      <button type="button" onClick={addOption} className="text-xs text-primary-600 hover:text-primary-700 font-medium">+ Add Option</button>
    </div>
  );
}

// ===========================================================================
// True / False
// ===========================================================================
function TrueFalseEditor({ question, onChange }: { question: TrueFalseQuestion; onChange: (q: QuizQuestion) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-2">
      {[true, false].map((val) => (
        <button
          key={String(val)}
          type="button"
          onClick={() => onChange({ ...question, correctAnswer: val })}
          className={`flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-bold transition-colors ${
            question.correctAnswer === val
              ? 'border-green-400 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300'
              : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-primary-300'
          }`}
        >
          <span className="text-lg">{val ? '✅' : '❌'}</span>
          {val ? 'True' : 'False'}
        </button>
      ))}
    </div>
  );
}

// ===========================================================================
// Matching Pairs
// ===========================================================================
function MatchingEditor({ question, onChange }: { question: MatchingQuestion; onChange: (q: QuizQuestion) => void }) {
  const updatePair = (idx: number, side: 'left' | 'right', value: string) => {
    const pairs = question.pairs.map((p, i) => (i === idx ? { ...p, [side]: value } : p));
    onChange({ ...question, pairs });
  };
  const addPair = () => onChange({ ...question, pairs: [...question.pairs, { left: '', right: '' }] });
  const removePair = (idx: number) => onChange({ ...question, pairs: question.pairs.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-1.5 mb-2">
      {question.pairs.map((pair, pIdx) => (
        <div key={pIdx} className="flex items-center gap-2">
          <input className={inputClass} placeholder="Item" value={pair.left} onChange={(e) => updatePair(pIdx, 'left', e.target.value)} />
          <span className="text-purple-400 flex-shrink-0">↔</span>
          <input className={inputClass} placeholder="Its match" value={pair.right} onChange={(e) => updatePair(pIdx, 'right', e.target.value)} />
          {question.pairs.length > 2 && (
            <button type="button" onClick={() => removePair(pIdx)} className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">✕</button>
          )}
        </div>
      ))}
      <button type="button" onClick={addPair} className="text-xs text-primary-600 hover:text-primary-700 font-medium">+ Add Pair</button>
    </div>
  );
}

// ===========================================================================
// Ordering — drag rows to set the correct sequence
// ===========================================================================
function OrderingEditor({ question, onChange }: { question: OrderingQuestion; onChange: (q: QuizQuestion) => void }) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const updateItem = (idx: number, value: string) => {
    const items = [...question.items];
    items[idx] = value;
    onChange({ ...question, items });
  };
  const addItem = () => onChange({ ...question, items: [...question.items, ''] });
  const removeItem = (idx: number) => onChange({ ...question, items: question.items.filter((_, i) => i !== idx) });

  const handleDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) return;
    const items = [...question.items];
    const [moved] = items.splice(dragIdx, 1);
    items.splice(targetIdx, 0, moved);
    onChange({ ...question, items });
    setDragIdx(null);
  };

  return (
    <div className="space-y-1.5 mb-2">
      <p className="text-[10px] text-[var(--color-text-tertiary)] mb-1">Drag to arrange in the correct order — this is exactly the sequence students must reproduce.</p>
      {question.items.map((item, iIdx) => (
        <div
          key={iIdx}
          draggable
          onDragStart={() => setDragIdx(iIdx)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(iIdx)}
          className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/10 px-1 py-1"
        >
          <span className="cursor-grab text-amber-500 select-none px-1 text-sm">⠿</span>
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold">{iIdx + 1}</span>
          <input className={inputClass} placeholder={`Step ${iIdx + 1}`} value={item} onChange={(e) => updateItem(iIdx, e.target.value)} />
          {question.items.length > 2 && (
            <button type="button" onClick={() => removeItem(iIdx)} className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">✕</button>
          )}
        </div>
      ))}
      <button type="button" onClick={addItem} className="text-xs text-primary-600 hover:text-primary-700 font-medium">+ Add Step</button>
    </div>
  );
}

// ===========================================================================
// Picture Choice
// ===========================================================================
function PictureChoiceEditor({ question, onChange }: { question: PictureChoiceQuestion; onChange: (q: QuizQuestion) => void }) {
  const updateChoice = (idx: number, field: 'image' | 'label', value: string) => {
    const choices = question.choices.map((c, i) => (i === idx ? { ...c, [field]: value } : c));
    onChange({ ...question, choices });
  };
  const addChoice = () => onChange({ ...question, choices: [...question.choices, { image: '', label: '' }] });
  const removeChoice = (idx: number) => {
    const choices = question.choices.filter((_, i) => i !== idx);
    let correctIndex = question.correctIndex;
    if (idx < correctIndex) correctIndex--;
    else if (idx === correctIndex) correctIndex = 0;
    onChange({ ...question, choices, correctIndex: Math.max(0, Math.min(correctIndex, choices.length - 1)) });
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
      {question.choices.map((choice, cIdx) => (
        <div key={cIdx} className={`rounded-lg border-2 p-2 space-y-1.5 ${question.correctIndex === cIdx ? 'border-green-400' : 'border-[var(--color-border-default)]'}`}>
          <div className="aspect-square rounded-md bg-[var(--color-surface-tertiary)] flex items-center justify-center overflow-hidden">
            {choice.image ? <img src={choice.image} alt="" className="w-full h-full object-cover" /> : <span className="text-2xl opacity-30">🖼️</span>}
          </div>
          <input className={inputClass} placeholder="Image URL" value={choice.image} onChange={(e) => updateChoice(cIdx, 'image', e.target.value)} />
          <input className={inputClass} placeholder="Label (optional)" value={choice.label || ''} onChange={(e) => updateChoice(cIdx, 'label', e.target.value)} />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-secondary)]">
              <input type="radio" checked={question.correctIndex === cIdx} onChange={() => onChange({ ...question, correctIndex: cIdx })} className="accent-primary-600" />
              Correct
            </label>
            {question.choices.length > 2 && (
              <button type="button" onClick={() => removeChoice(cIdx)} className="text-xs text-red-400 hover:text-red-600">✕</button>
            )}
          </div>
        </div>
      ))}
      <button type="button" onClick={addChoice} className="flex items-center justify-center rounded-lg border-2 border-dashed border-[var(--color-border-default)] text-xs text-[var(--color-text-tertiary)] hover:border-primary-400 hover:text-primary-600 transition-colors aspect-square">
        + Add
      </button>
    </div>
  );
}

// ===========================================================================
// Swipe Sort — Tinder-style left/right sorting
// ===========================================================================
function SwipeSortEditor({ question, onChange }: { question: SwipeSortQuestion; onChange: (q: QuizQuestion) => void }) {
  const updateCardText = (idx: number, value: string) => {
    const cards = question.cards.map((c, i) => (i === idx ? { ...c, text: value } : c));
    onChange({ ...question, cards });
  };
  const updateCardSide = (idx: number, side: 'left' | 'right') => {
    const cards = question.cards.map((c, i) => (i === idx ? { ...c, correctSide: side } : c));
    onChange({ ...question, cards });
  };
  const addCard = () => onChange({ ...question, cards: [...question.cards, { text: '', correctSide: 'left' }] });
  const removeCard = (idx: number) => onChange({ ...question, cards: question.cards.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-2 mb-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          className={inputClass}
          placeholder="Left bucket label (e.g. Halal)"
          value={question.leftLabel}
          onChange={(e) => onChange({ ...question, leftLabel: e.target.value })}
        />
        <input
          className={inputClass}
          placeholder="Right bucket label (e.g. Haram)"
          value={question.rightLabel}
          onChange={(e) => onChange({ ...question, rightLabel: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        {question.cards.map((card, cIdx) => (
          <div key={cIdx} className="flex items-center gap-2">
            <input className={`flex-1 ${inputClass}`} placeholder="Card text" value={card.text} onChange={(e) => updateCardText(cIdx, e.target.value)} />
            <div className="flex rounded-lg border border-[var(--color-border-default)] overflow-hidden flex-shrink-0">
              <button
                type="button"
                onClick={() => updateCardSide(cIdx, 'left')}
                className={`px-2 py-1.5 text-[10px] font-semibold ${card.correctSide === 'left' ? 'bg-rose-500 text-white' : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)]'}`}
              >
                ⬅ {question.leftLabel || 'Left'}
              </button>
              <button
                type="button"
                onClick={() => updateCardSide(cIdx, 'right')}
                className={`px-2 py-1.5 text-[10px] font-semibold ${card.correctSide === 'right' ? 'bg-rose-500 text-white' : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)]'}`}
              >
                {question.rightLabel || 'Right'} ➡
              </button>
            </div>
            {question.cards.length > 2 && (
              <button type="button" onClick={() => removeCard(cIdx)} className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">✕</button>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={addCard} className="text-xs text-primary-600 hover:text-primary-700 font-medium">+ Add Card</button>
    </div>
  );
}

// ===========================================================================
// Listen & Write — audio dictation
// ===========================================================================
function ListenWriteEditor({ question, onChange }: { question: ListenWriteQuestion; onChange: (q: QuizQuestion) => void }) {
  return (
    <div className="space-y-1.5 mb-2">
      <input
        className={inputClass}
        placeholder="Audio URL (mp3, m4a...)"
        value={question.audioUrl}
        onChange={(e) => onChange({ ...question, audioUrl: e.target.value })}
      />
      {question.audioUrl && (
        <audio controls src={question.audioUrl} className="w-full h-8" />
      )}
      <input
        className={inputClass}
        placeholder="Correct answer (what should they type?)"
        value={question.correctText}
        onChange={(e) => onChange({ ...question, correctText: e.target.value })}
      />
      <input
        className={inputClass}
        placeholder="Hint (optional)"
        value={question.hint || ''}
        onChange={(e) => onChange({ ...question, hint: e.target.value })}
      />
    </div>
  );
}

// ===========================================================================
// Fill in the Blank — sentence with `___` markers + a word bank
// ===========================================================================
function countBlanks(template: string): number {
  return (template.match(/___/g) || []).length;
}

function FillBlankEditor({ question, onChange }: { question: FillBlankQuestion; onChange: (q: QuizQuestion) => void }) {
  const updateTemplate = (value: string) => {
    const count = countBlanks(value);
    const blanks = Array.from({ length: count }, (_, i) => question.blanks[i] || '');
    onChange({ ...question, textTemplate: value, blanks });
  };
  const updateBlank = (idx: number, value: string) => {
    const blanks = [...question.blanks];
    blanks[idx] = value;
    onChange({ ...question, blanks });
  };
  const updateDistractor = (idx: number, value: string) => {
    const distractors = [...question.distractors];
    distractors[idx] = value;
    onChange({ ...question, distractors });
  };
  const addDistractor = () => onChange({ ...question, distractors: [...question.distractors, ''] });
  const removeDistractor = (idx: number) => onChange({ ...question, distractors: question.distractors.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-2 mb-2">
      <textarea
        rows={2}
        className={`${inputClass} resize-y`}
        placeholder="Write the sentence using ___ for each blank (e.g. The five daily prayers are called ___.)"
        value={question.textTemplate}
        onChange={(e) => updateTemplate(e.target.value)}
      />
      {question.blanks.length > 0 ? (
        <div className="space-y-1.5">
          {question.blanks.map((blank, bIdx) => (
            <div key={bIdx} className="flex items-center gap-2">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-teal-500 text-white text-[10px] font-bold">{bIdx + 1}</span>
              <input className={inputClass} placeholder={`Correct word for blank ${bIdx + 1}`} value={blank} onChange={(e) => updateBlank(bIdx, e.target.value)} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-[var(--color-text-tertiary)]">Type ___ into the sentence above to create a blank.</p>
      )}
      <div>
        <p className="text-[10px] font-semibold text-[var(--color-text-secondary)] mb-1">Extra decoy words for the word bank (optional)</p>
        <div className="space-y-1.5">
          {question.distractors.map((word, dIdx) => (
            <div key={dIdx} className="flex items-center gap-2">
              <input className={inputClass} placeholder="Decoy word" value={word} onChange={(e) => updateDistractor(dIdx, e.target.value)} />
              <button type="button" onClick={() => removeDistractor(dIdx)} className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">✕</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addDistractor} className="text-xs text-primary-600 hover:text-primary-700 font-medium mt-1">+ Add Decoy Word</button>
      </div>
    </div>
  );
}

// ===========================================================================
// Word Scramble — unscramble the letters of `answer`
// ===========================================================================
function scrambleLetters(word: string): string {
  const letters = word.split('');
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  return letters.join('');
}

function WordScrambleEditor({ question, onChange }: { question: WordScrambleQuestion; onChange: (q: QuizQuestion) => void }) {
  const [preview, setPreview] = useState(() => scrambleLetters(question.answer || ''));

  return (
    <div className="space-y-1.5 mb-2">
      <input
        className={inputClass}
        placeholder="Word or short phrase to unscramble"
        value={question.answer}
        onChange={(e) => {
          onChange({ ...question, answer: e.target.value });
          setPreview(scrambleLetters(e.target.value));
        }}
      />
      {question.answer.trim() && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--color-text-tertiary)]">Scrambled preview:</span>
          <span className="font-mono tracking-widest text-sm font-bold text-orange-600 dark:text-orange-400">{preview.toUpperCase()}</span>
          <button
            type="button"
            onClick={() => setPreview(scrambleLetters(question.answer))}
            className="text-[10px] text-primary-600 hover:text-primary-700 font-medium"
          >
            🔀 Reshuffle
          </button>
        </div>
      )}
      <input
        className={inputClass}
        placeholder="Hint (optional)"
        value={question.hint || ''}
        onChange={(e) => onChange({ ...question, hint: e.target.value })}
      />
    </div>
  );
}

// ===========================================================================
// Sentence Build — drag word chips into the correct order
// ===========================================================================
function SentenceBuildEditor({ question, onChange }: { question: SentenceBuildQuestion; onChange: (q: QuizQuestion) => void }) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const updateWord = (idx: number, value: string) => {
    const words = [...question.words];
    words[idx] = value;
    onChange({ ...question, words });
  };
  const addWord = () => onChange({ ...question, words: [...question.words, ''] });
  const removeWord = (idx: number) => onChange({ ...question, words: question.words.filter((_, i) => i !== idx) });

  const handleDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) return;
    const words = [...question.words];
    const [moved] = words.splice(dragIdx, 1);
    words.splice(targetIdx, 0, moved);
    onChange({ ...question, words });
    setDragIdx(null);
  };

  const updateDistractor = (idx: number, value: string) => {
    const distractors = [...question.distractors];
    distractors[idx] = value;
    onChange({ ...question, distractors });
  };
  const addDistractor = () => onChange({ ...question, distractors: [...question.distractors, ''] });
  const removeDistractor = (idx: number) => onChange({ ...question, distractors: question.distractors.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-2 mb-2">
      <p className="text-[10px] text-[var(--color-text-tertiary)]">Drag the word chips into the correct sentence order.</p>
      <div className="space-y-1.5">
        {question.words.map((word, wIdx) => (
          <div
            key={wIdx}
            draggable
            onDragStart={() => setDragIdx(wIdx)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(wIdx)}
            className="flex items-center gap-2 rounded-lg border border-lime-200 dark:border-lime-800 bg-lime-50/50 dark:bg-lime-950/10 px-1 py-1"
          >
            <span className="cursor-grab text-lime-600 select-none px-1 text-sm">⠿</span>
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-lime-500 text-white text-xs font-bold">{wIdx + 1}</span>
            <input className={inputClass} placeholder={`Word ${wIdx + 1}`} value={word} onChange={(e) => updateWord(wIdx, e.target.value)} />
            {question.words.length > 2 && (
              <button type="button" onClick={() => removeWord(wIdx)} className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">✕</button>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={addWord} className="text-xs text-primary-600 hover:text-primary-700 font-medium">+ Add Word</button>

      <div>
        <p className="text-[10px] font-semibold text-[var(--color-text-secondary)] mb-1">Extra decoy words (optional, makes it harder)</p>
        <div className="space-y-1.5">
          {question.distractors.map((word, dIdx) => (
            <div key={dIdx} className="flex items-center gap-2">
              <input className={inputClass} placeholder="Decoy word" value={word} onChange={(e) => updateDistractor(dIdx, e.target.value)} />
              <button type="button" onClick={() => removeDistractor(dIdx)} className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">✕</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addDistractor} className="text-xs text-primary-600 hover:text-primary-700 font-medium mt-1">+ Add Decoy Word</button>
      </div>
    </div>
  );
}

export default QuestionEditor;
