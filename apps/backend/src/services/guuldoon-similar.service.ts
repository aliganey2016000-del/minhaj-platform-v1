/**
 * Picks the "similar questions" shown after a wrong answer.
 *
 * Authors can list similar questions by hand, but a bad hand-made link shows
 * the student something unrelated. A question is only shown when it really
 * shares the topic: a common topic tag, or enough of the same key terms.
 */

const STOP = new Set([
  'that', 'this', 'with', 'which', 'what', 'when', 'where', 'whose', 'from', 'into', 'than', 'then', 'they', 'them', 'their',
  'there', 'these', 'those', 'have', 'been', 'were', 'will', 'would', 'could', 'should', 'does', 'each', 'about', 'also',
  'known', 'called', 'following', 'statement', 'correct', 'true', 'false', 'answer', 'choose', 'question', 'type', 'give',
  'name', 'state', 'explain', 'describe', 'define', 'write', 'lagu', 'waa', 'oo', 'iyo', 'ama', 'ayaa', 'kala', 'sida', 'maxay',
  'maxaa', 'yihiin', 'ahaan', 'kuwa', 'kuwan', 'halka', 'marka', 'inuu', 'inay', 'waxaa', 'loo', 'leh', 'jira',
]);

export function significantTerms(text: string): Set<string> {
  const terms = new Set<string>();
  for (const raw of String(text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 4 || STOP.has(raw)) continue;
    // Crude plural/-ing folding so "waves" matches "wave".
    terms.add(raw.replace(/(ing|es|s)$/u, ''));
  }
  return terms;
}

export type SimilarCandidate = { _id: unknown; textSo?: string; textEn?: string; topicTags?: string[]; options?: string[] };

const textOf = (question: SimilarCandidate) => `${question.textSo || ''} ${question.textEn || ''}`;

/** 0..1. A shared topic tag counts for a lot; otherwise the overlap of key terms decides. */
export function similarityScore(a: SimilarCandidate, b: SimilarCandidate): { score: number; shared: number } {
  const tagsA = new Set((a.topicTags || []).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean));
  const tagHits = (b.topicTags || []).filter((tag) => tagsA.has(String(tag).trim().toLowerCase())).length;
  const termsA = significantTerms(textOf(a));
  const termsB = significantTerms(textOf(b));
  let shared = 0;
  for (const term of termsA) if (termsB.has(term)) shared += 1;
  const smaller = Math.min(termsA.size, termsB.size);
  const overlap = smaller ? shared / smaller : 0;
  return { score: Math.min(1, overlap + Math.min(2, tagHits) * 0.3), shared };
}

const MIN_SCORE = 0.3;
const isRelated = (a: SimilarCandidate, b: SimilarCandidate) => {
  const { score, shared } = similarityScore(a, b);
  const sharesTag = score >= MIN_SCORE && (a.topicTags || []).some((tag) => (b.topicTags || []).includes(tag));
  return score >= MIN_SCORE && (shared >= 2 || sharesTag);
};

/**
 * Hand-made links stay when they are related; the rest of the slots are filled
 * with the best-matching questions from the same chapter. Fewer than `limit`
 * (even none) is fine: nothing is better than something unrelated.
 */
export function pickSimilar<T extends SimilarCandidate>(question: SimilarCandidate, manual: T[], pool: T[], limit = 2): T[] {
  const chosen: T[] = manual.filter((candidate) => String(candidate._id) !== String(question._id) && isRelated(question, candidate)).slice(0, limit);
  if (chosen.length >= limit) return chosen;
  const taken = new Set(chosen.map((item) => String(item._id)).concat(String(question._id)));
  const ranked = pool
    .filter((candidate) => !taken.has(String(candidate._id)) && isRelated(question, candidate))
    .map((candidate) => ({ candidate, score: similarityScore(question, candidate).score }))
    .sort((x, y) => y.score - x.score);
  for (const { candidate } of ranked) {
    if (chosen.length >= limit) break;
    chosen.push(candidate);
  }
  return chosen;
}
