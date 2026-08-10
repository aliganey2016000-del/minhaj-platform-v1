/**
 * Content Blocks Import Controller — bulk-creates Interactive Gate Content
 * Blocks (each with its own Stop & Check question(s)) from an uploaded
 * Excel file or pasted spreadsheet rows, for the Lesson Editor's "Import"
 * option (alongside "AI Generate").
 *
 * Stateless — this only PARSES the file and hands the block/question data
 * back to the frontend. Unlike course-content.controller's importContent
 * (which writes chapters/lessons straight to the database), Content Blocks
 * live inside one Lesson document's `contentBlocks` array and only ever
 * get saved through the normal Lesson Editor "Save Lesson" → Course
 * Builder "Save All Changes" flow, so there's no courseId/lessonId to
 * write against here — the caller just appends the parsed blocks to its
 * local state exactly like the "+ Add Content Block" and "AI Generate"
 * buttons already do.
 *
 * See also course-content.controller's importContentBlocksForCourse — the
 * course-wide, multi-lesson sibling of this importer, which writes straight
 * to the DB and shares this file's row-grouping logic via
 * utils/content-blocks-parser.ts and this file's AI-prompt sheet builders.
 */
import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import { BadRequestError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { parseBlockRows } from '../utils/content-blocks-parser';

// ---------------------------------------------------------------------------
// Ready-to-copy AI prompts — shipped as extra sheets in the downloadable
// template, so an admin can hand their raw lesson text to any chat AI
// (ChatGPT, DeepSeek, ...) and get back rows in EXACTLY this importer's
// column format, instead of writing the spreadsheet by hand. Two variants
// because "paraphrase this" and "don't touch my wording" need opposite
// instructions — same table contract either way. Exported so the course-wide
// bulk importer's template can reuse the exact same prompt sheets.
// ---------------------------------------------------------------------------

const PROMPT_TABLE_CONTRACT = `Output ONLY a table with these exact columns, in this exact order, as TAB-SEPARATED values (so I can paste it straight into Excel) — one row per question, repeating the same Block Title on every question row that belongs to the same block:

Block Title	Block Content (plain text or Markdown)	Min Read Seconds	Question Type (mcq or true_false)	Question Text	Option 1	Option 2	Option 3	Correct Answer (mcq: 1/2/3, true_false: TRUE/FALSE)	Explanation

Rules:
- Put the Block Content only on the FIRST row of each block — leave it blank on that block's other question rows.
- For mcq questions: fill Option 1, Option 2, and Option 3, and set Correct Answer to the option NUMBER (1, 2, or 3).
- For true_false questions: leave Option 1, Option 2, and Option 3 blank, and set Correct Answer to TRUE or FALSE.
- Min Read Seconds can just be 30 for every block unless I say otherwise.
- Do not add any commentary, headers, or explanation before or after the table — output the table rows only.`;

function buildPromptSheetLines(title: string, bodyInstruction: string): string[] {
  return [
    title,
    '='.repeat(title.length),
    '',
    'HOW TO USE: edit the <<...>> placeholders below, then send the WHOLE prompt to your AI (ChatGPT, DeepSeek, etc) — either paste your lesson text where shown at the bottom, OR attach/upload a PDF (or Word/PowerPoint) file of the lesson to the chat instead and leave that placeholder as-is; the prompt already tells the AI to read the attached file. Copy the AI\'s reply and paste it into this importer\'s "Manual Copy & Paste" option.',
    '',
    'EDIT THESE PLACEHOLDERS BEFORE SENDING:',
    '- <<NUMBER_OF_BLOCKS>> — how many content blocks to split the lesson into (e.g. 4)',
    '- <<QUESTIONS_PER_BLOCK>> — how many questions per block (e.g. 1 to 3)',
    '- <<QUESTION_TYPES>> — mcq, true_false, or "a mix of mcq and true_false"',
    '',
    '-----------------------------------------------------------------',
    'PROMPT — copy everything from here down:',
    '',
    'You are helping me prepare an interactive lesson for a Learning Management System. My lesson source text is either pasted at the end of this message, or attached to this chat as a file (PDF, Word, or PowerPoint) — if a file is attached, read it and use its full content as the source text instead of the placeholder text below.',
    '',
    bodyInstruction,
    '',
    PROMPT_TABLE_CONTRACT,
    '',
    'Here is my lesson source text (ignore this line if I attached a file instead):',
    '',
    '<<PASTE YOUR LESSON TEXT HERE, OR LEAVE THIS AS-IS IF YOU ATTACHED A PDF/DOC FILE INSTEAD>>',
  ];
}

export const PARAPHRASE_PROMPT_LINES = buildPromptSheetLines(
  'AI LESSON IMPORT PROMPT — Paraphrase Mode',
  'Rewrite the text in clearer, more polished language while preserving every fact and idea (a paraphrase/polish pass, not new invented content), then split the result into exactly <<NUMBER_OF_BLOCKS>> content blocks. For each block, write <<QUESTIONS_PER_BLOCK>> comprehension question(s) of type <<QUESTION_TYPES>>, answerable purely from that block\'s own content.'
);

// Exact Wording Mode is a fully-written, ready-to-send prompt (Somali,
// hardcoded to 3 MCQ questions per block) rather than the generic
// placeholder-driven template above — supplied directly by the school,
// so it's kept verbatim rather than run through buildPromptSheetLines.
export const PRESERVE_PROMPT_LINES = [
  'PROMPT: Buug u badal Content-Blocks Excel (qoraal aan la badalin + 3 MCQ block kasta)',
  '',
  'Waxaan kuu soo lifaaqay (1) template-ka Excel-ka iyo (2) buugga/PDF-ka. Fadlan Excel-ka ka dhis buugga adigoo raacaya tilmaamahan:',
  '',
  '1. QAABKA GUUD',
  '- Isticmaal isla sheet-ka template-ka ku jira ("Example — edit Chapter & Lesson"). Ha sameyn sheet cusub, hana ka tegin xogtii hore ee sheet-kaas ku jirtay (tirtir oo cusub ku qor).',
  '- Safafka: Chapter Title, Lesson Title, Block Title, Block Content, Min Read Seconds, Question Type, Question Text, Option 1, Option 2, Option 3, Correct Answer, Explanation.',
  '',
  '2. CHAPTER IYO LESSON',
  '- Haddii buuggu leeyahay "Unit"/"Cutub"/"Cashar" oo kala duwan Lesson, isticmaal magacooda asalka ah (tusaale: "Unit 9: Human Organ Systems").',
  '- Haddii buuggu KALIYA leeyahay "Lesson N: Magaca" (aan lahayn "Chapter" gooni ah), markaa:',
  '  - Column A (Chapter Title) = "Chapter N: Magaca"',
  '  - Column B (Lesson Title) = "Lesson N: Magaca"',
  '  (Labadaba isku lambar iyo isku magac ah, laakiin erayga "Chapter" iyo "Lesson" mid waliba sax uga jira column-kiisa — ha isku daba marin.)',
  '',
  '3. BLOCK (Cinwaanka iyo Qoraalka)',
  '- Unug kasta oo dabiici ah oo buugga ka mid ah (passage, cutub-hoosaad, cashar-hoosaad) = hal BLOCK.',
  '- Block Title = magaca/cinwaanka unugga, lagu daro lambarka si mid kastaa gaar u noqdo (tusaale: "Passage 1: The Red Cup").',
  '- Block Content = qoraalka unugga oo SAX AH, sida uu buugga ugu qoran yahay — HA WAXBA KA BADALIN, ha ku darin, hana ka saarin. Haddii buugu yahay sawir/scan ah, si taxaddar leh bog kasta u eeg (ha isku hallayn OCR otomaatig ah oo keliya); haddii eray aanad 100% hubin, calaamadi si cad.',
  '- Block Content iyo Min Read Seconds waxa laga qoraa KELIYA safka ugu horreeya ee block-kaas (kuwa kale ha ka bannaan yihiin).',
  '',
  '4. 3 MCQ BLOCK KASTA',
  '- Su\'aal kasta waa in ay ku salaysan tahay xaqiiq/qoraal ku jira block-ka qudhiisa — ha been-abuurin, hana ka fekerin wax aan qoraalku sheegin.',
  '- Isticmaal noocyo kala duwan oo su\'aalo ah si aanay isku nooc noqon (tusaale: fikradda ugu weyn/ujeeddada, eray ama xaqiiq gaar ah, faah-faahin/natiijo).',
  '- Saddexda ikhtiyaar (options) waa in mid saxa ah leeyahay, labana khaldan yihiin laakiin macquul ah (ka soo qaad qaybo kale oo buugga ah, ha ka dhigin kuwo bin-macquul ah).',
  '- Beddelbeddel meesha jawaabta saxda ahi ku jirto (1, 2 ama 3) — ha marwalba isku meel ku jirin dhammaan su\'aalaha.',
  '- Explanation gaaban oo lagu sax-sheego jawaabta, oo ku salaysan qoraalka.',
  '',
  '5. HUBINTA KA HOR INTAANAD SOO GUDBIN',
  '- Chapter/Lesson/Block Title-ku waa in ay saf walba oo block-kaas ka mid ah ku sugan yihiin isku si.',
  '- Block kasta 3 saf (3 su\'aal) oo Question Type = mcq.',
  '- Dhammaan 3-da ikhtiyaar (Option 1/2/3) waa in ay buuxaan, Correct Answer-na (1/2/3) sax.',
  '- Block Title kastaa waa in uu ka duwan yahay kuwa kale (aan isku mid ahayn).',
  '- Ma jirto saf aan buuxin (blank) oo aan ku jirin qaybo la filayo in ay bannaan yihiin (Block Content/Min Read ee safafka 2aad iyo 3aad).',
  '',
  'Marka aad dhammayso, ii soo koob: immisa block, immisa su\'aal, iyo haddii ay jirto qayb aad ka shakisan tahay saxnaanteeda (tusaale qoraal aad u adag ama sawir aan cad ahayn).',
];

/** Appends the two ready-to-copy AI-prompt sheets to a workbook — shared by this importer's template and the course-wide bulk importer's template. */
export function appendAiPromptSheets(workbook: XLSX.WorkBook): void {
  const paraphraseSheet = XLSX.utils.aoa_to_sheet(PARAPHRASE_PROMPT_LINES.map((line) => [line]));
  paraphraseSheet['!cols'] = [{ wch: 120 }];

  const preserveSheet = XLSX.utils.aoa_to_sheet(PRESERVE_PROMPT_LINES.map((line) => [line]));
  preserveSheet['!cols'] = [{ wch: 120 }];

  XLSX.utils.book_append_sheet(workbook, paraphraseSheet, 'AI Prompt - Paraphrase');
  XLSX.utils.book_append_sheet(workbook, preserveSheet, 'AI Prompt - Exact Wording');
}

// ---------------------------------------------------------------------------
// GET /api/v1/content-blocks-import/template — download the import template
// ---------------------------------------------------------------------------
export const downloadContentBlocksTemplate = async (_req: Request, res: Response): Promise<void> => {
  const headers = [
    'Block Title', 'Block Content (plain text or Markdown)', 'Min Read Seconds (optional)',
    'Question Type (mcq or true_false)', 'Question Text', 'Option 1', 'Option 2', 'Option 3',
    'Correct Answer (mcq: 1/2/3, true_false: TRUE/FALSE)', 'Explanation (optional)',
  ];
  // Every sample block repeats its title across 3 rows — one row per
  // checkpoint question — so the "same Block Title = same block" grouping
  // rule is obvious at a glance. This is just the default: add more rows
  // (with the same Block Title) for more questions on a block, or delete
  // rows down to just 1 for a single-question block.
  const rows = [
    ['Introduction to Salaah', 'Salaah is the second pillar of Islam, performed five times a day.', '30', 'mcq', 'What is Salaah?', 'The second pillar of Islam', 'A type of charity', 'A pilgrimage', '1', 'Salaah refers to the ritual prayer performed five times daily.'],
    ['Introduction to Salaah', '', '', 'true_false', 'Salaah is performed only once a day.', '', '', '', 'FALSE', 'Salaah is performed five times a day, not once.'],
    ['Introduction to Salaah', '', '', 'mcq', 'Which pillar of Islam is Salaah?', 'The first', 'The second', 'The third', '2', ''],
    ['Times of Prayer', 'There are five daily prayers: Fajr, Dhuhr, Asr, Maghrib, and Isha.', '30', 'mcq', 'How many daily prayers are there?', '3', '5', '7', '2', ''],
    ['Times of Prayer', '', '', 'mcq', 'Which prayer is performed at dawn?', 'Fajr', 'Dhuhr', 'Isha', '1', ''],
    ['Times of Prayer', '', '', 'true_false', 'Maghrib is prayed after sunset.', '', '', '', 'TRUE', 'Maghrib is performed just after the sun sets.'],
  ];
  // buildXlsxBuffer only builds a single-sheet workbook — build this one
  // directly with 3 sheets: the data template, plus the two AI prompt
  // sheets (each a single wide column of text, one line per row so it
  // reads naturally in Excel and is easy to select-all and copy).
  const templateSheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  templateSheet['!cols'] = headers.map((h) => ({ wch: Math.min(Math.max(h.length + 2, 20), 50) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, templateSheet, 'Content Blocks Template');
  appendAiPromptSheets(workbook);
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument/spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=content-blocks-template.xlsx');
  res.end(buffer);
};

// ---------------------------------------------------------------------------
// POST /api/v1/content-blocks-import/parse — parse an uploaded file into
// Content Blocks + questions. Rows sharing a Block Title group into one
// block; each row with a Question Text becomes one question on that block.
// ---------------------------------------------------------------------------
export const parseContentBlocksImport = async (req: Request, res: Response): Promise<Response> => {
  if (!req.file) throw new BadRequestError('An Excel or CSV file is required (field name "file")');

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequestError('The uploaded file has no sheets');

  const sheetRows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], { defval: '' });
  if (sheetRows.length === 0) throw new BadRequestError('The uploaded file has no data rows');

  // +1 for 0-index, +1 for the header row already stripped by sheet_to_json
  const rows = sheetRows.map((data, i) => ({ rowNum: i + 2, data }));
  const { blocks, errors, hadAnyBlock } = await parseBlockRows(rows);

  if (!hadAnyBlock) {
    throw new BadRequestError('No valid rows found to import — every row was missing a Block Title.');
  }
  if (blocks.length === 0) {
    throw new BadRequestError('No blocks had any Block Content — nothing to import.');
  }

  return ApiResponse.success(res, { blocks, errors }, 'Content blocks parsed successfully');
};
