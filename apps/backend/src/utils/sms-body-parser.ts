import express, { NextFunction, Request, Response } from 'express';

/** Escapes raw line breaks and tabs that sit inside JSON strings (forwarder apps do not always escape the SMS text). */
function escapeControlCharsInStrings(raw: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of raw) {
    if (inString) {
      if (escaped) { escaped = false; out += ch; continue; }
      if (ch === '\\') { escaped = true; out += ch; continue; }
      if (ch === '"') { inString = false; out += ch; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch;
    } else {
      if (ch === '"') inString = true;
      out += ch;
    }
  }
  return out;
}

/** Turns a webhook payload into an object: JSON, JSON with unescaped line breaks, form data, or plain text (used as the message). */
export function parseSmsPayload(raw: string): Record<string, unknown> {
  const text = raw.trim();
  if (!text) return {};
  for (const candidate of [text, escapeControlCharsInStrings(text)]) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
    } catch { /* try the next form */ }
  }
  if (/^[\w.%-]+=/.test(text) && !text.includes(' ')) {
    const form = Object.fromEntries(new URLSearchParams(text));
    if (Object.keys(form).length) return form;
  }
  return { body: text };
}

/**
 * Body parser for the SMS webhook only. It runs before the global JSON parser (which would answer 400 to
 * a payload with unescaped line breaks and make the forwarder app retry forever) and marks the body as parsed.
 */
export const smsWebhookBodyParser = [
  express.text({ type: () => true, limit: '100kb' }),
  (req: Request, _res: Response, next: NextFunction) => {
    req.body = parseSmsPayload(typeof req.body === 'string' ? req.body : '');
    next();
  },
];
