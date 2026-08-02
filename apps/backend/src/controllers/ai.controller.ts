/**
 * AI Controller — DeepSeek-powered lesson & quiz content generation.
 *
 * Lesson generation: three entry points, matching the "AI Lesson Generator"
 * modal's three options: from a title, from pasted notes, and from an
 * uploaded document.
 *
 * Quiz generation: one entry point, matching the "AI Quiz Generator" modal's
 * two options: from existing course content (lessons) or from a custom
 * topic / pasted text, each with a per-type question count matrix.
 */

import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import CourseContent, { type ICourseContent } from '../models/course-content.model';
import Course from '../models/course.model';
import {
  generateLessonHtml,
  generateQuizQuestions,
  generateStopCheckQuestion,
  generateStopCheckQuestions,
  splitLessonWithAi,
  generateInteractiveLessonBlocks,
  generateAssignmentHtml,
  buildTutorSystemPrompt,
  tutorChatResponse,
  type QuestionCountSpec,
  type InteractiveContentMode,
  type StopCheckTypeMode,
} from '../utils/deepseek';
import { extractTextFromDocument } from '../utils/document-parser';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';

// ---------------------------------------------------------------------------
// POST /api/v1/ai/generate-lesson — mode: 'title' | 'notes'
// ---------------------------------------------------------------------------
export const generateFromText = async (req: Request, res: Response): Promise<Response> => {
  const { mode, title, notes } = req.body as { mode: 'title' | 'notes'; title?: string; notes?: string };

  let sourceText: string;
  if (mode === 'title') {
    if (!title || !title.trim()) throw new BadRequestError('A lesson title is required to generate from title.');
    sourceText = `Lesson title: "${title.trim()}". Write a full lesson body that thoroughly covers this topic.`;
  } else if (mode === 'notes') {
    if (!notes || !notes.trim()) throw new BadRequestError('Paste some notes or source text first.');
    sourceText = notes;
  } else {
    throw new BadRequestError('mode must be "title" or "notes".');
  }

  const html = await generateLessonHtml(sourceText);
  return ApiResponse.success(res, { html }, 'Lesson generated successfully');
};

// ---------------------------------------------------------------------------
// POST /api/v1/ai/generate-lesson/document — multipart file upload
// ---------------------------------------------------------------------------
export const generateFromDocument = async (req: Request, res: Response): Promise<Response> => {
  const file = req.file;
  if (!file) throw new BadRequestError('No file uploaded.');

  const extractedText = await extractTextFromDocument(file.buffer, file.originalname);
  if (!extractedText.trim()) {
    throw new BadRequestError('Could not find any readable text in that document.');
  }

  const html = await generateLessonHtml(extractedText);
  return ApiResponse.success(res, { html }, 'Lesson generated successfully');
};

/** Reshapes a backend StopCheckQuestion (correctOptionIndex) into the frontend's ContentBlockQuestion shape (correctIndex). */
function toContentBlockQuestion(q: { type: 'mcq' | 'true_false'; question: string; options?: string[]; correctOptionIndex?: number; correctAnswer?: boolean; explanation?: string }) {
  if (q.type === 'mcq') {
    return {
      type: 'mcq' as const,
      question: q.question,
      options: q.options || [],
      correctIndex: q.correctOptionIndex ?? 0,
      explanation: q.explanation,
      aiGenerated: true,
    };
  }
  return {
    type: 'true_false' as const,
    question: q.question,
    correctAnswer: q.correctAnswer ?? true,
    explanation: q.explanation,
    aiGenerated: true,
  };
}

// ---------------------------------------------------------------------------
// POST /api/v1/ai/generate-interactive-lesson — builds Interactive Gate
// content blocks (each with 1-3 Stop & Check questions) directly, without
// requiring the admin to first write Traditional content and split it.
// Matches the Interactive Gate mode's "AI Generate" (from title) and
// "Paste Content" (paraphrase or preserve-as-is) options.
// ---------------------------------------------------------------------------
export const generateInteractiveLesson = async (req: Request, res: Response): Promise<Response> => {
  const {
    source,
    title,
    pasteText,
    paraphrase,
    blockCount,
    questionsPerBlock,
    questionType,
  } = req.body as {
    source: 'title' | 'paste';
    title?: string;
    pasteText?: string;
    paraphrase?: boolean;
    blockCount: number;
    questionsPerBlock: number;
    questionType?: StopCheckTypeMode;
  };

  let sourceText: string;
  let contentMode: InteractiveContentMode;
  if (source === 'title') {
    if (!title || !title.trim()) throw new BadRequestError('A lesson title is required to generate from title.');
    sourceText = `Lesson title: "${title.trim()}". Write a full lesson body that thoroughly covers this topic.`;
    contentMode = 'compose';
  } else if (source === 'paste') {
    if (!pasteText || !pasteText.trim()) throw new BadRequestError('Paste some content first.');
    sourceText = pasteText;
    contentMode = paraphrase ? 'paraphrase' : 'preserve';
  } else {
    throw new BadRequestError('source must be "title" or "paste".');
  }

  const blocks = await generateInteractiveLessonBlocks({
    sourceText,
    blockCount: Number(blockCount) || 4,
    contentMode,
  });

  // Generate each block's questions in parallel. A single block's question
  // generation failing shouldn't discard the whole batch — that block just
  // ships with no questions, and the admin can add them manually.
  const questionResults = await Promise.allSettled(
    blocks.map((block) =>
      generateStopCheckQuestions(stripHtml(block.content), Number(questionsPerBlock) || 1, questionType || 'mixed')
    )
  );

  const blocksWithQuestions = blocks.map((block, i) => {
    const result = questionResults[i];
    const questions = result.status === 'fulfilled' ? result.value.map(toContentBlockQuestion) : [];
    return { ...block, questions };
  });

  return ApiResponse.success(res, { blocks: blocksWithQuestions }, 'Interactive lesson generated successfully');
};

// ---------------------------------------------------------------------------
// POST /api/v1/ai/generate-quiz — mode: 'content' | 'topic'
// ---------------------------------------------------------------------------
export const generateQuiz = async (req: Request, res: Response): Promise<Response> => {
  const {
    mode,
    title,
    rawText,
    lessonContents,
    customInstructions,
    questionCounts,
  } = req.body as {
    mode: 'content' | 'topic';
    title?: string;
    rawText?: string;
    lessonContents?: string[];
    customInstructions?: string;
    questionCounts: QuestionCountSpec[];
  };

  let sourceText: string;
  if (mode === 'content') {
    if (!Array.isArray(lessonContents) || lessonContents.length === 0) {
      throw new BadRequestError('Select at least one lesson to generate from.');
    }
    sourceText = lessonContents.join('\n\n---\n\n');
  } else if (mode === 'topic') {
    if (!rawText || !rawText.trim()) throw new BadRequestError('Paste some source text or notes first.');
    sourceText = title?.trim() ? `Topic: ${title.trim()}\n\n${rawText}` : rawText;
  } else {
    throw new BadRequestError('mode must be "content" or "topic".');
  }

  const result = await generateQuizQuestions(sourceText, customInstructions || '', questionCounts);
  return ApiResponse.success(res, result, 'Quiz questions generated successfully');
};

// ---------------------------------------------------------------------------
// POST /api/v1/ai/generate-stop-check-question — one gate question per
// lesson content block, for "Interactive Gate" delivery mode.
// ---------------------------------------------------------------------------
export const generateStopCheck = async (req: Request, res: Response): Promise<Response> => {
  const { blockText } = req.body as { blockText?: string };
  if (!blockText || !blockText.trim()) {
    throw new BadRequestError('No content block text to generate a question from.');
  }

  const question = await generateStopCheckQuestion(blockText);
  return ApiResponse.success(res, { question }, 'Question generated successfully');
};

// ---------------------------------------------------------------------------
// POST /api/v1/ai/generate-assignment — sourceType: 'lessons' | 'paste' | 'upload'
// Matches the Assignment admin form's "AI Generate" modal.
// ---------------------------------------------------------------------------
export const generateAssignment = async (req: Request, res: Response): Promise<Response> => {
  const { sourceType, customInstructions, pasteText, lessonContents } = req.body as {
    sourceType: 'lessons' | 'paste' | 'upload';
    customInstructions?: string;
    pasteText?: string;
    lessonContents?: string; // JSON-stringified string[]
  };

  let sourceText: string;
  if (sourceType === 'lessons') {
    let contents: string[] = [];
    try { contents = JSON.parse(lessonContents || '[]'); } catch { /* leave empty */ }
    if (!Array.isArray(contents) || contents.length === 0) {
      throw new BadRequestError('Select at least one lesson to generate from.');
    }
    sourceText = contents.join('\n\n---\n\n');
  } else if (sourceType === 'paste') {
    if (!pasteText || !pasteText.trim()) throw new BadRequestError('Paste some reference material first.');
    sourceText = pasteText;
  } else if (sourceType === 'upload') {
    if (!req.file) throw new BadRequestError('No file uploaded.');
    sourceText = await extractTextFromDocument(req.file.buffer, req.file.originalname);
    if (!sourceText.trim()) throw new BadRequestError('Could not find any readable text in that document.');
  } else {
    throw new BadRequestError('sourceType must be "lessons", "paste", or "upload".');
  }

  const content = await generateAssignmentHtml(sourceText, customInstructions);
  return ApiResponse.success(res, { content }, 'Assignment content generated successfully');
};

// ---------------------------------------------------------------------------
// POST /api/v1/ai/tutor/chat — student AI Tutor conversation endpoint
// Injects full lesson body content so the LLM response is strictly grounded.
// ---------------------------------------------------------------------------
export const tutorChat = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, lessonId, conversation, message } = req.body as {
    courseId: string;
    lessonId?: string;
    conversation?: { role: 'student' | 'tutor'; content: string }[];
    message: string;
  };

  if (!courseId) throw new BadRequestError('courseId is required.');
  if (!message || !message.trim()) throw new BadRequestError('message is required.');

  // 1. Fetch the course to get the title
  const course = await Course.findById(courseId).select('title').lean();
  if (!course) throw new NotFoundError('Course not found.');

  const courseTitle =
    (course.title as any)?.en || (course.title as any)?.so || (course.title as any)?.ar || 'Untitled Course';

  // 2. Determine chapter/lesson context
  let chapterTitle = 'General';
  let lessonTitle = 'Course Overview';
  let lessonContent = 'No specific lesson is currently selected. The student is browsing the general course material.';

  if (lessonId) {
    // Fetch course content and find the specific lesson
    const doc = await CourseContent.findOne({ course: courseId }).lean();
    if (doc) {
      for (const chapter of doc.chapters) {
        for (const item of chapter.items) {
          const itemId = (item as any)._id?.toString();
          if (itemId === lessonId && ((item as any).type === 'lesson')) {
            chapterTitle = chapter.title;
            lessonTitle = (item as any).title || 'Lesson';

            // Get the full lesson body:
            //   - Traditional lessons: flat `content` (HTML string)
            //   - Interactive Gate lessons: array of `contentBlocks[]` each with `content` (HTML)
            const lessonItem = item as any;
            let rawContent = '';

            if (Array.isArray(lessonItem.contentBlocks) && lessonItem.contentBlocks.length > 0) {
              // Interactive Gate — concatenate text from each content block
              rawContent = lessonItem.contentBlocks
                .map((block: any) => block.content || '')
                .join('\n\n');
            } else if (typeof lessonItem.content === 'string' && lessonItem.content.trim()) {
              // Traditional — use flat content field
              rawContent = lessonItem.content;
            }

            lessonContent = stripHtml(rawContent) || '(This lesson has no text content yet.)';
            break;
          }
        }
      }
    }
  }

  // 3. Build the grounded system prompt with full lesson text
  const systemPrompt = buildTutorSystemPrompt({
    courseTitle,
    chapterTitle,
    lessonTitle,
    lessonContent: lessonContent.slice(0, 32000), // Cap at ~32K chars for context window
  });

  // 4. Call DeepSeek with conversation history
  const response = await tutorChatResponse({
    systemPrompt,
    conversation: conversation || [],
    userMessage: message.trim(),
  });

  return ApiResponse.success(res, { reply: response }, 'Tutor response generated');
};

// ---------------------------------------------------------------------------
// POST /api/v1/ai/tutor/voice-note — stores a recorded voice message
//
// No speech-to-text is configured on this server (that needs an OpenAI/Groq
// Whisper key, not the DeepSeek key already set up) — this endpoint only
// stores the audio file and returns its URL so it can be played back and
// shown as a message. It does NOT transcribe or feed the audio to the tutor.
// ---------------------------------------------------------------------------
export const uploadVoiceNote = async (req: Request, res: Response): Promise<Response> => {
  if (!req.file) throw new BadRequestError('No audio file provided.');

  const uploadsDir = path.join(process.cwd(), 'uploads', 'voice-notes');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const ext = req.file.mimetype === 'audio/mp4' ? 'm4a' : req.file.mimetype.split('/')[1]?.split(';')[0] || 'webm';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer);

  // Served back through getVoiceNote below (authenticated stream), not a
  // raw static path — this server doesn't mount express.static for uploads.
  return ApiResponse.success(res, { url: `/api/v1/ai/tutor/voice-note/${filename}` }, 'Voice note uploaded');
};

// ---------------------------------------------------------------------------
// GET /api/v1/ai/tutor/voice-note/:filename — stream a voice note back
// ---------------------------------------------------------------------------
const VOICE_NOTE_FILENAME_RE = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/;
const AUDIO_MIME_TYPES: Record<string, string> = {
  webm: 'audio/webm', mp3: 'audio/mpeg', mpeg: 'audio/mpeg', wav: 'audio/wav',
  ogg: 'audio/ogg', m4a: 'audio/mp4',
};

export const getVoiceNote = async (req: Request, res: Response): Promise<Response | void> => {
  const { filename } = req.params;
  if (!VOICE_NOTE_FILENAME_RE.test(filename)) throw new BadRequestError('Invalid filename.');

  const filePath = path.join(process.cwd(), 'uploads', 'voice-notes', filename);
  if (!fs.existsSync(filePath)) throw new NotFoundError('Voice note');

  const ext = path.extname(filename).slice(1).toLowerCase();
  res.setHeader('Content-Type', AUDIO_MIME_TYPES[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(filePath).pipe(res);
};

/**
 * Strip HTML tags from a string, convert entities, and collapse whitespace
 * to create clean plain text for LLM context injection.
 */
function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')          // Remove tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&/gi, '&')
    .replace(/</gi, '<')
    .replace(/>/gi, '>')
    .replace(/"/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')              // Collapse whitespace
    .trim();
}

// ---------------------------------------------------------------------------
// POST /api/v1/ai/split-lesson — turn a Traditional lesson body into ordered
// Content Blocks for Interactive Gate delivery mode. Each block also gets
// its Stop & Check question generated up front, so the admin doesn't have
// to open every block individually and click "Generate Question" — that's
// the whole point of asking the AI to do this in one pass.
// ---------------------------------------------------------------------------
export const splitLesson = async (req: Request, res: Response): Promise<Response> => {
  const { html } = req.body as { html?: string };
  if (!html || !html.trim()) {
    throw new BadRequestError('No lesson content to split.');
  }

  const blocks = await splitLessonWithAi(html);

  // Generate all block questions in parallel. A single block's question
  // generation failing (e.g. a transient DeepSeek error) shouldn't discard
  // the whole split — that block just ships without a question, and the
  // admin can still generate/add one manually from the block editor.
  const questionResults = await Promise.allSettled(
    blocks.map((block) => generateStopCheckQuestion(stripHtml(block.content)))
  );

  const blocksWithQuestions = blocks.map((block, i) => {
    const result = questionResults[i];
    return {
      ...block,
      question: result.status === 'fulfilled' ? result.value : undefined,
    };
  });

  return ApiResponse.success(res, { blocks: blocksWithQuestions }, 'Lesson split into blocks successfully');
};
