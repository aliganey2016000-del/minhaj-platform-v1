/**
 * RichTextEditor — Code/Visual toggle over a single HTML string.
 *
 * Visual tab: Tiptap WYSIWYG editor (contenteditable) with a full
 * formatting toolbar, including typography (font family/size/color)
 * and per-block RTL support for Arabic content. Edits call `onChange`
 * with the serialized HTML on every keystroke.
 * Code tab: plain auto-resizing textarea over the same HTML string.
 * Both tabs read from and write to the same `value` prop, so switching
 * tabs never loses or duplicates content.
 */

import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Placeholder from '@tiptap/extension-placeholder';
import { TextStyle, FontFamily, FontSize, Color } from '@tiptap/extension-text-style';
import { BlockDirection } from './tiptap-text-direction';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const PROSE_CLASSES =
  'prose prose-sm dark:prose-invert max-w-none focus:outline-none ' +
  '[&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-bold [&_h3]:text-base [&_h3]:font-semibold [&_p]:mb-2 ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_img]:rounded-lg [&_img]:max-w-full ' +
  '[&_blockquote]:border-l-4 [&_blockquote]:border-primary-400 [&_blockquote]:pl-3 [&_blockquote]:italic ' +
  // Task lists — no bullet, checkbox + label laid out inline
  '[&_ul[data-type="taskList"]]:list-none [&_ul[data-type="taskList"]]:pl-0 ' +
  '[&_ul[data-type="taskList"]_li]:flex [&_ul[data-type="taskList"]_li]:items-start [&_ul[data-type="taskList"]_li]:gap-2 ' +
  '[&_ul[data-type="taskList"]_li>label]:mt-0.5 [&_ul[data-type="taskList"]_li>div]:flex-1 ' +
  // Tables
  '[&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[var(--color-border-default)] [&_td]:p-2 ' +
  '[&_th]:border [&_th]:border-[var(--color-border-default)] [&_th]:p-2 [&_th]:bg-[var(--color-surface-tertiary)] [&_th]:text-left ' +
  // RTL blocks — right-aligned with generous line-height for Arabic scripts
  '[&_[dir="rtl"]]:text-right [&_[dir="rtl"]]:leading-[1.9] ' +
  // Placeholder (empty first paragraph)
  '[&_p.is-editor-empty:first-child::before]:text-[var(--color-text-tertiary)] [&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_p.is-editor-empty:first-child::before]:float-left [&_p.is-editor-empty:first-child::before]:h-0 [&_p.is-editor-empty:first-child::before]:pointer-events-none';

const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: 'Default', value: '' },
  { label: 'Sans (Inter)', value: 'Inter, system-ui, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Monospace', value: '"JetBrains Mono", "Fira Code", monospace' },
  { label: 'Amiri (Arabic)', value: 'Amiri, serif' },
  { label: 'Scheherazade New (Arabic)', value: '"Scheherazade New", serif' },
  { label: 'Cairo (Arabic)', value: 'Cairo, sans-serif' },
];

const FONT_SIZES: { label: string; value: string }[] = [
  { label: 'Default', value: '' },
  { label: 'Small — 12px', value: '12px' },
  { label: 'Small — 14px', value: '14px' },
  { label: 'Medium — 16px', value: '16px' },
  { label: 'Medium — 18px', value: '18px' },
  { label: 'Large — 20px', value: '20px' },
  { label: 'Large — 24px', value: '24px' },
  { label: 'X-Large — 28px', value: '28px' },
  { label: 'X-Large — 32px', value: '32px' },
  { label: 'XX-Large — 36px', value: '36px' },
];

const COLOR_SWATCHES = [
  '#0f172a', '#475569', '#dc2626', '#ea580c',
  '#d97706', '#16a34a', '#059669', '#0891b2',
  '#2563eb', '#4f46e5', '#7c3aed', '#db2777',
];

function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep editor selection/focus while clicking
      onClick={onClick}
      className={`min-w-[1.75rem] rounded-md px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active
          ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'
      }`}
    >
      {label}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 my-1 h-4 w-px flex-shrink-0 bg-[var(--color-border-default)]" />;
}

function ToolbarSelect({
  title,
  value,
  options,
  onChange,
  widthClass = 'w-28',
}: {
  title: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
  widthClass?: string;
}) {
  return (
    <select
      title={title}
      value={value}
      onMouseDown={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value)}
      className={`${widthClass} rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-1.5 py-1 text-xs text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-primary-400`}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function ColorPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentColor = (editor.getAttributes('textStyle').color as string | undefined) || '';

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const applyColor = (color: string) => {
    editor.chain().focus().setColor(color).run();
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        title="Font color"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
      >
        <span
          className="h-3.5 w-3.5 rounded-full border border-[var(--color-border-default)]"
          style={{ backgroundColor: currentColor || 'transparent' }}
        />
        A
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2 shadow-lg">
          <div className="grid grid-cols-6 gap-1 mb-2">
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyColor(c)}
                className="h-5 w-5 rounded-full border border-[var(--color-border-default)] hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-tertiary)] cursor-pointer">
              <input
                type="color"
                value={currentColor || '#000000'}
                onChange={(e) => applyColor(e.target.value)}
                className="h-5 w-8 cursor-pointer rounded border border-[var(--color-border-default)]"
              />
              Custom
            </label>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().unsetColor().run();
                setOpen(false);
              }}
              className="text-[10px] text-[var(--color-text-tertiary)] hover:text-red-500 ml-auto"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', previousUrl || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const addImage = () => {
    const url = window.prompt('Image URL');
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  };

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const inTable = editor.isActive('table');

  // An RTL block is one whose current paragraph/heading has dir="rtl".
  const isRtl = editor.isActive('paragraph', { dir: 'rtl' }) || editor.isActive('heading', { dir: 'rtl' });
  const toggleDirection = () => {
    editor
      .chain()
      .focus()
      .setBlockDirection(isRtl ? 'ltr' : 'rtl')
      .setTextAlign(isRtl ? 'left' : 'right')
      .run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2 py-1.5 rounded-t-lg max-h-40 overflow-y-auto">
      {/* History */}
      <ToolbarButton title="Undo" label="↺" onClick={() => editor.chain().focus().undo().run()} />
      <ToolbarButton title="Redo" label="↻" onClick={() => editor.chain().focus().redo().run()} />
      <Divider />

      {/* Text styles */}
      <ToolbarButton title="Bold" label="B" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolbarButton title="Italic" label="I" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolbarButton title="Underline" label="U" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <ToolbarButton title="Strikethrough" label="S" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
      <ToolbarButton title="Inline code" label="`" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} />
      <ToolbarButton title="Quote" label="❝" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <Divider />

      {/* Headings */}
      <ToolbarButton title="Paragraph" label="¶" active={editor.isActive('paragraph')} onClick={() => editor.chain().focus().setParagraph().run()} />
      <ToolbarButton title="Heading 1" label="H1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
      <ToolbarButton title="Heading 2" label="H2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <ToolbarButton title="Heading 3" label="H3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
      <Divider />

      {/* Lists */}
      <ToolbarButton title="Bullet list" label="•≡" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolbarButton title="Numbered list" label="1≡" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <ToolbarButton title="Task list" label="☑" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} />
      <Divider />

      {/* Alignment */}
      <ToolbarButton title="Align left" label="⟸" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
      <ToolbarButton title="Align center" label="≡" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} />
      <ToolbarButton title="Align right" label="⟹" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} />
      <Divider />

      {/* Arabic / RTL */}
      <ToolbarButton
        title="Toggle Arabic (RTL) direction for this block"
        label="ع RTL"
        active={isRtl}
        onClick={toggleDirection}
      />
      <Divider />

      {/* Typography */}
      <ToolbarSelect
        title="Font family"
        value={(editor.getAttributes('textStyle').fontFamily as string) || ''}
        options={FONT_FAMILIES}
        onChange={(v) => (v ? editor.chain().focus().setFontFamily(v).run() : editor.chain().focus().unsetFontFamily().run())}
        widthClass="w-32"
      />
      <ToolbarSelect
        title="Font size"
        value={(editor.getAttributes('textStyle').fontSize as string) || ''}
        options={FONT_SIZES}
        onChange={(v) => (v ? editor.chain().focus().setFontSize(v).run() : editor.chain().focus().unsetFontSize().run())}
        widthClass="w-28"
      />
      <ColorPicker editor={editor} />
      <Divider />

      {/* Insertions */}
      <ToolbarButton title="Insert link" label="🔗" active={editor.isActive('link')} onClick={setLink} />
      <ToolbarButton title="Insert image" label="🖼️" onClick={addImage} />
      <ToolbarButton title="Insert table" label="⊞" onClick={insertTable} />

      {/* Contextual table controls */}
      {inTable && (
        <>
          <Divider />
          <ToolbarButton title="Add row" label="+row" onClick={() => editor.chain().focus().addRowAfter().run()} />
          <ToolbarButton title="Add column" label="+col" onClick={() => editor.chain().focus().addColumnAfter().run()} />
          <ToolbarButton title="Delete row" label="-row" onClick={() => editor.chain().focus().deleteRow().run()} />
          <ToolbarButton title="Delete column" label="-col" onClick={() => editor.chain().focus().deleteColumn().run()} />
          <ToolbarButton title="Delete table" label="🗑table" onClick={() => editor.chain().focus().deleteTable().run()} />
        </>
      )}
    </div>
  );
}

export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const [tab, setTab] = useState<'visual' | 'code'>('visual');
  const codeRef = useRef<HTMLTextAreaElement>(null);

  // A lightweight tick to force the toolbar to re-render on plain cursor
  // movement, so active states (bold/heading/RTL/etc.) reflect the new
  // selection even when it doesn't otherwise trigger onUpdate.
  const [, setTick] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: placeholder || 'Start typing...' }),
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      BlockDirection.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: `${PROSE_CLASSES} min-h-[6rem] px-3 py-2` },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    onSelectionUpdate: () => setTick((t) => t + 1),
  });

  // Keep the visual editor in sync when the value changes from outside
  // (i.e. the user edited the Code tab) without fighting live typing.
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  }, [value, editor]);

  // Auto-resize the code textarea to fit its content, no scrollbar.
  useEffect(() => {
    const el = codeRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, tab]);

  return (
    <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden">
      <div className="flex items-center justify-between bg-[var(--color-surface-tertiary)] px-2 py-1">
        <div className="inline-flex rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-0.5">
          <button
            type="button"
            onClick={() => setTab('visual')}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              tab === 'visual' ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            👁 Visual
          </button>
          <button
            type="button"
            onClick={() => setTab('code')}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              tab === 'code' ? 'bg-primary-600 text-white shadow-sm' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {'</>'} Code
          </button>
        </div>
      </div>

      {tab === 'visual' ? (
        editor ? (
          <div>
            <Toolbar editor={editor} />
            <div className="max-h-[28rem] overflow-y-auto">
              <EditorContent editor={editor} />
            </div>
          </div>
        ) : (
          <div className="min-h-[8rem] animate-pulse bg-[var(--color-surface-secondary)]" />
        )
      ) : (
        <textarea
          ref={codeRef}
          rows={4}
          className="w-full resize-none overflow-hidden bg-[var(--color-surface-primary)] px-3 py-2 text-sm font-mono focus:outline-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

export default RichTextEditor;
