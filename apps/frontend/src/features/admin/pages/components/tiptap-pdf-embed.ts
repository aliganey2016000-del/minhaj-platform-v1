/**
 * PdfEmbed — a custom Tiptap node that embeds a PDF document directly in
 * lesson content as a block-level <iframe>, instead of only offering it as
 * a downloadable link in the Attachments list below the editor.
 *
 * Renders as `<iframe class="pdf-embed" data-pdf-embed src="...">` so it
 * round-trips through saved HTML and is recognized back into this node
 * when the editor re-parses existing content. The `src`/`class`/`frameborder`
 * attributes are already on the shared sanitize-html.ts allowlist, so no
 * changes were needed there — this node just teaches the WYSIWYG editor to
 * treat that markup as a first-class block instead of stripping it as an
 * unknown element.
 */

import { Node, mergeAttributes } from '@tiptap/core';

export interface PdfEmbedOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pdfEmbed: {
      setPdfEmbed: (options: { src: string }) => ReturnType;
    };
  }
}

export const PdfEmbed = Node.create<PdfEmbedOptions>({
  name: 'pdfEmbed',
  group: 'block',
  atom: true,
  draggable: true,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute('src'),
        renderHTML: (attributes) => ({ src: attributes.src }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'iframe[data-pdf-embed]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'iframe',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-pdf-embed': '',
        class: 'pdf-embed',
        frameborder: '0',
        width: '100%',
        height: '600',
      }),
    ];
  },

  addCommands() {
    return {
      setPdfEmbed:
        (options: { src: string }) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: options }),
    };
  },
});

export default PdfEmbed;
