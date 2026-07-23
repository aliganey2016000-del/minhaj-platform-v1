/**
 * Offline Interactive Gate grading — lets a Stop & Check block or video
 * checkpoint be graded locally (no network) by comparing a SHA-256 hash of
 * the attempted answer against `answerHash`, which the backend leaves in
 * place of the plaintext correct answer for student-facing reads (see
 * `hashGateAnswer` in backend/src/controllers/course-content.controller.ts —
 * this must stay byte-identical to that implementation).
 *
 * This is provisional grading only: the queued action still replays against
 * the real server endpoint on reconnect, which remains the actual source of
 * truth. Local grading exists purely so the student isn't blocked while
 * offline — a mismatch between local and server grading (e.g. stale content)
 * would only ever be caught after the fact, never exploitable to see the
 * answer, since the plaintext is never shipped to the client at all.
 */

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashGateAnswer(
  lessonId: string,
  scope: 'block' | 'checkpoint',
  index: number | string,
  answer: unknown
): Promise<string> {
  return sha256Hex(`${lessonId}:${scope}:${index}:${String(answer)}`);
}

/** Grades an attempt against a stripped question's answerHash. `undefined` answerHash means the lesson content is stale/not downloaded for offline use — treated as incorrect rather than silently "passing". */
export async function checkGateAnswerOffline(
  lessonId: string,
  scope: 'block' | 'checkpoint',
  index: number | string,
  answer: unknown,
  answerHash: string | undefined
): Promise<boolean> {
  if (!answerHash) return false;
  const attemptHash = await hashGateAnswer(lessonId, scope, index, answer);
  return attemptHash === answerHash;
}
