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
import { generateLessonHtml, generateQuizQuestions, type QuestionCountSpec } from '../utils/deepseek';
import { extractTextFromDocument } from '../utils/document-parser';
import { BadRequestError } from '../utils/api-error';
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

  const questions = await generateQuizQuestions(sourceText, customInstructions || '', questionCounts);
  return ApiResponse.success(res, { questions }, 'Quiz questions generated successfully');
};
