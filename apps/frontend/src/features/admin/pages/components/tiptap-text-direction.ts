/**
 * BlockDirection — a small custom Tiptap extension that adds an opt-in
 * `dir` attribute to block nodes, so lessons with mixed Arabic/English
 * content can flip individual paragraphs/headings to RTL and have that
 * survive as real `dir="rtl"` in the saved HTML.
 *
 * Tiptap v3's core ships its own built-in `setTextDirection`/`unsetTextDirection`
 * commands, but pairing them with a *default* direction (required for the
 * `dir` attribute to actually persist) makes every node render `dir="ltr"`
 * unconditionally — not what we want here. This extension only ever
 * renders `dir` on nodes the user explicitly flipped, so command names are
 * deliberately different (`setBlockDirection`/`unsetBlockDirection`) to
 * avoid colliding with core's global command typings.
 */

import { Extension } from '@tiptap/core';

export type BlockDirectionValue = 'ltr' | 'rtl';

export interface BlockDirectionOptions {
  types: string[];
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockDirection: {
      setBlockDirection: (direction: BlockDirectionValue) => ReturnType;
      unsetBlockDirection: () => ReturnType;
    };
  }
}

export const BlockDirection = Extension.create<BlockDirectionOptions>({
  name: 'blockDirection',

  addOptions() {
    return { types: ['heading', 'paragraph'] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          dir: {
            default: null,
            parseHTML: (element) => element.getAttribute('dir') || null,
            renderHTML: (attributes) => (attributes.dir ? { dir: attributes.dir } : {}),
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setBlockDirection:
        (direction: BlockDirectionValue) =>
        ({ commands }) =>
          this.options.types.every((type) => commands.updateAttributes(type, { dir: direction })),
      unsetBlockDirection:
        () =>
        ({ commands }) =>
          this.options.types.every((type) => commands.resetAttributes(type, 'dir')),
    };
  },
});

export default BlockDirection;
