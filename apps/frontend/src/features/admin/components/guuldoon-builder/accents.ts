/** Full class names so Tailwind keeps them. Chapters cycle through these in order. */
export const ACCENTS = [
  { soft: 'bg-emerald-500/10', text: 'text-emerald-500', solid: 'bg-emerald-500' },
  { soft: 'bg-sky-500/10', text: 'text-sky-500', solid: 'bg-sky-500' },
  { soft: 'bg-amber-500/10', text: 'text-amber-500', solid: 'bg-amber-500' },
  { soft: 'bg-violet-500/10', text: 'text-violet-500', solid: 'bg-violet-500' },
  { soft: 'bg-rose-500/10', text: 'text-rose-500', solid: 'bg-rose-500' },
] as const;

export const accentFor = (index: number) => ACCENTS[index % ACCENTS.length];

export function masteryTone(value: number) {
  if (value < 50) return { text: 'text-red-500', bar: 'bg-red-500' };
  if (value < 75) return { text: 'text-amber-500', bar: 'bg-amber-500' };
  return { text: 'text-emerald-500', bar: 'bg-emerald-500' };
}
