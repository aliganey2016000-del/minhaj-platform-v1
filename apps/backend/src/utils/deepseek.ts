/**
 * DeepSeek Client — turns raw lesson source text into clean semantic HTML.
 *
 * Requires DEEPSEEK_API_KEY in the environment. Get a key at
 * https://platform.deepseek.com — never expose it to the frontend.
 */

import axios from 'axios';
import { BadRequestError, InternalServerError } from './api-error';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
// 'deepseek-chat' was retired — the API now only accepts 'deepseek-v4-pro'
// or 'deepseek-v4-flash'. Flash is the fast/cheap tier, plenty for the
// structured generation tasks in this file (quiz/exam/lesson/assignment
// content, chat replies) — none of them need the heavier pro tier.
const DEEPSEEK_MODEL = 'deepseek-v4-flash';

// Keep the prompt bounded so a huge document upload can't blow past
// request/token limits — DeepSeek's context window is much larger than this,
// this is purely a defensive cap on our side.
const MAX_SOURCE_CHARS = 24000;
const MAX_TUTOR_CONTEXT_CHARS = 32000;

const SYSTEM_PROMPT = `You are an expert Islamic studies curriculum writer. You convert raw source material into a single, polished LMS lesson.

Return ONLY clean, semantic HTML for the lesson body — no markdown, no code fences, no <html>/<head>/<body> wrapper, and no commentary before or after the HTML.

Structure the output using:
- <h2> for major sections, <h3> for sub-sections
- <p> for explanatory paragraphs
- <ul>/<li> for bullet points, <ol>/<li> for sequential or numbered steps
- <strong> for key terms and important emphasis
- <blockquote> for direct Qur'an ayat, hadith, or definitions — cite the source inside the blockquote where it is known from the source material (e.g. "— Surah Al-Baqarah, 2:255")

Keep the tone clear, respectful, and appropriate for students. Do not invent religious rulings, hadith, or Qur'an citations that are not present in or directly implied by the source text — if the source material is thin, expand pedagogically (definitions, context, examples) without fabricating religious sources.`;

// ===========================================================================
// AI Tutor Chat — Context-grounded tutoring session for students.
// ===========================================================================

/**
 * System prompt used when the student is chatting with the AI Tutor.
 * Injects the full lesson body text so responses are strictly grounded.
 */
export function buildTutorSystemPrompt(params: {
  courseTitle: string;
  chapterTitle: string;
  lessonTitle: string;
  lessonContent: string; // Full lesson body (HTML stripped to plain text)
}): string {
  return `You are an expert academic AI Tutor for the Sahal Education Platform. Your behavior must be strictly context-aware and grounded.

You are provided with the following source lesson material:
---
Course: ${params.courseTitle}
Chapter: ${params.chapterTitle}
Lesson Title: ${params.lessonTitle}
Lesson Content: ${params.lessonContent}
---

Instructions:
- Answer the student's questions based ONLY on the Lesson Content provided above.
- If the student asks for a summary, a quiz, or an explanation, formulate it explicitly using the historical events, names, dates, and facts present in the text (e.g., specific clans, locations, or historical dates regarding the topic).
- Never give generic answers like "This chapter focuses on important concepts." Be highly specific, factual, and educational.
- If the Lesson Content is in Somali (Soomaali), respond in Somali. If it is in Arabic, respond in Arabic. Otherwise respond in English.
- Keep your responses clear, structured, and student-friendly. Use bullet points and numbered lists where helpful.
- If the student asks something not covered in the lesson content, acknowledge that it's outside the current material and suggest they ask about something within the lesson.`;
}

/**
 * Send a single conversational message to the AI Tutor and get a grounded
 * response back. This is the student-facing chat endpoint function — it
 * packages the full conversation history together with the system prompt so
 * DeepSeek has full context.
 */
export async function tutorChatResponse(params: {
  systemPrompt: string;    // output of buildTutorSystemPrompt()
  conversation: { role: 'student' | 'tutor'; content: string }[];
  userMessage: string;
}): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new InternalServerError('AI Tutor is not configured on this server (missing DEEPSEEK_API_KEY).');
  }

  const trimmed = (params.userMessage || '').trim();
  if (!trimmed) {
    throw new BadRequestError('No message to send.');
  }

  // Build messages array: system prompt + conversation history + current message
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: params.systemPrompt },
  ];

  // Include recent conversation history (last 20 messages to avoid blowing context)
  const recentHistory = (params.conversation || []).slice(-20);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role === 'tutor' ? 'assistant' : 'user',
      content: msg.content,
    });
  }

  // Add the current user message
  messages.push({ role: 'user', content: trimmed });

  let response;
  try {
    response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: DEEPSEEK_MODEL,
        messages,
        temperature: 0.5,
        max_tokens: 2000,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60_000,
      }
    );
  } catch (err: any) {
    const status = err.response?.status;
    const detail = err.response?.data?.error?.message || err.message;
    throw new InternalServerError(`DeepSeek request failed${status ? ` (${status})` : ''}: ${detail}`);
  }

  const content: string = response.data?.choices?.[0]?.message?.content || '';
  if (!content.trim()) {
    throw new InternalServerError('AI Tutor returned an empty response. Please try again.');
  }

  return content.trim();
}

// ---------------------------------------------------------------------------
// Existing exports below (lesson generation, quiz, etc.)
// ---------------------------------------------------------------------------

export async function generateLessonHtml(sourceText: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new InternalServerError('AI lesson generation is not configured on this server (missing DEEPSEEK_API_KEY).');
  }

  const trimmed = (sourceText || '').trim();
  if (!trimmed) {
    throw new BadRequestError('No source text to generate a lesson from.');
  }

  const clipped =
    trimmed.length > MAX_SOURCE_CHARS
      ? `${trimmed.slice(0, MAX_SOURCE_CHARS)}\n\n[...source truncated for length...]`
      : trimmed;

  let response;
  try {
    response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Write a complete lesson from this source material:\n\n${clipped}` },
        ],
        temperature: 0.4,
        max_tokens: 4000,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60_000,
      }
    );
  } catch (err: any) {
    const status = err.response?.status;
    const detail = err.response?.data?.error?.message || err.message;
    throw new InternalServerError(`DeepSeek request failed${status ? ` (${status})` : ''}: ${detail}`);
  }

  const raw: string = response.data?.choices?.[0]?.message?.content || '';
  const html = stripCodeFences(raw);
  if (!html) {
    throw new InternalServerError('DeepSeek returned an empty response. Please try again.');
  }
  return html;
}

// ---------------------------------------------------------------------------
// AI Assignment Generator — turns source material into an assignment
// description/instructions block (task framing, not a teaching lesson).
// ---------------------------------------------------------------------------

const ASSIGNMENT_SYSTEM_PROMPT = `You are an expert Islamic studies teacher who writes clear homework/assignment briefs for students.

Return ONLY clean, semantic HTML for the assignment description — no markdown, no code fences, no <html>/<head>/<body> wrapper, and no commentary before or after the HTML.

Structure the output using:
- <p> to frame the task and what the student must do
- <ol>/<li> for step-by-step instructions or numbered questions to answer
- <ul>/<li> for any supporting bullet points (requirements, things to include)
- <strong> for key terms, deadlines-related emphasis, or important instructions

Base the assignment on the provided source material. Write it as a task for the student to complete (e.g. "Answer the following questions...", "Write a short reflection on...", "Summarize..."), not as a lesson explaining the topic. Follow any custom instructions given exactly.`;

export async function generateAssignmentHtml(sourceText: string, customInstructions?: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new InternalServerError('AI assignment generation is not configured on this server (missing DEEPSEEK_API_KEY).');
  }

  const trimmed = (sourceText || '').trim();
  if (!trimmed) {
    throw new BadRequestError('No source material to generate an assignment from.');
  }

  const clipped =
    trimmed.length > MAX_SOURCE_CHARS
      ? `${trimmed.slice(0, MAX_SOURCE_CHARS)}\n\n[...source truncated for length...]`
      : trimmed;

  const instructionsBlock = customInstructions?.trim()
    ? `\n\nCustom instructions from the teacher: ${customInstructions.trim()}`
    : '';

  let response;
  try {
    response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: ASSIGNMENT_SYSTEM_PROMPT },
          { role: 'user', content: `Write an assignment based on this source material:\n\n${clipped}${instructionsBlock}` },
        ],
        temperature: 0.4,
        max_tokens: 3000,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60_000,
      }
    );
  } catch (err: any) {
    const status = err.response?.status;
    const detail = err.response?.data?.error?.message || err.message;
    throw new InternalServerError(`DeepSeek request failed${status ? ` (${status})` : ''}: ${detail}`);
  }

  const raw: string = response.data?.choices?.[0]?.message?.content || '';
  const html = stripCodeFences(raw);
  if (!html) {
    throw new InternalServerError('DeepSeek returned an empty response. Please try again.');
  }
  return html;
}

/** Defensive cleanup in case the model wraps its answer in a markdown fence despite instructions. */
function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json|html)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

// ---------------------------------------------------------------------------
// AI Quiz Generator — turns source material into structured, typed questions
// ---------------------------------------------------------------------------

export interface QuestionCountSpec {
  type: string;
  count: number;
}

/** Exact JSON shape required per question type — embedded directly in the prompt. */
const QUESTION_SHAPES = `
"mcq": { "type": "mcq", "question": string, "options": string[] (at least 2), "correctIndex": number (0-based index into options), "explanation": string, "points": number }
"true_false": { "type": "true_false", "question": string, "correctAnswer": boolean, "explanation": string, "points": number }
"matching": { "type": "matching", "question": string, "pairs": [{ "left": string, "right": string }] (at least 2 pairs), "explanation": string, "points": number }
"ordering": { "type": "ordering", "question": string, "items": string[] (at least 2, already in the CORRECT sequence), "explanation": string, "points": number }
"picture_choice": { "type": "picture_choice", "question": string, "choices": [{ "image": "", "label": string }] (at least 2; ALWAYS leave "image" as an empty string — a human adds real images later), "correctIndex": number, "explanation": string, "points": number }
"swipe_sort": { "type": "swipe_sort", "question": string, "leftLabel": string, "rightLabel": string, "cards": [{ "text": string, "correctSide": "left" | "right" }] (at least 2), "explanation": string, "points": number }
"listen_write": { "type": "listen_write", "question": string, "audioUrl": "" (ALWAYS empty string — a human adds real audio later), "correctText": string, "hint": string, "explanation": string, "points": number }
"fill_blank": { "type": "fill_blank", "question": string, "textTemplate": string (a sentence using "___" for each blank), "blanks": string[] (one correct word per "___", in left-to-right order), "distractors": string[] (2-4 decoy words for the word bank), "explanation": string, "points": number }
"word_scramble": { "type": "word_scramble", "question": string, "answer": string (the word/phrase to unscramble), "hint": string, "explanation": string, "points": number }
"sentence_build": { "type": "sentence_build", "question": string, "words": string[] (the sentence's words in the CORRECT order), "distractors": string[] (2-4 decoy words), "explanation": string, "points": number }
`.trim();

const callDeepSeekForQuestions = async (apiKey: string, messages: { role: string; content: string }[]): Promise<any[]> => {
  let response;
  try {
    response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: DEEPSEEK_MODEL,
        messages,
        temperature: 0.6,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 90_000,
      }
    );
  } catch (err: any) {
    const status = err.response?.status;
    const detail = err.response?.data?.error?.message || err.message;
    throw new InternalServerError(`DeepSeek request failed${status ? ` (${status})` : ''}: ${detail}`);
  }

  const raw: string = response.data?.choices?.[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(stripCodeFences(raw));
    return Array.isArray(parsed?.questions) ? parsed.questions : [];
  } catch {
    throw new InternalServerError('DeepSeek returned malformed JSON. Please try again.');
  }
};

export interface QuizGenerationResult {
  questions: any[];
  requested: number;
  /** Set when DeepSeek under-delivered even after one retry — surfaced to the admin instead of silently accepting fewer questions than asked for. */
  shortfallWarning?: string;
}

export async function generateQuizQuestions(
  sourceText: string,
  customInstructions: string,
  counts: QuestionCountSpec[]
): Promise<QuizGenerationResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new InternalServerError('AI quiz generation is not configured on this server (missing DEEPSEEK_API_KEY).');
  }

  const trimmed = (sourceText || '').trim();
  if (!trimmed) {
    throw new BadRequestError('No source material to generate quiz questions from.');
  }

  const validCounts = (counts || []).filter((c) => c && c.type && c.count > 0);
  if (validCounts.length === 0) {
    throw new BadRequestError('Select at least one question type and count.');
  }

  const clipped =
    trimmed.length > MAX_SOURCE_CHARS
      ? `${trimmed.slice(0, MAX_SOURCE_CHARS)}\n\n[...source truncated for length...]`
      : trimmed;

  const countsList = validCounts.map((c) => `- exactly ${c.count} question(s) of type "${c.type}"`).join('\n');
  const totalRequested = validCounts.reduce((sum, c) => sum + c.count, 0);

  const systemPrompt = `You are an expert quiz writer for an Islamic studies LMS aimed at school-age students. You turn source material into a set of gamified, interactive quiz questions.

Return ONLY a single JSON object of the shape {"questions": [...]} — no markdown, no code fences, no commentary before or after.

Each element of "questions" must be one object matching EXACTLY the shape for its type (all fields required unless noted):

${QUESTION_SHAPES}

Generation rules:
- Generate EXACTLY these counts, no more, no less (total ${totalRequested} questions) — this is a strict, non-negotiable requirement, not a target:
${countsList}
- Every question must be answerable directly from the SOURCE MATERIAL provided by the user — do not invent facts, hadith, or Qur'an citations not present in or directly implied by it.
- If the source material seems short for the requested count, DO NOT reduce the number of questions — instead vary the angle (different sentences, specific details, speakers, order of events, vocabulary, or rephrasing the same underlying fact from a different direction) so each question is still distinct and valid. Producing fewer questions than requested is a failure even if the material is thin.
- Keep language clear, friendly, and age-appropriate.
- Vary the specific facts/angles tested across questions of the same type so they don't repeat each other.${
    customInstructions?.trim() ? `\n- Additional instructions from the teacher: ${customInstructions.trim()}` : ''
  }`;

  const userContent = `SOURCE MATERIAL:\n\n${clipped}`;
  let questions = await callDeepSeekForQuestions(apiKey, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ]);

  // DeepSeek sometimes under-delivers on thin source material despite the
  // "exactly N" instruction above — one retry, explicitly told the shortfall,
  // recovers most of these without silently handing the admin fewer
  // questions than they asked for.
  if (questions.length < totalRequested) {
    const missing = totalRequested - questions.length;
    const retryQuestions = await callDeepSeekForQuestions(apiKey, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
      { role: 'assistant', content: JSON.stringify({ questions }) },
      {
        role: 'user',
        content: `You only returned ${questions.length} of the ${totalRequested} required questions. Generate ${missing} MORE question(s) to reach the exact required counts, covering whichever type(s) are still short. Vary the angle from the questions already generated above so nothing repeats. Return ONLY the ${missing} additional question(s) as {"questions": [...]}, not the full set again.`,
      },
    ]);
    questions = [...questions, ...retryQuestions];
  }

  if (questions.length === 0) {
    throw new InternalServerError('DeepSeek did not return any questions. Please try again.');
  }

  const result: QuizGenerationResult = {
    questions: questions.map((q: any) => normalizeAiQuestion(q)),
    requested: totalRequested,
  };
  if (questions.length < totalRequested) {
    result.shortfallWarning = `Only ${questions.length} of ${totalRequested} requested questions were generated — the source material may be too short for this many distinct questions. Try reducing the count or providing more content.`;
  }
  return result;
}

// ---------------------------------------------------------------------------
// AI Stop & Check Generator — one short comprehension question per lesson
// content block, for "Interactive Gate" delivery mode.
// ---------------------------------------------------------------------------

export interface StopCheckQuestion {
  type: 'mcq' | 'true_false';
  question: string;
  options?: string[];
  correctOptionIndex?: number;
  correctAnswer?: boolean;
  explanation?: string;
  aiGenerated: true;
}

const STOP_CHECK_SYSTEM_PROMPT = `You write one short comprehension-check question for a single paragraph of lesson content, used to verify a student actually read it before moving on.

Return ONLY a single JSON object — no markdown, no code fences, no commentary:
- MCQ: { "type": "mcq", "question": string, "options": string[] (exactly 3), "correctOptionIndex": number (0-based), "explanation": string }
- True/False: { "type": "true_false", "question": string, "correctAnswer": boolean, "explanation": string }

Rules:
- The question must be answerable purely from the paragraph given — do not require outside knowledge.
- Prefer MCQ unless the paragraph makes a single clear factual claim well suited to true/false.
- Keep the question short and unambiguous, one correct answer only.
- For MCQ, the two incorrect options must be plausible-sounding but clearly wrong to someone who read the paragraph.
- "explanation" is one short sentence shown to the student ONLY if they answer incorrectly — it should point back to what the paragraph actually says, not just restate the correct option.`;

export async function generateStopCheckQuestion(blockText: string): Promise<StopCheckQuestion> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new InternalServerError('AI question generation is not configured on this server (missing DEEPSEEK_API_KEY).');
  }

  const trimmed = (blockText || '').trim();
  if (!trimmed) {
    throw new BadRequestError('No content block text to generate a question from.');
  }

  const clipped = trimmed.length > 4000 ? trimmed.slice(0, 4000) : trimmed;

  let response;
  try {
    response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: STOP_CHECK_SYSTEM_PROMPT },
          { role: 'user', content: clipped },
        ],
        temperature: 0.4,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      }
    );
  } catch (err: any) {
    const status = err.response?.status;
    const detail = err.response?.data?.error?.message || err.message;
    throw new InternalServerError(`DeepSeek request failed${status ? ` (${status})` : ''}: ${detail}`);
  }

  const raw: string = response.data?.choices?.[0]?.message?.content || '{}';
  let parsed: any;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    throw new InternalServerError('DeepSeek returned malformed JSON. Please try again.');
  }

  return normalizeStopCheckQuestion(parsed);
}

/** Same defensive-normalization philosophy as normalizeAiQuestion, scoped to the 2 gate question types. */
function normalizeStopCheckQuestion(raw: any): StopCheckQuestion {
  const question = String(raw?.question || '').trim() || 'What does this paragraph say?';
  const explanation = String(raw?.explanation || '').trim();

  if (raw?.type === 'true_false') {
    return {
      type: 'true_false',
      question,
      correctAnswer: typeof raw.correctAnswer === 'boolean' ? raw.correctAnswer : true,
      explanation,
      aiGenerated: true,
    };
  }

  let options = Array.isArray(raw?.options) ? raw.options.map(String).slice(0, 3) : [];
  while (options.length < 3) options.push('');
  const correctOptionIndex =
    typeof raw?.correctOptionIndex === 'number' && raw.correctOptionIndex >= 0 && raw.correctOptionIndex < options.length
      ? raw.correctOptionIndex
      : 0;

  return { type: 'mcq', question, options, correctOptionIndex, explanation, aiGenerated: true };
}

export type StopCheckTypeMode = 'mixed' | 'mcq' | 'true_false';

const STOP_CHECK_MULTI_SYSTEM_PROMPT_BASE = `You write short comprehension-check questions for a single paragraph of lesson content, used to verify a student actually read it before moving on.

Return ONLY a single JSON object — no markdown, no code fences, no commentary:
{"questions": [ { "type": "mcq", "question": string, "options": string[] (exactly 3), "correctOptionIndex": number (0-based), "explanation": string } | { "type": "true_false", "question": string, "correctAnswer": boolean, "explanation": string }, ... ]}

Rules:
- Every question must be answerable purely from the paragraph given — do not require outside knowledge.
- Each question must test a DIFFERENT fact or idea from the paragraph — never ask the same thing twice.
- Keep questions short and unambiguous, one correct answer only.
- For MCQ, the two incorrect options must be plausible-sounding but clearly wrong to someone who read the paragraph.
- "explanation" is one short sentence shown to the student ONLY if they answer incorrectly — it should point back to what the paragraph actually says, not just restate the correct option.`;

/** Generates `count` distinct comprehension questions for one content block in a single DeepSeek call. */
export async function generateStopCheckQuestions(
  blockText: string,
  count: number,
  typeMode: StopCheckTypeMode = 'mixed'
): Promise<StopCheckQuestion[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new InternalServerError('AI question generation is not configured on this server (missing DEEPSEEK_API_KEY).');
  }

  const trimmed = (blockText || '').trim();
  if (!trimmed) {
    throw new BadRequestError('No content block text to generate a question from.');
  }

  const clampedCount = Math.min(Math.max(Math.round(count) || 1, 1), 3);
  const clipped = trimmed.length > 4000 ? trimmed.slice(0, 4000) : trimmed;
  const typeInstruction =
    typeMode === 'mcq'
      ? 'Every question must be type "mcq".'
      : typeMode === 'true_false'
        ? 'Every question must be type "true_false".'
        : 'Mix MCQ and True/False questions naturally.';
  const systemPrompt = `${STOP_CHECK_MULTI_SYSTEM_PROMPT_BASE}\n- Write exactly ${clampedCount} question${clampedCount === 1 ? '' : 's'}.\n- ${typeInstruction}`;

  let response;
  try {
    response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: clipped },
        ],
        temperature: 0.4,
        max_tokens: 900,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      }
    );
  } catch (err: any) {
    const status = err.response?.status;
    const detail = err.response?.data?.error?.message || err.message;
    throw new InternalServerError(`DeepSeek request failed${status ? ` (${status})` : ''}: ${detail}`);
  }

  const raw: string = response.data?.choices?.[0]?.message?.content || '{}';
  let parsed: any;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    throw new InternalServerError('DeepSeek returned malformed JSON. Please try again.');
  }

  const rawQuestions = Array.isArray(parsed?.questions) ? parsed.questions : [];
  return rawQuestions.slice(0, clampedCount).map(normalizeStopCheckQuestion);
}

// ---------------------------------------------------------------------------
// AI Lesson Splitter — turns one Traditional-mode lesson body into ordered
// "Content Blocks" for Interactive Gate delivery mode.
// ---------------------------------------------------------------------------

export interface SplitLessonBlock {
  title: string;
  content: string; // HTML, heading tags stripped (title carries that instead)
}

const SPLIT_LESSON_SYSTEM_PROMPT = `You split a lesson's HTML content into logical teaching sections for a "Stop and Check" interactive reading flow, where a student reads one section at a time.

Return ONLY a single JSON object — no markdown, no code fences, no commentary:
{"blocks": [{"title": string, "content": string}, ...]}

Rules:
- Split at natural topic boundaries: existing headings (h1-h4), or clear shifts in subject within a long section.
- "title" is a short heading for the section (use the source heading text if there is one, otherwise write a short 3-6 word summary of that section).
- "content" is clean HTML for just that section's body (paragraphs, lists, blockquotes as needed) — do NOT include any heading tag in "content", the heading goes in "title" only.
- Preserve the original wording exactly — you are splitting, not rewriting or summarizing.
- Each block should be readable in well under a minute — split a long section into multiple blocks if needed.
- Produce between 2 and 10 blocks depending on the source length. Never return just 1 block unless the source is a single short paragraph.`;

export async function splitLessonWithAi(html: string): Promise<SplitLessonBlock[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new InternalServerError('AI lesson splitting is not configured on this server (missing DEEPSEEK_API_KEY).');
  }

  const trimmed = (html || '').trim();
  if (!trimmed) {
    throw new BadRequestError('No lesson content to split.');
  }

  const clipped =
    trimmed.length > MAX_SOURCE_CHARS
      ? `${trimmed.slice(0, MAX_SOURCE_CHARS)}\n\n[...source truncated for length...]`
      : trimmed;

  let response;
  try {
    response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: SPLIT_LESSON_SYSTEM_PROMPT },
          { role: 'user', content: `Split this lesson content:\n\n${clipped}` },
        ],
        temperature: 0.2,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 90_000,
      }
    );
  } catch (err: any) {
    const status = err.response?.status;
    const detail = err.response?.data?.error?.message || err.message;
    throw new InternalServerError(`DeepSeek request failed${status ? ` (${status})` : ''}: ${detail}`);
  }

  const raw: string = response.data?.choices?.[0]?.message?.content || '{}';
  let parsed: any;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    throw new InternalServerError('DeepSeek returned malformed JSON. Please try again.');
  }

  const blocks = Array.isArray(parsed?.blocks) ? parsed.blocks : [];
  if (blocks.length === 0) {
    throw new InternalServerError('DeepSeek did not return any sections. Please try again.');
  }

  return blocks
    .map((b: any) => ({
      title: String(b?.title || '').trim(),
      content: String(b?.content || '').trim(),
    }))
    .filter((b: SplitLessonBlock) => b.content.length > 0);
}

// ---------------------------------------------------------------------------
// AI Interactive Lesson Generator — builds a full set of "Content Blocks"
// (each with its own Stop & Check question(s)) in one flow, for the
// Interactive Gate delivery mode's "AI Generate" / "Paste Content" options.
// Unlike splitLessonWithAi (which only reorganizes an EXISTING Traditional
// body), this composes fresh content from a topic, or paraphrases/preserves
// pasted source text — matching the admin's actual starting point when they
// pick "Interactive Gate" mode before writing anything.
// ---------------------------------------------------------------------------

export type InteractiveContentMode = 'compose' | 'paraphrase' | 'preserve';

export interface GenerateInteractiveBlocksParams {
  sourceText: string;
  blockCount: number;
  contentMode: InteractiveContentMode;
}

const INTERACTIVE_SPLIT_SYSTEM_PROMPT_BASE = `You prepare a lesson's content for a "Stop and Check" interactive reading flow, where a student reads one short section at a time and answers a question before continuing.

Return ONLY a single JSON object — no markdown, no code fences, no commentary:
{"blocks": [{"title": string, "content": string}, ...]}

Rules:
- "title" is a short heading for the section (3-6 words).
- "content" is clean HTML for just that section's body (paragraphs, lists, blockquotes as needed) — do NOT include any heading tag in "content", the heading goes in "title" only.
- Each block should be readable in well under a minute.`;

export async function generateInteractiveLessonBlocks(params: GenerateInteractiveBlocksParams): Promise<SplitLessonBlock[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new InternalServerError('AI lesson generation is not configured on this server (missing DEEPSEEK_API_KEY).');
  }

  const { sourceText, blockCount, contentMode } = params;
  const trimmed = (sourceText || '').trim();
  if (!trimmed) {
    throw new BadRequestError('No source text to generate from.');
  }

  const clipped =
    trimmed.length > MAX_SOURCE_CHARS
      ? `${trimmed.slice(0, MAX_SOURCE_CHARS)}\n\n[...source truncated for length...]`
      : trimmed;

  const clampedCount = Math.min(Math.max(Math.round(blockCount) || 4, 2), 12);

  let modeInstruction: string;
  if (contentMode === 'compose') {
    modeInstruction = `- Compose full, well-explained original lesson content on this topic — do not just restate the topic in one line, thoroughly teach it.\n- Produce exactly ${clampedCount} blocks, each covering a distinct sub-topic that together fully teach the subject.`;
  } else if (contentMode === 'paraphrase') {
    modeInstruction = `- Rewrite the source material in clearer, more polished language while preserving its meaning and every factual point — this is a paraphrase/polish pass, not new invented content.\n- Split the (paraphrased) material into exactly ${clampedCount} blocks if it naturally supports that many; otherwise use as many well-formed blocks as the material supports.`;
  } else {
    modeInstruction = `- Preserve the source wording exactly — split it into sections, do not rewrite, paraphrase, or summarize any of it.\n- Aim for exactly ${clampedCount} blocks if the source naturally supports it; if the source is too short, produce as many well-formed blocks as it supports (never pad with filler or invented text).`;
  }

  const systemPrompt = `${INTERACTIVE_SPLIT_SYSTEM_PROMPT_BASE}\n${modeInstruction}`;

  let response;
  try {
    response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contentMode === 'compose' ? clipped : `Source material:\n\n${clipped}` },
        ],
        temperature: contentMode === 'preserve' ? 0.2 : 0.5,
        // Composing/paraphrasing can require noticeably more output than the
        // source's own length (HTML markup +, for "compose", brand-new
        // prose) — 4000 was tuned for splitLessonWithAi's reformat-only
        // case and was cutting the response short (empty/invalid JSON) on
        // longer pastes, which is why this needs its own higher budget.
        max_tokens: 8000,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 90_000,
      }
    );
  } catch (err: any) {
    const status = err.response?.status;
    const detail = err.response?.data?.error?.message || err.message;
    throw new InternalServerError(`DeepSeek request failed${status ? ` (${status})` : ''}: ${detail}`);
  }

  const finishReason = response.data?.choices?.[0]?.finish_reason;
  const raw: string = response.data?.choices?.[0]?.message?.content || '{}';
  let parsed: any;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    if (finishReason === 'length') {
      throw new InternalServerError('The source text is too long to generate in one pass. Try pasting a shorter section, or reduce the number of blocks.');
    }
    throw new InternalServerError('DeepSeek returned malformed JSON. Please try again.');
  }

  const blocks = Array.isArray(parsed?.blocks) ? parsed.blocks : [];
  const normalized: SplitLessonBlock[] = blocks
    .map((b: any) => ({
      title: String(b?.title || '').trim(),
      content: String(b?.content || '').trim(),
    }))
    .filter((b: SplitLessonBlock) => b.content.length > 0);

  if (normalized.length === 0) {
    if (finishReason === 'length') {
      throw new InternalServerError('The source text is too long to generate in one pass. Try pasting a shorter section, or reduce the number of blocks.');
    }
    throw new InternalServerError('DeepSeek did not return any usable content blocks. Please try again.');
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// AI Question Normalizer — guarantees every question has the correct shape
// for its type, preventing frontend validation failures at save time.
// ---------------------------------------------------------------------------

/**
 * Sanitize and normalize an AI-generated question so every type has all
 * required fields with sensible defaults. DeepSeek occasionally omits
 * optional-seeming fields (e.g. options, correctIndex, pairs) or sends them
 * with the wrong type — this prevents the "Please fill in every question
 * completely" alert when the admin clicks "Save Changes".
 */
function normalizeAiQuestion(raw: any): any {
  const base = {
    type: String(raw.type || 'mcq'),
    question: String(raw.question || ''),
    explanation: String(raw.explanation || ''),
    points: typeof raw.points === 'number' && raw.points > 0 ? raw.points : 1,
  };

  switch (base.type) {
    case 'mcq': {
      let options = Array.isArray(raw.options) ? raw.options.map(String) : [];
      if (options.length < 2) {
        while (options.length < 2) options.push('');
      }
      const correctIndex =
        typeof raw.correctIndex === 'number' &&
        raw.correctIndex >= 0 &&
        raw.correctIndex < options.length
          ? raw.correctIndex
          : 0;
      return { ...base, options, correctIndex };
    }
    case 'true_false': {
      return {
        ...base,
        correctAnswer:
          typeof raw.correctAnswer === 'boolean' ? raw.correctAnswer : true,
      };
    }
    case 'matching': {
      const pairs = Array.isArray(raw.pairs)
        ? raw.pairs.map((p: any) => ({
            left: String(p.left ?? ''),
            right: String(p.right ?? ''),
          }))
        : [];
      if (pairs.length < 2) {
        while (pairs.length < 2) pairs.push({ left: '', right: '' });
      }
      return { ...base, pairs };
    }
    case 'ordering': {
      const items = Array.isArray(raw.items)
        ? raw.items.map(String)
        : [];
      if (items.length < 2) {
        while (items.length < 2) items.push('');
      }
      return { ...base, items };
    }
    case 'picture_choice': {
      const choices = Array.isArray(raw.choices)
        ? raw.choices.map((c: any) => ({
            image: String(c.image ?? ''),
            label: String(c.label ?? ''),
          }))
        : [];
      if (choices.length < 2) {
        while (choices.length < 2) choices.push({ image: '', label: '' });
      }
      const correctIndex =
        typeof raw.correctIndex === 'number' &&
        raw.correctIndex >= 0 &&
        raw.correctIndex < choices.length
          ? raw.correctIndex
          : 0;
      return { ...base, choices, correctIndex };
    }
    case 'swipe_sort': {
      const cards = Array.isArray(raw.cards)
        ? raw.cards.map((c: any) => ({
            text: String(c.text ?? ''),
            correctSide: c.correctSide === 'right' ? 'right' : 'left',
          }))
        : [];
      if (cards.length < 2) {
        while (cards.length < 2) cards.push({ text: '', correctSide: 'left' });
      }
      return {
        ...base,
        leftLabel: String(raw.leftLabel || 'Left'),
        rightLabel: String(raw.rightLabel || 'Right'),
        cards,
      };
    }
    case 'listen_write': {
      return {
        ...base,
        audioUrl: String(raw.audioUrl || ''),
        correctText: String(raw.correctText || ''),
        hint: String(raw.hint || ''),
      };
    }
    case 'fill_blank': {
      const blanks = Array.isArray(raw.blanks)
        ? raw.blanks.map(String)
        : [];
      const distractors = Array.isArray(raw.distractors)
        ? raw.distractors.map(String)
        : [];
      return {
        ...base,
        textTemplate: String(raw.textTemplate || ''),
        blanks: blanks.length > 0 ? blanks : [''],
        distractors,
      };
    }
    case 'word_scramble': {
      return {
        ...base,
        answer: String(raw.answer || ''),
        hint: String(raw.hint || ''),
      };
    }
    case 'sentence_build': {
      const words = Array.isArray(raw.words)
        ? raw.words.map(String)
        : [];
      const distractors = Array.isArray(raw.distractors)
        ? raw.distractors.map(String)
        : [];
      if (words.length < 2) {
        while (words.length < 2) words.push('');
      }
      return { ...base, words, distractors };
    }
    default: {
      // Unknown type — default to MCQ
      return {
        ...base,
        type: 'mcq',
        options: ['', ''],
        correctIndex: 0,
      };
    }
  }
}