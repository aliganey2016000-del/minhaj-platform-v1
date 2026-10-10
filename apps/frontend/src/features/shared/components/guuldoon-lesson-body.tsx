import { useMemo, useState, type ReactNode } from 'react';
import { Image as ImageIcon } from 'lucide-react';

/**
 * How a Guuldoon lesson is shown: callouts, summary cards, formulas, figures
 * and tappable book highlights. Shared by the student chapter view and the
 * Super Admin builder so both read the same lesson the same way.
 */

export type Relation = 'direct' | 'indirect' | 'similar' | 'derived';
export type HighlightBase = { anchorText: string; relation: Relation };

export const relationMeta: Record<Relation, { label: string; reason: string; className: string }> = {
  direct: {
    label: 'Toos',
    reason: 'Jawaabta si toos ah ayay ugu qoran tahay qaybtan buugga.',
    className: 'bg-emerald-400/20 text-emerald-500 ring-1 ring-emerald-400/35',
  },
  indirect: {
    label: 'Dadban',
    reason: 'Su’aashu waxay u baahan tahay isku-dar ama fikir ka imanaya qaybtan.',
    className: 'bg-sky-400/20 text-sky-500 ring-1 ring-sky-400/35',
  },
  similar: {
    label: 'U eg',
    reason: 'Fikradda waa isku mid, laakiin tiro ama eray ayaa la beddelay.',
    className: 'bg-amber-300/20 text-amber-500 ring-1 ring-amber-300/35',
  },
  derived: {
    label: 'Laga dhaliyay',
    reason: 'Su’aashu waxay ka dhalatay formula ama qaanuun ku jira qaybtan.',
    className: 'bg-rose-400/20 text-rose-500 ring-1 ring-rose-400/35',
  },
};


export function FormulaText({ text }: { text: string }) {
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^$]+?\$|\*\*[^*]+?\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) return <strong key={index} className="font-black">{part.slice(2, -2)}</strong>;
        const formula = part.startsWith('$') && part.endsWith('$');
        return formula
          ? <span key={index} className="mx-0.5 rounded bg-slate-500/10 px-1.5 py-0.5 font-mono text-[.95em]" dir="ltr">{part.replace(/^\$+|\$+$/g, '')}</span>
          : <span key={index}>{part}</span>;
      })}
    </>
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
}

export function HighlightedText<H extends HighlightBase>({ text, highlights, visible, onOpen }: {
  text: string;
  highlights: H[];
  visible: boolean;
  onOpen: (highlight: H) => void;
}) {
  if (!visible || !highlights.length) return <FormulaText text={text} />;

  const matches: { start: number; end: number; highlight: H }[] = [];
  highlights.forEach(highlight => {
    const words = highlight.anchorText.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const regex = new RegExp(words.map(escapeRegExp).join('\\s+'), 'i');
    const match = regex.exec(text);
    if (!match) return;
    matches.push({ start: match.index, end: match.index + match[0].length, highlight });
  });
  matches.sort((a, b) => a.start - b.start);

  const accepted: typeof matches = [];
  matches.forEach(match => {
    if (!accepted.some(previous => match.start < previous.end)) accepted.push(match);
  });
  if (!accepted.length) return <FormulaText text={text} />;

  const output: ReactNode[] = [];
  let cursor = 0;
  accepted.forEach((match, index) => {
    if (match.start > cursor) {
      output.push(<FormulaText key={'plain-' + index} text={text.slice(cursor, match.start)} />);
    }
    output.push(
      <button
        key={'highlight-' + index}
        type="button"
        className={'mx-0.5 inline rounded px-1 py-0.5 text-left font-semibold underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ' + relationMeta[match.highlight.relation].className}
        onClick={() => onOpen(match.highlight)}
        aria-label={relationMeta[match.highlight.relation].label + ': ' + match.highlight.anchorText}
      >
        <FormulaText text={text.slice(match.start, match.end)} />
      </button>,
    );
    cursor = match.end;
  });
  if (cursor < text.length) output.push(<FormulaText key="tail" text={text.slice(cursor)} />);
  return <>{output}</>;
}

const ANSWER_PATTERN = /\s*\((Answers?|Ans|Solution)[:.]\s*([\s\S]+)\)\s*$/i;

function splitAnswer(text: string): { question: string; answer: string; fromBook: boolean } {
  const match = ANSWER_PATTERN.exec(text);
  if (!match) return { question: text, answer: '', fromBook: false };
  return { question: text.slice(0, match.index).trim(), answer: match[2].trim(), fromBook: match[1].toLowerCase() !== 'solution' };
}

const FIGURE_MARKER = /\{\{fig:([^|}]+)\|([^}]*)\}\}/g;

function splitFigures(text: string): { text: string; figures: { src: string; caption: string }[] } {
  const figures: { src: string; caption: string }[] = [];
  const clean = text.replace(FIGURE_MARKER, (_all, src: string, caption: string) => {
    figures.push({ src: src.trim(), caption: caption.trim() });
    return '';
  }).replace(/\s{2,}/g, ' ').trim();
  return { text: clean, figures };
}

export function QuestionBody({ text, render }: { text: string; render: (value: string) => ReactNode }) {
  const { question, answer, fromBook } = splitAnswer(text);
  const { text: plain, figures } = splitFigures(question);
  return (
    <>
      {render(plain)}
      {figures.map((figure, index) => <span key={figure.src + index} className="mt-2 block"><InlineFigure src={figure.src} caption={figure.caption} /></span>)}
      {answer && <AnswerReveal answer={answer} fromBook={fromBook} />}
    </>
  );
}

export function AnswerReveal({ answer, fromBook, note }: { answer: string; fromBook: boolean; note?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="mt-1.5 block">
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-600">
        {open ? 'Qari jawaabta' : 'Muuji jawaabta'}
      </button>
      {open && (
        <span className="mt-2 block rounded-xl border-l-4 border-emerald-500 bg-emerald-500/10 px-3 py-2 text-sm font-semibold">
          <span className="block text-[10px] font-black uppercase tracking-wide text-emerald-600">{fromBook ? 'Jawaabta buugga' : 'Jawaabta'}</span>
          <span className="block whitespace-pre-line"><FormulaText text={answer} /></span>
          {note && <span className="mt-1.5 block text-xs font-medium text-[var(--color-text-secondary)]">{note}</span>}
        </span>
      )}
    </span>
  );
}

export function InlineFigure({ src, caption }: { src: string; caption: string }) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(false);
  return (
    <div className="rounded-2xl border border-sky-500/40 bg-sky-500/10 p-2.5">
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="flex w-full items-center gap-2 text-left text-sm font-black text-sky-500">
        <ImageIcon size={16} aria-hidden="true" />
        <span className="flex-1">{open ? 'Qari sawirka' : 'Muuji sawirka'}{caption ? ' · ' + caption : ''}</span>
      </button>
      {open && (
        <button type="button" onClick={() => setZoom(true)} className="mt-3 block w-full overflow-hidden rounded-xl bg-white shadow-sm" aria-label={'Taabo si aad u weyneyso sawirka ' + caption}>
          <img src={src} alt={caption} loading="lazy" className="mx-auto min-h-40 w-full object-contain" />
          <span className="block bg-sky-500/10 py-1 text-center text-[11px] font-bold text-sky-500">Taabo si aad u weyneyso</span>
        </button>
      )}
      {zoom && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] overflow-auto bg-black/90 p-3" onClick={() => setZoom(false)}>
          <button type="button" className="fixed right-3 top-3 z-[81] rounded-full bg-white px-4 py-2 text-sm font-black text-black" onClick={() => setZoom(false)}>Xidh</button>
          <img src={src} alt={caption} className="mx-auto mt-14 w-[200%] max-w-none sm:w-full sm:max-w-3xl" onClick={event => event.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

type LessonBlock =
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'table'; table: TableData }
  | { kind: 'callout'; tag: string; title: string; lines: string[] };

type TableData = { header: string[] | null; rows: string[][] };

const isTableLine = (line: string) => line.trim().startsWith('|');
const isSeparatorCell = (cell: string) => /^\s*:?-{2,}:?\s*$/.test(cell);
const splitCells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());

/** Markdown pipe table, one row per line. A separator row (|---|---|) marks the row above it as the header. */
function parseTable(lines: string[]): TableData {
  const rows = lines.map(splitCells);
  if (rows.length > 1 && rows[1].length > 0 && rows[1].every(isSeparatorCell)) return { header: rows[0], rows: rows.slice(2) };
  return { header: null, rows: rows.filter(row => !row.every(isSeparatorCell)) };
}

/**
 * A whole table collapsed onto one line ("| A | B | |---|---| | 1 | 2 |"), which is what a lesson looks
 * like when its line breaks were lost. The shape is regular: header, one joint, separator, one joint, rows.
 */
function parseFlatTable(line: string): TableData | null {
  const tokens = line.trim().split('|').slice(1, -1).map(token => token.trim());
  const first = tokens.findIndex(isSeparatorCell);
  const columns = first - 1;
  if (columns < 1 || tokens.slice(first, first + columns).some(token => !isSeparatorCell(token))) return null;
  const rest = tokens.slice(first + columns + 1);
  if (rest.length % (columns + 1) !== columns) return null;
  const rows: string[][] = [];
  for (let at = 0; at < rest.length; at += columns + 1) rows.push(rest.slice(at, at + columns));
  return { header: tokens.slice(0, columns), rows };
}

/** Splits callout lines into plain lines and tables so a table inside a box is drawn as a table. */
function groupCalloutLines(lines: string[]): Array<{ line: string } | { table: TableData }> {
  const out: Array<{ line: string } | { table: TableData }> = [];
  let run: string[] = [];
  const flush = () => { if (run.length) { out.push({ table: parseTable(run) }); run = []; } };
  for (const line of lines) {
    if (isTableLine(line)) run.push(line);
    else { flush(); out.push({ line }); }
  }
  flush();
  return out;
}

function LessonTable({ table, render }: { table: TableData; render: (value: string) => ReactNode }) {
  const columns = Math.max(table.header?.length || 0, ...table.rows.map(row => row.length));
  const pad = (row: string[]) => Array.from({ length: columns }, (_, index) => row[index] ?? '');
  return (
    <div role="region" aria-label="Table" tabIndex={0} className="overflow-x-auto rounded-2xl border border-emerald-500/30 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">
      <table className="min-w-full border-collapse text-left text-sm leading-6 sm:text-[15px]">
        {table.header && (
          <thead>
            <tr className="bg-gradient-to-r from-emerald-600 to-teal-500 text-white">
              {pad(table.header).map((cell, index) => <th key={index} scope="col" className="border-l border-white/20 px-3 py-2.5 text-xs font-black first:border-l-0 sm:text-sm">{render(cell)}</th>)}
            </tr>
          </thead>
        )}
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex % 2 ? 'bg-emerald-500/[.07]' : 'bg-[var(--color-surface-primary)]'}>
              {pad(row).map((cell, index) => (
                <td key={index} className={'border-l border-t border-emerald-500/15 px-3 py-2.5 align-top first:border-l-0 ' + (index === 0 ? 'font-bold' : '')}>
                  {cell ? render(cell) : <span aria-hidden="true" className="block h-5 min-w-[3.5rem]" />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function parseLesson(content: string): LessonBlock[] {
  const blocks: LessonBlock[] = [];
  content.replace(/\r/g, '').split(/\n{2,}/).forEach(raw => {
    const chunk = raw.trim();
    if (!chunk) return;
    const lines = chunk.split('\n');
    if (lines.every(line => line.startsWith('>'))) {
      const body = lines.map(line => line.replace(/^>\s?/, ''));
      const tag = /^\[!(\w+)\]\s*(.*)$/.exec(body[0] || '');
      if (tag) blocks.push({ kind: 'callout', tag: tag[1].toLowerCase(), title: tag[2].trim(), lines: body.slice(1) });
      else blocks.push({ kind: 'callout', tag: 'note', title: '', lines: body });
    } else if (lines.some(isTableLine)) {
      // Tables inside a paragraph: consecutive "|" lines are the table, the rest stays text around it.
      let text: string[] = [];
      let table: string[] = [];
      const flushText = () => {
        if (!text.length) return;
        const joined = text.join(' ');
        if (text.length === 1 && joined.startsWith('### ')) blocks.push({ kind: 'h3', text: joined.slice(4) });
        else if (text.length === 1 && joined.startsWith('## ')) blocks.push({ kind: 'h2', text: joined.slice(3) });
        else blocks.push({ kind: 'p', text: joined });
        text = [];
      };
      const flushTable = () => { if (table.length) { blocks.push({ kind: 'table', table: parseTable(table) }); table = []; } };
      lines.forEach(line => {
        if (isTableLine(line)) {
          flushText();
          const flat = table.length === 0 && line.includes('|--') ? parseFlatTable(line) : null;
          if (flat) blocks.push({ kind: 'table', table: flat });
          else table.push(line);
        } else {
          flushTable();
          text.push(line);
        }
      });
      flushTable();
      flushText();
    } else if (lines.every(line => /^- /.test(line))) {
      blocks.push({ kind: 'ul', items: lines.map(line => line.slice(2)) });
    } else if (lines.every(line => /^\d+\.\s/.test(line))) {
      blocks.push({ kind: 'ol', items: lines.map(line => line.replace(/^\d+\.\s/, '')) });
    } else if (chunk.startsWith('### ')) {
      blocks.push({ kind: 'h3', text: chunk.slice(4) });
    } else if (chunk.startsWith('## ')) {
      blocks.push({ kind: 'h2', text: chunk.slice(3) });
    } else {
      blocks.push({ kind: 'p', text: chunk.replace(/\n/g, ' ') });
    }
  });
  return blocks;
}

const calloutMeta: Record<string, { label: string; icon: string; className: string }> = {
  goal: { label: 'Hadafka cashirka', icon: '🎯', className: 'border-emerald-500/40 bg-emerald-500/10' },
  formula: { label: 'Qaanuun / Formula', icon: '🧮', className: 'border-violet-500/40 bg-violet-500/10' },
  example: { label: 'Tusaale', icon: '✏️', className: 'border-sky-500/40 bg-sky-500/10' },
  note: { label: 'Xusuusnow', icon: '💡', className: 'border-amber-500/40 bg-amber-500/10' },
  try: { label: 'Isku day', icon: '🧪', className: 'border-rose-500/40 bg-rose-500/10' },
};

const summaryPalette = [
  { band: 'from-emerald-500 to-teal-400', soft: 'border-emerald-500/30 bg-emerald-500/[.07]', text: 'text-emerald-500' },
  { band: 'from-sky-500 to-indigo-400', soft: 'border-sky-500/30 bg-sky-500/[.07]', text: 'text-sky-500' },
  { band: 'from-violet-500 to-fuchsia-400', soft: 'border-violet-500/30 bg-violet-500/[.07]', text: 'text-violet-500' },
  { band: 'from-amber-500 to-orange-400', soft: 'border-amber-500/30 bg-amber-500/[.07]', text: 'text-amber-500' },
  { band: 'from-rose-500 to-pink-400', soft: 'border-rose-500/30 bg-rose-500/[.07]', text: 'text-rose-500' },
];

export const isSummarySection = (section: { title: string }) => /^chapter summary/i.test(section.title.trim());

export function SummaryHero() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-500 to-sky-500 p-5 text-white shadow-lg shadow-emerald-600/20 sm:p-7">
      <div aria-hidden="true" className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/15 blur-sm" />
      <div aria-hidden="true" className="absolute -bottom-10 left-1/3 h-24 w-24 rounded-full bg-amber-300/25 blur-md" />
      <p className="relative text-[11px] font-black uppercase tracking-[.2em] text-white/80">⭐ Xusuusnow</p>
      <h3 className="relative mt-1 text-2xl font-black leading-tight sm:text-3xl">Waxyaabaha la xifdiyo</h3>
      <p className="relative mt-2 max-w-xl text-sm font-medium text-white/90">Kuwa sanadaha leh waa la weydiiyay imtixaanadii hore. Kuwa kale waxay ku jiraan buugga, waxaana laga yaabaa inay soo baxaan imtixaanka dambe.</p>
    </div>
  );
}

function YearChips({ years }: { years: string[] }) {
  if (!years.length) return <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-1 text-[11px] font-black text-sky-500">🔮 Laga yaabo imtixaanka dambe</span>;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-1 text-[11px] font-black text-amber-600">🔥 {years.length > 1 ? years.length + ' jeer la weydiiyay' : 'La weydiiyay'}</span>
      {years.map(year => <span key={year} className="rounded-full bg-[var(--color-surface-tertiary)] px-2 py-1 text-[11px] font-black tabular-nums">{year}</span>)}
    </span>
  );
}

export function LessonBody<H extends HighlightBase>({ content, highlights, visible, onOpen }: {
  content: string;
  highlights: H[];
  visible: boolean;
  onOpen: (highlight: H) => void;
}) {
  const blocks = useMemo(() => parseLesson(content), [content]);
  const inline = (text: string) => <HighlightedText text={text} highlights={highlights} visible={visible} onOpen={onOpen} />;
  return (
    <div className="space-y-4 text-[15px] leading-7 text-[var(--color-text-primary)] sm:text-base sm:leading-8">
      {blocks.map((block, index) => {
        if (block.kind === 'h2') return <h4 key={index} className="mt-8 flex items-center gap-2 border-b border-emerald-500/30 pb-2 text-lg font-black text-emerald-600 first:mt-0 sm:text-xl"><span className="h-5 w-1.5 rounded-full bg-emerald-500" />{inline(block.text)}</h4>;
        if (block.kind === 'h3') return <h5 key={index} className="mt-5 text-base font-black text-[var(--color-text-primary)] sm:text-lg">{inline(block.text)}</h5>;
        if (block.kind === 'p') return <div key={index}><QuestionBody text={block.text} render={inline} /></div>;
        if (block.kind === 'table') return <LessonTable key={index} table={block.table} render={inline} />;
        if (block.kind === 'ul') return <ul key={index} className="space-y-2 pl-1">{block.items.map((item, i) => <li key={i} className="flex gap-3"><span className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" /><span className="min-w-0 flex-1"><QuestionBody text={item} render={inline} /></span></li>)}</ul>;
        if (block.kind === 'ol') return <ol key={index} className="space-y-2">{block.items.map((item, i) => <li key={i} className="flex gap-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-black text-emerald-600">{i + 1}</span><span className="min-w-0 flex-1"><QuestionBody text={item} render={inline} /></span></li>)}</ol>;
        if (block.tag === 'figure' && block.lines[0]) return <InlineFigure key={index} src={block.lines[0].trim()} caption={block.title} />;
        if (block.tag === 'stats') {
          const tiles = block.lines.map(line => line.split(' | '));
          return (
            <div key={index} className="grid grid-cols-3 gap-2">
              {tiles.map(([value, label], i) => (
                <div key={i} className={'rounded-2xl bg-gradient-to-br p-3 text-center text-white shadow ' + summaryPalette[i % summaryPalette.length].band}>
                  <strong className="block text-2xl font-black tabular-nums sm:text-3xl">{value}</strong>
                  <span className="block text-[11px] font-semibold leading-tight text-white/90">{label}</span>
                </div>
              ))}
            </div>
          );
        }
        if (block.tag === 'memorize' || block.tag === 'fact' || (block.tag === 'formula' && /\s\|(\s|$)/.test(block.title))) {
          const [name, yearText = ''] = block.title.split(/\s\|\s?/);
          const years = yearText.split(',').map(item => item.trim()).filter(Boolean);
          const tone = summaryPalette[index % summaryPalette.length];
          const formula = block.tag === 'formula';
          return (
            <article key={index} className={'overflow-hidden rounded-2xl border ' + tone.soft}>
              <div className={'h-1.5 bg-gradient-to-r ' + tone.band} />
              <div className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h5 className={'flex min-w-0 items-center gap-2 text-base font-black ' + tone.text}><span aria-hidden="true">{formula ? '🧮' : block.tag === 'fact' ? '📌' : '🧠'}</span><span className="min-w-0">{name}</span></h5>
                  <YearChips years={years} />
                </div>
                <div className="mt-3 space-y-1.5">
                  {block.lines.map((line, i) => formula
                    ? i === 0
                      ? <p key={i} dir="ltr" className="overflow-x-auto rounded-xl bg-[var(--color-surface-primary)] px-3 py-2.5 text-center font-mono text-lg font-black sm:text-xl">{inline(line)}</p>
                      : <p key={i} className="text-sm leading-6 text-[var(--color-text-secondary)]">{inline(line)}</p>
                    : line.startsWith('- ')
                      ? <div key={i} className="flex gap-2"><span aria-hidden="true" className={tone.text}>●</span><span className="min-w-0 flex-1"><QuestionBody text={line.slice(2)} render={inline} /></span></div>
                      : <div key={i} className="font-semibold"><QuestionBody text={line} render={inline} /></div>)}
                </div>
              </div>
            </article>
          );
        }
        const meta = calloutMeta[block.tag] || calloutMeta.note;
        return (
          <aside key={index} className={'rounded-2xl border-l-4 p-4 ' + meta.className}>
            <p className="mb-2 text-xs font-black uppercase tracking-wide"><span aria-hidden="true">{meta.icon} </span>{meta.label}{block.title ? ' · ' + block.title : ''}</p>
            <div className="space-y-1.5">
              {groupCalloutLines(block.lines).map((segment, i) => {
                if ('table' in segment) return <LessonTable key={i} table={segment.table} render={inline} />;
                const line = segment.line;
                const bullet = line.startsWith('- ');
                if (block.tag === 'formula') return <p key={i} className="font-mono text-[.95em]" dir="ltr">{inline(line)}</p>;
                return bullet
                  ? <div key={i} className="flex gap-2"><span aria-hidden="true">•</span><span className="min-w-0 flex-1"><QuestionBody text={line.slice(2)} render={inline} /></span></div>
                  : <div key={i}><QuestionBody text={line} render={inline} /></div>;
              })}
            </div>
          </aside>
        );
      })}
    </div>
  );
}
